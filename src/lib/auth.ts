import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

/**
 * NextAuth v5. Prisma 어댑터 대신 JWT 세션 + signIn 콜백에서 User 를 직접 upsert 한다.
 * (어댑터 버전 물리는 것보다 해커톤에선 이게 사고가 적다.)
 *
 * 전철우: 화면에서는 아래만 쓰면 됩니다.
 *   서버 컴포넌트  → const session = await auth()
 *   클라이언트     → signIn("google") / signOut()  from "next-auth/react"
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),

    /**
     * 게스트 로그인.
     *
     * 심사위원이 Google 계정을 쓰지 않고도 둘러볼 수 있게 합니다.
     * 테스트 계정 정보를 따로 제출하지 않아도 됩니다.
     *
     * 비밀번호를 받지 않고 고정 데모 계정으로 바로 세션을 만듭니다.
     * 가짜 우회가 아니라 실제 NextAuth 세션이라 DEV_AUTH_BYPASS 를 꺼도 동작합니다.
     *
     * 화면에서:  signIn("guest", { redirectTo: "/" })
     * 끄려면:    DEMO_GUEST_LOGIN="false"
     */
    Credentials({
      id: "guest",
      name: "게스트",
      credentials: {},
      async authorize() {
        if (process.env.DEMO_GUEST_LOGIN !== "true") return null;

        const email = process.env.DEMO_GUEST_EMAIL || "guest@pmconnector.dev";
        const user = await prisma.user.upsert({
          where: { email },
          create: { email, name: "게스트" },
          update: {},
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const dbUser = await prisma.user.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        },
        update: {
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        },
      });

      await autoJoinDemoWorkspace(dbUser.id);
      return true;
    },
    async jwt({ token }) {
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true },
        });
        if (dbUser) token.uid = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    },
  },
});

/**
 * 데모 워크스페이스 자동 참여.
 *
 * 심사위원이 자기 Google 계정으로 로그인하면, 소속 워크스페이스가 없어서
 * 온보딩 화면만 보고 데모 데이터를 하나도 못 봅니다.
 * 그래서 워크스페이스가 하나도 없는 새 사용자는 데모 팀에 자동으로 넣어줍니다.
 * 테스트 계정을 따로 배포할 필요가 없어집니다.
 *
 *   DEMO_AUTO_JOIN="true"          켜고 끄기 (실서비스라면 꺼야 함)
 *   DEMO_WORKSPACE_SLUG="settle-team"  어느 팀에 넣을지. 데모 데이터가 있는 쪽
 *
 * 권한은 MEMBER 로만 줍니다. 워크스페이스 설정을 못 건드리게.
 */
async function autoJoinDemoWorkspace(userId: string) {
  if (process.env.DEMO_AUTO_JOIN !== "true") return;

  const existing = await prisma.membership.count({ where: { userId } });
  if (existing > 0) return; // 이미 소속이 있으면 건드리지 않는다

  const slug = process.env.DEMO_WORKSPACE_SLUG || "settle-team";
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!workspace) return; // seed 가 아직 안 돌았을 수 있다. 조용히 넘어감

  await prisma.membership
    .create({ data: { userId, workspaceId: workspace.id, role: "MEMBER" } })
    .catch(() => undefined); // 동시 로그인 경합 방지
}
