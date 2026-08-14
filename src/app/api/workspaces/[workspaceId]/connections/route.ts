import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handler, ok, readJson } from "@/lib/http";
import { scope } from "@/lib/workspace";
import { toConnectionDTO } from "@/lib/serialize";
import { testNotionConnection } from "@/lib/notion";

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/:workspaceId/connections
 * 전철우: 연결 관리 화면 목록. isMock=true 인 항목(Jira)은 "데모" 뱃지 붙여주세요.
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  await scope(req, workspaceId);

  const items = await prisma.connection.findMany({
    where: { workspaceId },
    orderBy: { provider: "asc" },
  });
  return ok(items.map(toConnectionDTO));
});

const UpsertBody = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("NOTION"),
    token: z.string().min(10, "Notion Internal Integration Token 을 입력하세요."),
    databaseId: z.string().min(10, "Notion 데이터베이스 ID 를 입력하세요."),
  }),
  z.object({
    provider: z.literal("JIRA"),
    site: z.string().min(1),
    projectKey: z.string().min(1).max(10),
  }),
]);

/**
 * POST /api/workspaces/:workspaceId/connections — 연결 추가/수정
 *
 * Notion: { provider:"NOTION", token, databaseId }
 *   → 저장 전에 실제로 Notion 을 한 번 찔러봅니다. 실패하면 4xx 로 이유가 옵니다.
 *     ("Could not find database" 면 integration 을 그 DB 에 초대 안 한 것)
 *
 * Jira:  { provider:"JIRA", site, projectKey }  → 목데이터. 검증 없이 저장(status=MOCK).
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  await scope(req, workspaceId);
  const body = UpsertBody.parse(await readJson(req));

  if (body.provider === "JIRA") {
    const conn = await prisma.connection.upsert({
      where: { workspaceId_provider: { workspaceId, provider: "JIRA" } },
      create: {
        workspaceId,
        provider: "JIRA",
        status: "MOCK",
        displayName: `${body.site} · ${body.projectKey}`,
        config: { site: body.site, projectKey: body.projectKey },
      },
      update: {
        status: "MOCK",
        displayName: `${body.site} · ${body.projectKey}`,
        config: { site: body.site, projectKey: body.projectKey },
      },
    });
    return ok(toConnectionDTO(conn), 201);
  }

  // Notion — 저장 전에 연결 테스트
  const probe = await testNotionConnection(body.databaseId, body.token);

  const conn = await prisma.connection.upsert({
    where: { workspaceId_provider: { workspaceId, provider: "NOTION" } },
    create: {
      workspaceId,
      provider: "NOTION",
      status: "CONNECTED",
      displayName: probe.title,
      config: { token: body.token, databaseId: body.databaseId },
      lastError: null,
    },
    update: {
      status: "CONNECTED",
      displayName: probe.title,
      config: { token: body.token, databaseId: body.databaseId },
      lastError: null,
    },
  });

  return ok({ ...toConnectionDTO(conn), apiVersion: probe.apiVersion }, 201);
});
