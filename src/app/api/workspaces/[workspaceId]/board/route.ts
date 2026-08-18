import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, readJson } from "@/lib/http";
import { scope } from "@/lib/workspace";
import { buildJiraPreview, toBoardItemDTO } from "@/lib/serialize";

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/:workspaceId/board
 * 우리가 보낸 것(OUTGOING) + 상대가 보낸 것(INCOMING) 을 한 번에 돌려줍니다.
 * direction 필드로 좌우/탭을 나누세요. query: direction=OUTGOING|INCOMING 로 좁힐 수도 있습니다.
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  await scope(req, workspaceId);

  const url = new URL(req.url);
  const direction = url.searchParams.get("direction");

  const where =
    direction === "OUTGOING"
      ? { fromWorkspaceId: workspaceId }
      : direction === "INCOMING"
        ? { toWorkspaceId: workspaceId }
        : { OR: [{ fromWorkspaceId: workspaceId }, { toWorkspaceId: workspaceId }] };

  const items = await prisma.boardItem.findMany({
    where,
    include: { fromWorkspace: true, toWorkspace: true },
    orderBy: { createdAt: "desc" },
  });

  return ok(items.map((i) => toBoardItemDTO(i, workspaceId)));
});

const CreateBody = z.object({
  /** 다음 업무 화면에서 고른 업무들. 여러 개 한 번에 전달 가능. */
  nextActionIds: z.array(z.string()).min(1).optional(),
  /** 업무 없이 직접 쓰는 경우 */
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(4000).optional(),
  priority: z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]).optional(),
  /** false 면 DRAFT 로만 만들고 상대 보드에는 안 올림 (= 미리보기 패널) */
  share: z.boolean().default(false),
});

/**
 * POST /api/workspaces/:workspaceId/board
 *
 * 김건희: 공유보드 화면 흐름은 이렇게 씁니다.
 *   1) 업무 선택 → POST { nextActionIds:[...], share:false }  → DRAFT + targetPayload 로 미리보기 패널 렌더
 *   2) "전달" 클릭 → PATCH /api/board/:id { status:"SHARED" }  (또는 처음부터 share:true)
 *
 * 실제 Jira 로 쓰지는 않습니다. targetPayload 가 "보낸다면 이렇게 보낼 것" 미리보기입니다.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  const { link, partner } = await scope(req, workspaceId);
  const body = CreateBody.parse(await readJson(req));

  if (!link || !partner) {
    throw new ApiError(
      409,
      "NO_PARTNER",
      "연결된 파트너 팀이 없습니다. 먼저 초대 코드로 팀을 연결하세요.",
    );
  }

  const jiraConn = await prisma.connection.findUnique({
    where: { workspaceId_provider: { workspaceId: partner.id, provider: "JIRA" } },
  });
  const jiraConfig = (jiraConn?.config ?? {}) as { site?: string; projectKey?: string };
  const projectKey = jiraConfig.projectKey ?? "BAT";
  const site = jiraConfig.site ?? "pmconnector.atlassian.net";

  const now = new Date();
  const sharedFields = body.share
    ? { status: "SHARED" as const, sharedAt: now }
    : { status: "DRAFT" as const, sharedAt: null };

  const createdIds: string[] = [];

  if (body.nextActionIds?.length) {
    const actions = await prisma.nextAction.findMany({
      where: { id: { in: body.nextActionIds }, workspaceId },
      include: { handoverItem: { select: { title: true } } },
    });
    if (actions.length === 0) {
      throw new ApiError(404, "ACTION_NOT_FOUND", "선택한 업무를 찾을 수 없습니다.");
    }

    for (const action of actions) {
      const created = await prisma.boardItem.create({
        data: {
          linkId: link.id,
          fromWorkspaceId: workspaceId,
          toWorkspaceId: partner.id,
          nextActionId: action.id,
          title: action.title,
          body: action.description,
          priority: action.priority,
          targetSystem: "JIRA",
          targetPayload: buildJiraPreview({
            site,
            projectKey,
            title: action.title,
            body: action.description,
            priority: action.priority,
            assignee: action.assignee,
            handoverTitle: action.handoverItem?.title ?? null,
          }),
          ...sharedFields,
        },
      });
      createdIds.push(created.id);
    }
  } else {
    if (!body.title) {
      throw new ApiError(400, "INVALID_BODY", "nextActionIds 또는 title 중 하나는 필요합니다.");
    }
    const created = await prisma.boardItem.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: workspaceId,
        toWorkspaceId: partner.id,
        title: body.title,
        body: body.body ?? null,
        priority: body.priority ?? "NORMAL",
        targetSystem: "JIRA",
        targetPayload: buildJiraPreview({
          site,
          projectKey,
          title: body.title,
          body: body.body,
          priority: body.priority ?? "NORMAL",
        }),
        ...sharedFields,
      },
    });
    createdIds.push(created.id);
  }

  const items = await prisma.boardItem.findMany({
    where: { id: { in: createdIds } },
    include: { fromWorkspace: true, toWorkspace: true },
  });

  return ok(items.map((i) => toBoardItemDTO(i, workspaceId)), 201);
});
