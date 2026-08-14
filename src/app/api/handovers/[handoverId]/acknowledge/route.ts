import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok } from "@/lib/http";
import { requireMembership, requireUser } from "@/lib/session";
import { toHandoverDetailDTO } from "@/lib/serialize";

type Ctx = { params: Promise<{ handoverId: string }> };

/**
 * POST /api/handovers/:handoverId/acknowledge
 * body 없음.
 * "확인" 버튼. 이미 확인한 건이면 그대로 돌려줍니다(에러 아님).
 * 응답은 GET 상세와 같은 모양이라, 그대로 상태에 넣으면 됩니다.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { handoverId } = await ctx.params;
  const user = await requireUser(req);

  const existing = await prisma.handoverItem.findUnique({
    where: { id: handoverId },
    select: { id: true, workspaceId: true, status: true },
  });
  if (!existing) throw new ApiError(404, "HANDOVER_NOT_FOUND", "인수인계를 찾을 수 없습니다.");
  await requireMembership(user.id, existing.workspaceId);

  if (existing.status === "NEW") {
    await prisma.handoverItem.update({
      where: { id: handoverId },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        acknowledgedById: user.id,
      },
    });
  }

  const item = await prisma.handoverItem.findUniqueOrThrow({
    where: { id: handoverId },
    include: {
      link: { include: { workspaceA: true, workspaceB: true } },
      acknowledgedBy: { select: { id: true, name: true } },
      nextActions: { include: { handoverItem: { select: { id: true, title: true } } } },
      requests: true,
      _count: { select: { nextActions: true } },
    },
  });

  return ok(toHandoverDetailDTO(item, item.workspaceId));
});
