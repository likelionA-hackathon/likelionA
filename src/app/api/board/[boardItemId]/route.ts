import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, readJson } from "@/lib/http";
import { requireMembership, requireUser } from "@/lib/session";
import { toBoardItemDTO, toNextActionDTO } from "@/lib/serialize";

type Ctx = { params: Promise<{ boardItemId: string }> };

const PatchBody = z.object({
  status: z.enum(["DRAFT", "SHARED", "ACCEPTED", "DECLINED"]),
});

/**
 * PATCH /api/board/:boardItemId  body: { status }
 *
 * - DRAFT → SHARED   : 보낸 쪽만 가능. 상대 보드에 노출됨.
 * - SHARED → ACCEPTED: 받는 쪽만 가능. 수락하면 받는 팀의 NextAction 으로 자동 복사됩니다.
 * - SHARED → DECLINED: 받는 쪽만 가능.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { boardItemId } = await ctx.params;
  const user = await requireUser(req);
  const body = PatchBody.parse(await readJson(req));

  const item = await prisma.boardItem.findUnique({
    where: { id: boardItemId },
    include: { fromWorkspace: true, toWorkspace: true },
  });
  if (!item) throw new ApiError(404, "BOARD_ITEM_NOT_FOUND", "공유보드 항목을 찾을 수 없습니다.");

  const isSender = await prisma.membership
    .findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: item.fromWorkspaceId } },
    })
    .then(Boolean);
  const isReceiver = await prisma.membership
    .findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: item.toWorkspaceId } },
    })
    .then(Boolean);

  if (!isSender && !isReceiver) {
    throw new ApiError(403, "NOT_A_MEMBER", "이 항목에 접근할 권한이 없습니다.");
  }

  if (body.status === "SHARED" && !isSender) {
    throw new ApiError(403, "SENDER_ONLY", "보낸 팀만 전달할 수 있습니다.");
  }
  if ((body.status === "ACCEPTED" || body.status === "DECLINED") && !isReceiver) {
    throw new ApiError(403, "RECEIVER_ONLY", "받는 팀만 수락/반려할 수 있습니다.");
  }

  const updated = await prisma.boardItem.update({
    where: { id: boardItemId },
    data: {
      status: body.status,
      ...(body.status === "SHARED" ? { sharedAt: new Date() } : {}),
    },
    include: { fromWorkspace: true, toWorkspace: true },
  });

  // 수락하면 받는 팀의 할 일로 복사해준다. 이게 "두 팀이 이어진다"는 느낌을 만드는 지점.
  let copiedAction = null;
  if (body.status === "ACCEPTED") {
    const created = await prisma.nextAction.create({
      data: {
        workspaceId: item.toWorkspaceId,
        title: item.title,
        description: [item.body, `\n${item.fromWorkspace.name} 팀에서 전달받음`]
          .filter(Boolean)
          .join("\n"),
        priority: item.priority,
        origin: "MANUAL",
        status: "TODO",
      },
      include: { handoverItem: { select: { id: true, title: true } } },
    });
    copiedAction = toNextActionDTO(created);
  }

  const myWorkspaceId = isSender ? item.fromWorkspaceId : item.toWorkspaceId;
  await requireMembership(user.id, myWorkspaceId);

  return ok({ item: toBoardItemDTO(updated, myWorkspaceId), copiedAction });
});
