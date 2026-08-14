import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/http";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

const devBypassEnabled = () => process.env.DEV_AUTH_BYPASS === "true";

/**
 * 현재 사용자.
 *
 * 1) NextAuth 세션이 있으면 그걸 쓴다.
 * 2) 로그인이 아직 안 붙은 동안(DEV_AUTH_BYPASS=true)에는
 *    - 요청 헤더 `x-baton-user: 이메일`  또는
 *    - env DEV_USER_EMAIL
 *    의 사용자로 동작한다. 프론트 두 분이 로그인 없이 API 를 때려볼 수 있게 하는 장치.
 *
 * 배포 전에 DEV_AUTH_BYPASS 를 반드시 끌 것.
 */
export async function getCurrentUser(req?: Request): Promise<CurrentUser | null> {
  // AUTH_SECRET 이 없으면 NextAuth 가 MissingSecret 을 던진다.
  // 로그인이 붙기 전에는 아예 호출하지 않아 콘솔을 깨끗하게 유지한다.
  const authConfigured = Boolean(process.env.AUTH_SECRET);
  const session = authConfigured ? await auth().catch(() => null) : null;
  const email = session?.user?.email ?? null;

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    }
  }

  if (devBypassEnabled()) {
    const headerEmail = req?.headers.get("x-baton-user") ?? undefined;
    const fallbackEmail = headerEmail || process.env.DEV_USER_EMAIL;
    if (fallbackEmail) {
      const user = await prisma.user.findUnique({ where: { email: fallbackEmail } });
      if (user) {
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      }
    }
  }

  return null;
}

export async function requireUser(req?: Request): Promise<CurrentUser> {
  const user = await getCurrentUser(req);
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
  return user;
}

/** 해당 워크스페이스의 멤버인지 확인하고, 아니면 403. */
export async function requireMembership(userId: string, workspaceId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) {
    throw new ApiError(403, "NOT_A_MEMBER", "이 워크스페이스의 멤버가 아닙니다.");
  }
  return membership;
}
