import { prisma } from "@/lib/prisma";
import { toWorkspaceDTO } from "@/lib/serialize";
import { handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/session";
import type { WorkspaceDTO } from "@/types/api";

/**
 * GET /api/me
 * 현재 사용자 + 소속 워크스페이스 목록.
 * 로그인 직후 "팀 생성/참여" 화면으로 보낼지 대시보드로 보낼지 판단할 때 쓰세요.
 * → workspaces 가 비어 있으면 온보딩으로.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser(req);

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { workspace: { include: { _count: { select: { members: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  const workspaces: WorkspaceDTO[] = memberships.map((m) =>
    toWorkspaceDTO(m.workspace, m.role, m.workspace._count.members),
  );

  return ok({ user, workspaces });
});
