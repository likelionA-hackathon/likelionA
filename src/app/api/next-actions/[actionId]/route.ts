import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, readJson } from "@/lib/http";
import { requireMembership, requireUser } from "@/lib/session";
import { toNextActionDTO } from "@/lib/serialize";

type Ctx = { params: Promise<{ actionId: string }> };

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  assignee: z.string().max(50).nullable().optional(),
  priority: z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]).optional(),
  status: z.enum(["TODO", "DOING", "DONE"]).optional(),
  /** ISO 8601 문자열. null 을 보내면 기한 해제. */
  dueDate: z.string().nullable().optional(),
});

async function loadAndAuthorize(req: Request, actionId: string) {
  const user = await requireUser(req);
  const action = await prisma.nextAction.findUnique({ where: { id: actionId } });
  if (!action) throw new ApiError(404, "ACTION_NOT_FOUND", "업무를 찾을 수 없습니다.");
  await requireMembership(user.id, action.workspaceId);
  return action;
}

/**
 * PATCH /api/next-actions/:actionId
 * 상태 토글, 담당자 변경, 제목 수정 전부 여기로.
 * 사람이 한 번이라도 수정하면 aiDraft 가 false 로 내려가서 "AI 초안" 뱃지가 사라집니다.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { actionId } = await ctx.params;
  await loadAndAuthorize(req, actionId);
  const body = PatchBody.parse(await readJson(req));

  const updated = await prisma.nextAction.update({
    where: { id: actionId },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.assignee !== undefined ? { assignee: body.assignee } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.dueDate !== undefined
        ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
        : {}),
      aiDraft: false,
    },
    include: { handoverItem: { select: { id: true, title: true } } },
  });

  return ok(toNextActionDTO(updated));
});

/** DELETE /api/next-actions/:actionId */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const { actionId } = await ctx.params;
  await loadAndAuthorize(req, actionId);
  await prisma.nextAction.delete({ where: { id: actionId } });
  return ok({ deleted: true });
});
