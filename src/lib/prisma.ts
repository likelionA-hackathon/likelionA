import { PrismaClient } from "@prisma/client";

// Next.js dev 서버는 핫리로드마다 모듈을 다시 평가하므로
// 전역에 하나만 두지 않으면 커넥션이 계속 늘어난다.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
