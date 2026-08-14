import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, readJson } from "@/lib/http";
import { requireMembership, requireUser } from "@/lib/session";
import { toRequestDTO } from "@/lib/serialize";

type Ctx = { params: Promise<{ requestId: string }> };

const AnswerBody = z.object({
  answer: z.string().min(1, "답변을 입력하세요.").max(4000),
});

/**
 * POST /api/requests/:requestId/answer  body: { answer }
 * 받은 쪽(toWorkspace)만 답할 수 있습니다. 답하면 status 가 ANSWERED 로 바뀌고
 * 보낸 쪽 대시보드의 배지가 내려갑니다.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { requestId } = await ctx.params;
  const user = await requireUser(req);
  const body = AnswerBody.parse(await readJson(req));

  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) throw new ApiError(404, "REQUEST_NOT_FOUND", "요청을 찾을 수 없습니다.");
  await requireMembership(user.id, request.toWorkspaceId);

  const updated = await prisma.request.update({
    where: { id: requestId },
    data: { answer: body.answer, status: "ANSWERED", answeredAt: new Date() },
    include: {
      fromWorkspace: true,
      toWorkspace: true,
      handoverItem: { select: { id: true, title: true } },
    },
  });

  return ok(toRequestDTO(updated, request.toWorkspaceId));
});
