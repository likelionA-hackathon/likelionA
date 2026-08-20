import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handler, ok, readJson } from "@/lib/http";
import { getMembershipRole, scope } from "@/lib/workspace";
import { toShareScopes, toWorkspaceDTO } from "@/lib/serialize";

type Ctx = { params: Promise<{ workspaceId: string }> };

const PatchBody = z.object({
  name: z.string().min(1).max(50).optional(),
  tagline: z.string().max(100).nullable().optional(),
  /** IANA 타임존 문자열 (예: Asia/Seoul) */
  timezone: z.string().max(64).optional(),
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]).optional(),
  shareScopes: z
    .object({
      requirements: z.boolean(),
      references: z.boolean(),
      decisions: z.boolean(),
      notices: z.boolean(),
    })
    .optional(),
});

/** GET /api/workspaces/:workspaceId — 팀 설정 한 건 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  // scope 가 이미 멤버 확인 + 워크스페이스(멤버수 포함) 로드까지 해줍니다.
  const { user, workspace } = await scope(req, workspaceId);
  const role = (await getMembershipRole(user.id, workspaceId)) ?? "MEMBER";

  return ok(toWorkspaceDTO(workspace, role, workspace._count.members));
});

/**
 * PATCH /api/workspaces/:workspaceId
 * body: { name?, tagline?, timezone?, plan?, shareScopes? }
 *
 * 온보딩에서 고른 타임존·요금제, 연결 관리의 공유 범위가 여기로 저장됩니다.
 * 보낸 필드만 바뀝니다.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  const { user } = await scope(req, workspaceId);
  const body = PatchBody.parse(await readJson(req));

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.tagline !== undefined ? { tagline: body.tagline } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.plan !== undefined ? { plan: body.plan } : {}),
      ...(body.shareScopes !== undefined ? { shareScopes: toShareScopes(body.shareScopes) } : {}),
    },
    include: { _count: { select: { members: true } } },
  });

  const role = (await getMembershipRole(user.id, workspaceId)) ?? "MEMBER";
  return ok(toWorkspaceDTO(updated, role, updated._count.members));
});
