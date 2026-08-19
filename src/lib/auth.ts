import NextAuth from "next-auth";
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
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      await prisma.user.upsert({
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
