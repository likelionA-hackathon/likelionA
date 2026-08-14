import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, readJson } from "@/lib/http";
import { requireMembership, requireUser } from "@/lib/session";
import type { PartnerDTO } from "@/types/api";

const AcceptBody = z.object({
  inviteCode: z.string().min(4).max(32),
  /** 내가 어느 워크스페이스로 참여할지 */
  workspaceId: z.string().min(1),
});

/**
 * POST /api/links/accept  body: { inviteCode, workspaceId }
 *
 * 전철우: 초대 링크(/invite/:code) 화면에서
 *   - 로그인 안 되어 있으면 로그인 먼저
 *   - 내 워크스페이스가 없으면 팀 생성 먼저
 *   - 있으면 이 API 호출 → 성공하면 대시보드로 이동
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(req);
  const body = AcceptBody.parse(await readJson(req));
  await requireMembership(user.id, body.workspaceId);

  const link = await prisma.link.findUnique({
    where: { inviteCode: body.inviteCode.trim().toUpperCase() },
    include: { workspaceA: true, workspaceB: true },
  });

  if (!link) throw new ApiError(404, "INVITE_NOT_FOUND", "초대 코드를 찾을 수 없습니다.");
  if (link.status === "REVOKED") {
    throw new ApiError(410, "INVITE_REVOKED", "만료된 초대 코드입니다.");
  }
  if (link.workspaceAId === body.workspaceId) {
    throw new ApiError(400, "SELF_LINK", "같은 팀끼리는 연결할 수 없습니다.");
  }
  if (link.status === "ACTIVE") {
    if (link.workspaceBId !== body.workspaceId) {
      throw new ApiError(409, "ALREADY_LINKED", "이미 다른 팀과 연결된 초대입니다.");
    }
    const dto: PartnerDTO = {
      linkId: link.id,
      status: link.status,
      inviteCode: null,
      partner: {
        id: link.workspaceA.id,
        name: link.workspaceA.name,
        slug: link.workspaceA.slug,
        tagline: link.workspaceA.tagline,
      },
    };
    return ok(dto);
  }

  const updated = await prisma.link.update({
    where: { id: link.id },
    data: { workspaceBId: body.workspaceId, status: "ACTIVE", acceptedAt: new Date() },
    include: { workspaceA: true, workspaceB: true },
  });

  const dto: PartnerDTO = {
    linkId: updated.id,
    status: updated.status,
    inviteCode: null,
    partner: {
      id: updated.workspaceA.id,
      name: updated.workspaceA.name,
      slug: updated.workspaceA.slug,
      tagline: updated.workspaceA.tagline,
    },
  };
  return ok(dto);
});
