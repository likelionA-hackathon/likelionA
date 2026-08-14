import { prisma } from "@/lib/prisma";
import { handler, ok } from "@/lib/http";
import { makeInviteCode, scope } from "@/lib/workspace";
import type { PartnerDTO } from "@/types/api";

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/:workspaceId/link
 * 현재 파트너 연결 상태. 없으면 null.
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  await scope(req, workspaceId);

  const link = await prisma.link.findFirst({
    where: {
      status: { in: ["ACTIVE", "PENDING"] },
      OR: [{ workspaceAId: workspaceId }, { workspaceBId: workspaceId }],
    },
    include: { workspaceA: true, workspaceB: true },
    orderBy: { createdAt: "desc" },
  });

  if (!link) return ok(null);

  const other = link.workspaceAId === workspaceId ? link.workspaceB : link.workspaceA;
  const dto: PartnerDTO = {
    linkId: link.id,
    status: link.status,
    inviteCode: link.status === "PENDING" ? link.inviteCode : null,
    partner: other
      ? { id: other.id, name: other.name, slug: other.slug, tagline: other.tagline }
      : null,
  };
  return ok(dto);
});

/**
 * POST /api/workspaces/:workspaceId/link — 초대 코드 발급
 * body 없음.
 * 이미 PENDING 초대가 있으면 그 코드를 그대로 돌려줍니다.
 *
 * 전철우: 초대 링크 화면은 이 코드를 받아서
 *   `${location.origin}/invite/${inviteCode}` 로 링크를 만들어 보여주시면 됩니다.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  const { user } = await scope(req, workspaceId);

  const pending = await prisma.link.findFirst({
    where: { workspaceAId: workspaceId, status: "PENDING" },
    include: { workspaceA: true, workspaceB: true },
  });

  const link =
    pending ??
    (await prisma.link.create({
      data: {
        workspaceAId: workspaceId,
        inviteCode: makeInviteCode(),
        createdById: user.id,
      },
      include: { workspaceA: true, workspaceB: true },
    }));

  const dto: PartnerDTO = {
    linkId: link.id,
    status: link.status,
    inviteCode: link.inviteCode,
    partner: null,
  };
  return ok(dto, pending ? 200 : 201);
});
