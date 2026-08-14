import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/http";
import { requireMembership, requireUser } from "@/lib/session";

/**
 * 라우트 앞단에서 매번 하는 것: 로그인 확인 → 멤버 확인 → 워크스페이스/파트너 링크 로드.
 * 라우트 안에서는 `const { user, workspace, link, partner } = await scope(req, workspaceId)` 한 줄.
 */
export async function scope(req: Request, workspaceId: string) {
  const user = await requireUser(req);
  await requireMembership(user.id, workspaceId);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { _count: { select: { members: true } } },
  });
  if (!workspace) throw new ApiError(404, "WORKSPACE_NOT_FOUND", "워크스페이스를 찾을 수 없습니다.");

  const link = await prisma.link.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ workspaceAId: workspaceId }, { workspaceBId: workspaceId }],
    },
    include: { workspaceA: true, workspaceB: true },
    orderBy: { acceptedAt: "desc" },
  });

  const partner = link
    ? link.workspaceAId === workspaceId
      ? link.workspaceB
      : link.workspaceA
    : null;

  return { user, workspace, link, partner };
}

export async function getMembershipRole(userId: string, workspaceId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return m?.role ?? null;
}

/** 슬러그 후보를 만들고 중복이면 뒤에 숫자를 붙인다. */
export async function uniqueSlug(name: string) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "team";

  let candidate = base;
  let n = 1;
  while (await prisma.workspace.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${++n}`;
  }
  return candidate;
}

/** 사람이 읽고 부를 수 있는 초대 코드. 헷갈리는 글자(0/O/1/I) 제외. */
export function makeInviteCode(length = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
