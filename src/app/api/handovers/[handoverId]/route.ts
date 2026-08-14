import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok } from "@/lib/http";
import { requireMembership, requireUser } from "@/lib/session";
import { toHandoverDetailDTO } from "@/lib/serialize";

type Ctx = { params: Promise<{ handoverId: string }> };

/**
 * GET /api/handovers/:handoverId
 * 김건희: 인수인계 상세 화면은 이거 하나로 끝납니다.
 *   - summary        → 요약 블록
 *   - changes[]      → 변경사항 블록 (typeLabel 이 "추가됨/변경됨/제거됨")
 *   - workContext    → 업무맥락 블록
 *   - openQuestions[]→ 추가확인 블록. requested=true 면 이미 정보요청 보낸 것
 *   - nextActions[]  → 하단 연결된 다음 업무
 *   - status         → "확인" 버튼 상태 (NEW 면 버튼 활성, ACKNOWLEDGED 면 비활성 + 확인 시각 표시)
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { handoverId } = await ctx.params;
  const user = await requireUser(req);

  const item = await prisma.handoverItem.findUnique({
    where: { id: handoverId },
    include: {
      link: { include: { workspaceA: true, workspaceB: true } },
      acknowledgedBy: { select: { id: true, name: true } },
      nextActions: {
        include: { handoverItem: { select: { id: true, title: true } } },
        orderBy: [{ status: "asc" }, { priority: "asc" }],
      },
      requests: true,
      _count: { select: { nextActions: true } },
    },
  });

  if (!item) throw new ApiError(404, "HANDOVER_NOT_FOUND", "인수인계를 찾을 수 없습니다.");
  await requireMembership(user.id, item.workspaceId);

  return ok(toHandoverDetailDTO(item, item.workspaceId));
});
