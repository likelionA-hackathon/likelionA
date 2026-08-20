import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 데모 워크스페이스에 잘못 들어가 있는 실제 계정을 빼냅니다.
 *
 *   npm run demo:leave                 내 실제 계정들 전부 (시드/게스트 계정은 보호)
 *   npm run demo:leave -- a@b.com      특정 이메일만
 *
 * 왜 필요한가:
 * 예전에는 로그인하는 모든 사람을 데모 팀(정산팀)에 자동으로 넣었습니다.
 * 그때 들어간 멤버십이 남아 있으면, 실제 Google 계정으로 로그인해도
 * 온보딩 대신 데모 데이터가 그대로 보입니다.
 *
 * 이 스크립트는 멤버십 행만 지웁니다. 데모 데이터·워크스페이스·시드 계정은 그대로입니다.
 */

/** 시드로 만든 데모 계정. 이건 절대 빼지 않습니다. */
const SEED_EMAIL_SUFFIX = "@baton.dev";

async function main() {
  const slug = process.env.DEMO_WORKSPACE_SLUG || "settle-team";
  const guestEmail = process.env.DEMO_GUEST_EMAIL || "guest@pmconnector.dev";
  const targetEmail = process.argv.slice(2).find((arg) => arg.includes("@"));

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });

  if (!workspace) {
    console.error(`데모 워크스페이스(slug=${slug})를 찾지 못했습니다. npm run db:seed 를 먼저 돌리세요.`);
    process.exit(1);
  }

  const memberships = await prisma.membership.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  const removable = memberships.filter(({ user }) => {
    if (targetEmail) return user.email === targetEmail;
    if (user.email.endsWith(SEED_EMAIL_SUFFIX)) return false; // 시드 계정 보호
    if (user.email === guestEmail) return false; // 게스트 보호
    return true;
  });

  console.log(`\n${workspace.name} (${slug}) 멤버 ${memberships.length}명`);
  for (const { user } of memberships) {
    const mark = removable.some((item) => item.user.id === user.id) ? "빼냄" : "유지";
    console.log(`  [${mark}] ${user.name ?? "(이름없음)"} · ${user.email}`);
  }

  if (removable.length === 0) {
    console.log("\n빼낼 계정이 없습니다. 이미 정리되어 있습니다.\n");
    return;
  }

  const result = await prisma.membership.deleteMany({
    where: { id: { in: removable.map((item) => item.id) } },
  });

  console.log(`\n멤버십 ${result.count}건을 정리했습니다.`);
  console.log("이제 그 계정으로 로그인하면 온보딩(팀 만들기)부터 시작합니다.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
