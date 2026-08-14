import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handler, ok, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { uniqueSlug } from "@/lib/workspace";
import type { WorkspaceDTO } from "@/types/api";

const CreateBody = z.object({
  name: z.string().min(1, "팀 이름을 입력하세요.").max(50),
  tagline: z.string().max(100).optional(),
});

/** GET /api/workspaces — 내 워크스페이스 목록 (= /api/me 의 workspaces 와 동일) */
export const GET = handler(async (req: Request) => {
  const user = await requireUser(req);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { workspace: { include: { _count: { select: { members: true } } } } },
  });

  const workspaces: WorkspaceDTO[] = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    tagline: m.workspace.tagline,
    role: m.role,
    memberCount: m.workspace._count.members,
  }));

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
      slug: await uniqueSlug(body.name),
      members: { create: { userId: user.id, role: "OWNER" } },
      // Jira 는 데모용 목데이터 연결을 기본으로 하나 깔아둔다 (연결관리 화면이 비지 않도록)
      connections: {
        create: {
          provider: "JIRA",
          status: "MOCK",
          displayName: "Jira (데모)",
          config: { site: "baton.atlassian.net", projectKey: "BAT" },
        },
      },
    },
    include: { _count: { select: { members: true } } },
  });

  const dto: WorkspaceDTO = {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    tagline: workspace.tagline,
    role: "OWNER",
    memberCount: workspace._count.members,
  };

  return ok(dto, 201);
});
