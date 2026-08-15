import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok } from "@/lib/http";
import { requireMembership, requireUser } from "@/lib/session";
import { generateNextActions, isAiEnabled } from "@/lib/claude";
import { toNextActionDTO } from "@/lib/serialize";

type Ctx = { params: Promise<{ handoverId: string }> };

/**
 * POST /api/handovers/:handoverId/actions/generate
 * 인수인계 내용에서 "다음 업무" 초안을 AI 로 뽑아 NextAction 으로 저장합니다.
 *
 * 이미 이 인수인계로 만든 AI 초안이 있으면 지우고 다시 만듭니다(재생성 버튼용).
 * 사람이 손댄 것(origin=MANUAL 또는 aiDraft=false)은 건드리지 않습니다.
 *
 * 응답: NextActionDTO[]  (aiDraft=true 로 내려오니 화면에서 "AI 초안" 뱃지 붙여주세요)
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { handoverId } = await ctx.params;
  const user = await requireUser(req);

  const item = await prisma.handoverItem.findUnique({ where: { id: handoverId } });
  if (!item) throw new ApiError(404, "HANDOVER_NOT_FOUND", "인수인계를 찾을 수 없습니다.");
  await requireMembership(user.id, item.workspaceId);

  if (!isAiEnabled()) {
    throw new ApiError(
      503,
      "AI_DISABLED",
      "AI 키가 없습니다. .env 에 GEMINI_API_KEY 또는 ANTHROPIC_API_KEY 를 넣으세요.",
    );
  }

  const drafts = await generateNextActions({
    title: item.title,
    summary: item.summary,
    workContext: item.workContext,
    rawContent: item.rawContent,
    // 요약 단계에서 뽑아둔 '추가확인'을 같이 넘겨 중복 액션을 막는다.
    openQuestions: Array.isArray(item.openQuestions)
      ? (item.openQuestions as Array<{ question: string }>)
      : null,
  });

  if (drafts.length === 0) {
    throw new ApiError(422, "NO_ACTIONS", "인수인계에서 뽑아낼 액션을 찾지 못했습니다.");
  }

  await prisma.nextAction.deleteMany({
    where: { handoverItemId: handoverId, origin: "AI", aiDraft: true },
  });

  await prisma.nextAction.createMany({
    data: drafts.map((d) => ({
      workspaceId: item.workspaceId,
      handoverItemId: item.id,
      title: d.title,
      description: [d.description, d.dueHint ? `기한 단서: ${d.dueHint}` : ""]
        .filter(Boolean)
        .join("\n"),
      assignee: d.assignee,
      priority: d.priority,
      origin: "AI" as const,
      aiDraft: true,
    })),
  });

  const created = await prisma.nextAction.findMany({
    where: { handoverItemId: handoverId },
    include: { handoverItem: { select: { id: true, title: true } } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  return ok(created.map(toNextActionDTO), 201);
});
