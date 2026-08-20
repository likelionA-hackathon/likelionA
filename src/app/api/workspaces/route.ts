import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toWorkspaceDTO } from "@/lib/serialize";
import { handler, ok, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { uniqueSlug } from "@/lib/workspace";
import type { WorkspaceDTO } from "@/types/api";

const CreateBody = z.object({
  name: z.string().min(1, "팀 이름을 입력하세요.").max(50),
  tagline: z.string().max(100).optional(),
  /** IANA 타임존. 온보딩에서 고른 값. */
  timezone: z.string().max(64).optional(),
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]).optional(),
});

/** GET /api/workspaces — 내 워크스페이스 목록 (= /api/me 의 workspaces 와 동일) */
export const GET = handler(async (req: Request) => {
  const user = await requireUser(req);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { workspace: { include: { _count: { select: { members: true } } } } },
  });

  const workspaces: WorkspaceDTO[] = memberships.map((m) =>
    toWorkspaceDTO(m.workspace, m.role, m.workspace._count.members),
  );

  return ok(workspaces);
});

/**
 * POST /api/workspaces — 팀 생성
 * body: { name: string, tagline?: string }
 * 만든 사람은 자동으로 OWNER 멤버가 됩니다.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(req);
  const body = CreateBody.parse(await readJson(req));

  const workspace = await prisma.workspace.create({
    data: {
      name: body.name,
      tagline: body.tagline ?? null,
      timezone: body.timezone ?? "Asia/Seoul",
      plan: body.plan ?? "FREE",
      slug: await uniqueSlug(body.name),
      members: { create: { userId: user.id, role: "OWNER" } },
      // Jira 는 데모용 목데이터 연결을 기본으로 하나 깔아둔다 (연결관리 화면이 비지 않도록)
      connections: {
        create: {
          provider: "JIRA",
          status: "MOCK",
          displayName: "Jira (데모)",
          config: { site: "pmconnector.atlassian.net", projectKey: "BAT" },
        },
      },
    },
    include: { _count: { select: { members: true } } },
  });

  return ok(toWorkspaceDTO(workspace, "OWNER", workspace._count.members), 201);
});
