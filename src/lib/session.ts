import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/http";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  /** 어떻게 들어온 사람인지. 화면에서 "게스트" 표시를 붙이는 데 씁니다. */
  via: "google" | "guest" | "dev";
};

const devBypassEnabled = () => process.env.DEV_AUTH_BYPASS === "true";

/**
 * 현재 사용자.
 *
 * 1) NextAuth 세션이 있으면 그걸 쓴다.
 * 2) DEV_AUTH_BYPASS=true 인 동안에는 요청 헤더 `x-baton-user: 이메일` 로도 동작한다.
 *    스크립트(smoke/doctor/notion)가 로그인 없이 API 를 부르기 위한 장치다.
 *
 * 브라우저 화면에는 이 우회가 절대 적용되지 않는다.
 * 예전에는 헤더가 없으면 env DEV_USER_EMAIL 로 대체했는데,
 * 그러면 로그아웃해도 곧바로 그 사용자로 다시 들어와서
 * "로그아웃 버튼이 안 먹는" 것처럼 보였다. 그래서 env 대체를 없앴다.
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
      const guestEmail = process.env.DEMO_GUEST_EMAIL || "guest@pmconnector.dev";
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        via: user.email === guestEmail ? "guest" : "google",
      };
    }
  }

  // 헤더가 실제로 있을 때만. env 로 대체하지 않는다(로그아웃이 무력화됨).
  if (devBypassEnabled()) {
    const headerEmail = req?.headers.get("x-baton-user");
    if (headerEmail) {
      const user = await prisma.user.findUnique({ where: { email: headerEmail } });
      if (user) {
        return { id: user.id, email: user.email, name: user.name, image: user.image, via: "dev" };
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
