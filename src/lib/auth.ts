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
        if (process.env.DEMO_GUEST_LOGIN !== "true") {
          console.error("[guest] DEMO_GUEST_LOGIN 이 true 가 아닙니다.");
          return null;
        }

        const email = process.env.DEMO_GUEST_EMAIL || "guest@pmconnector.dev";
        try {
          const user = await prisma.user.upsert({
            where: { email },
            create: { email, name: "게스트" },
            update: {},
          });
          return { id: user.id, email: user.email, name: user.name };
        } catch (error) {
          // 여기서 던지면 Auth.js 가 전부 "Configuration" 으로 뭉개서
          // 화면만 보고는 원인을 알 수 없습니다. 로그에 실제 원인을 남깁니다.
          console.error("[guest] 게스트 계정 생성 실패 (DATABASE_URL 확인):", error);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
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

      // 데모 워크스페이스 자동 참여는 게스트에게만 적용합니다.
      // 실제 Google 로그인은 빈 상태에서 시작해 온보딩(팀 생성)을 거칩니다.
      if (account?.provider === "guest") {
        await joinDemoWorkspace(dbUser.id).catch((error) => {
          console.error("[guest] 데모 팀 참여 실패:", error);
        });
      }

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
 * 게스트를 데모 워크스페이스에 넣습니다.
 *
 * 두 갈래를 분리하는 것이 핵심입니다.
 *   게스트("테스트 해보기")  → 데모 데이터가 채워진 팀으로. 둘러보기 전용
 *   실제 Google 로그인       → 소속 없음 → 온보딩에서 직접 팀을 만들고 실제로 사용
 *
 * 예전에는 모든 로그인을 데모 팀에 넣었는데, 그러면
 *   ① 실제 온보딩 흐름을 아무도 겪어볼 수 없고
 *   ② 로그인한 사람들이 데모 데이터를 함께 망가뜨립니다.
 *
 *   DEMO_AUTO_JOIN="true"              게스트 자동 참여 켜기/끄기
 *   DEMO_WORKSPACE_SLUG="settle-team"  데모 데이터가 있는 팀
 */
async function joinDemoWorkspace(userId: string) {
  if (process.env.DEMO_AUTO_JOIN !== "true") return;

  const existing = await prisma.membership.count({ where: { userId } });
  if (existing > 0) return;

  const slug = process.env.DEMO_WORKSPACE_SLUG || "settle-team";
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!workspace) return; // seed 가 아직 안 돌았을 수 있다

  await prisma.membership
    .create({ data: { userId, workspaceId: workspace.id, role: "MEMBER" } })
    .catch(() => undefined); // 동시 로그인 경합 방지
}
