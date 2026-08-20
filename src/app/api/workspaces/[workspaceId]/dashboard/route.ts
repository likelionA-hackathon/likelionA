import { prisma } from "@/lib/prisma";
import { handler, ok } from "@/lib/http";
import { getMembershipRole, scope } from "@/lib/workspace";
import { toConnectionDTO, toHandoverListDTO, toNextActionDTO, toWorkspaceDTO } from "@/lib/serialize";
import type { DashboardDTO } from "@/types/api";

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/:workspaceId/dashboard
 *
 * 전철우: 대시보드 화면은 이거 하나만 부르면 됩니다. 다른 호출 필요 없음.
 * 응답 전체 모양은 types/api.ts 의 DashboardDTO.
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  const { user, workspace, link, partner } = await scope(req, workspaceId);

  const [
    newHandovers,
    urgentHandovers,
    openActions,
    openRequests,
    incomingRequests,
    incomingBoardItems,
    recent,
    todayActions,
    connections,
  ] = await Promise.all([
    prisma.handoverItem.count({ where: { workspaceId, status: "NEW" } }),
    prisma.handoverItem.count({
      where: { workspaceId, priority: "URGENT", status: { not: "ARCHIVED" } },
    }),
    prisma.nextAction.count({ where: { workspaceId, status: { not: "DONE" } } }),
    prisma.request.count({ where: { toWorkspaceId: workspaceId, status: "OPEN" } }),
    prisma.request.count({ where: { toWorkspaceId: workspaceId, status: "OPEN" } }),
    prisma.boardItem.count({ where: { toWorkspaceId: workspaceId, status: "SHARED" } }),
    prisma.handoverItem.findMany({
      where: { workspaceId, status: { not: "ARCHIVED" } },
      include: {
        link: { include: { workspaceA: true, workspaceB: true } },
        _count: { select: { nextActions: true } },
      },
      orderBy: [{ status: "asc" }, { occurredAt: "desc" }],
      take: 5,
    }),
    prisma.nextAction.findMany({
      where: { workspaceId, status: { not: "DONE" } },
      include: { handoverItem: { select: { id: true, title: true } } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
    prisma.connection.findMany({ where: { workspaceId }, orderBy: { provider: "asc" } }),
  ]);

  const role = (await getMembershipRole(user.id, workspaceId)) ?? "MEMBER";

  const dto: DashboardDTO = {
    workspace: toWorkspaceDTO(workspace, role, workspace._count.members),
    partner: link
      ? {
          linkId: link.id,
          status: link.status,
          inviteCode: link.status === "PENDING" ? link.inviteCode : null,
          partner: partner
            ? {
                id: partner.id,
                name: partner.name,
                slug: partner.slug,
                tagline: partner.tagline,
              }
            : null,
        }
      : null,
    stats: { newHandovers, urgentHandovers, openActions, openRequests },
    badges: {
      incomingRequests,
      unreadHandovers: newHandovers,
      incomingBoardItems,
    },
    recentHandovers: recent.map((h) => toHandoverListDTO(h, workspaceId)),
    todayActions: todayActions.map(toNextActionDTO),
    connections: connections.map(toConnectionDTO),
  };

  return ok(dto);
});
