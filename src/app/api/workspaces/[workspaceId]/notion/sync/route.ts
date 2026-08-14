import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, readJson } from "@/lib/http";
import { scope } from "@/lib/workspace";
import { fetchPageContent, listDatabasePages } from "@/lib/notion";
import { isAiEnabled, resolvePriorityWithAI, summarizeHandover } from "@/lib/claude";
import { normalizePriority } from "@/lib/priority";
import { toHandoverListDTO } from "@/lib/serialize";
import type { SyncResultDTO } from "@/types/api";

type Ctx = { params: Promise<{ workspaceId: string }> };

const Body = z
  .object({
    /** 몇 건까지 가져올지. 데모에선 3~5 가 적당(각 건마다 AI 호출이 들어감). */
    limit: z.number().int().min(1).max(20).default(5),
    /**
     * partner: 인수인계를 파트너 팀 쪽에 꽂는다 (기본. "우리가 넘긴다"는 방향)
     * self   : 우리 팀 안에서만 본다
     */
    target: z.enum(["partner", "self"]).default("partner"),
    /** 이미 있는 건도 AI 요약을 다시 돌릴지 */
    force: z.boolean().default(false),
  })
  .default({ limit: 5, target: "partner", force: false });

/**
 * POST /api/workspaces/:workspaceId/notion/sync
 *
 * 이 서비스의 심장. Notion 데이터베이스 → 인수인계 카드.
 *
 *   1. Notion DB 의 페이지 목록을 최근 수정순으로 가져옴
 *   2. 각 페이지의 블록을 평문으로 펼침
 *   3. Claude 로 요약 / 변경사항 / 업무맥락 / 추가확인 / 우선순위 생성
 *   4. HandoverItem 으로 upsert (sourceRef = Notion page id 기준)
 *
 * ANTHROPIC_API_KEY 가 없으면 AI 없이 원문만 저장합니다 (aiUsed:false, warnings 에 안내).
 * 데모 중 Notion 이 안 붙어도 seed 데이터가 이미 들어가 있으니 화면은 죽지 않습니다.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  const { link, partner } = await scope(req, workspaceId);

  const raw = await readJson(req).catch(() => ({}));
  const body = Body.parse(raw ?? {});

  const conn = await prisma.connection.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "NOTION" } },
  });
  const config = (conn?.config ?? {}) as { token?: string; databaseId?: string };
  const token = config.token || process.env.NOTION_TOKEN;
  const databaseId = config.databaseId || process.env.NOTION_DATABASE_ID;

  if (!token || !databaseId) {
    throw new ApiError(
      409,
      "NOTION_NOT_CONNECTED",
      "Notion 연결이 없습니다. 연결 관리에서 토큰과 데이터베이스 ID 를 먼저 등록하세요.",
    );
  }

  const targetWorkspaceId =
    body.target === "partner" && partner ? partner.id : workspaceId;

  const warnings: string[] = [];
  if (body.target === "partner" && !partner) {
    warnings.push("연결된 파트너 팀이 없어 우리 팀 워크스페이스에 저장했습니다.");
  }
  const aiEnabled = isAiEnabled();
  if (!aiEnabled) {
    warnings.push("ANTHROPIC_API_KEY 가 없어 AI 요약 없이 원문만 저장했습니다.");
  }

  let pages;
  try {
    pages = await listDatabasePages(databaseId, token, body.limit);
  } catch (e) {
    await prisma.connection
      .update({
        where: { workspaceId_provider: { workspaceId, provider: "NOTION" } },
        data: {
          status: "ERROR",
          lastError: e instanceof Error ? e.message : "알 수 없는 오류",
        },
      })
      .catch(() => undefined);
    throw e;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const touchedIds: string[] = [];

  for (const page of pages) {
    const existing = await prisma.handoverItem.findFirst({
      where: {
        workspaceId: targetWorkspaceId,
        sourceProvider: "NOTION",
        sourceRef: page.pageId,
      },
    });

    const pageEditedAt = new Date(page.lastEditedTime);
    const unchanged =
      existing?.sourceEditedAt != null &&
      existing.sourceEditedAt.getTime() >= pageEditedAt.getTime();

    if (existing && unchanged && !body.force) {
      skipped++;
      touchedIds.push(existing.id);
      continue;
    }

    const content = await fetchPageContent(page, token);

    // ── AI ────────────────────────────────────────
    let summary: string | null = null;
    let changes: unknown = null;
    let workContext: string | null = null;
    let openQuestions: unknown = null;
    let aiModel: string | null = null;
    let aiGeneratedAt: Date | null = null;

    const ruled = normalizePriority(page.rawPriority);
    let priority = ruled.priority;
    let priorityReason = ruled.reason;

    if (aiEnabled) {
      const ai = await summarizeHandover({
        title: content.title,
        rawContent: content.text,
        rawPriority: page.rawPriority,
        author: page.author,
      });

      if (ai) {
        summary = ai.summary;
        changes = ai.changes;
        workContext = ai.workContext;
        openQuestions = ai.openQuestions;
        aiModel = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
        aiGeneratedAt = new Date();

        if (!ruled.matched) {
          // 규칙이 못 맞춘 경우에만 AI 판단을 채택
          priority = ai.suggestedPriority;
          priorityReason = ai.priorityReason || ruled.reason;
        }
      } else {
        warnings.push(`"${content.title}" 요약 생성에 실패해 원문만 저장했습니다.`);
        const fallback = await resolvePriorityWithAI({
          rawPriority: page.rawPriority,
          title: content.title,
        });
        priority = fallback.priority;
        priorityReason = fallback.reason;
      }
    }

    const data = {
      workspaceId: targetWorkspaceId,
      linkId: body.target === "partner" && link ? link.id : null,
      sourceProvider: "NOTION" as const,
      sourceRef: page.pageId,
      sourceUrl: page.url,
      sourceEditedAt: pageEditedAt,
      title: content.title,
      author: page.author,
      rawContent: content.text,
      summary,
      // 널러블 Json 컬럼에는 plain null 을 못 넣는다. Prisma.JsonNull 을 써야 함.
      changes: (changes ?? Prisma.JsonNull) as never,
      workContext,
      openQuestions: (openQuestions ?? Prisma.JsonNull) as never,
      aiModel,
      aiGeneratedAt,
      rawPriority: page.rawPriority,
      priority,
      priorityReason,
      occurredAt: pageEditedAt,
    };

    if (existing) {
      const row = await prisma.handoverItem.update({ where: { id: existing.id }, data });
      updated++;
      touchedIds.push(row.id);
    } else {
      const row = await prisma.handoverItem.create({ data });
      created++;
      touchedIds.push(row.id);
    }
  }

  await prisma.connection
    .update({
      where: { workspaceId_provider: { workspaceId, provider: "NOTION" } },
      data: { status: "CONNECTED", lastSyncedAt: new Date(), lastError: null },
    })
    .catch(() => undefined);

  const items = await prisma.handoverItem.findMany({
    where: { id: { in: touchedIds } },
    include: {
      link: { include: { workspaceA: true, workspaceB: true } },
      _count: { select: { nextActions: true } },
    },
    orderBy: [{ priority: "asc" }, { occurredAt: "desc" }],
  });

  const result: SyncResultDTO = {
    scanned: pages.length,
    created,
    updated,
    skipped,
    aiUsed: aiEnabled,
    items: items.map((h) => toHandoverListDTO(h, targetWorkspaceId)),
    warnings,
  };

  return ok(result);
});
