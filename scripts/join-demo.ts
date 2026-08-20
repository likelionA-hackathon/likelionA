import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 촬영·시연용으로 내 계정을 데모 워크스페이스(정산팀)에 넣습니다.
 *
 *   npm run demo:join -- 내구글주소@gmail.com
 *
 * 시연 영상은 게스트가 아니라 실제 로그인 계정으로 찍는 편이 낫습니다.
 * 사이드바에 "게스트 / 로그인 필요" 대신 실제 이름과 이메일이 뜨고,
 * 계정 전환 없이 처음부터 끝까지 한 흐름으로 녹화할 수 있기 때문입니다.
 *
 * 되돌리려면: npm run demo:leave -- 같은주소
 * 해당 이메일로 한 번이라도 로그인한 적이 있어야 합니다(User 행이 있어야 함).
 */
async function main() {
  const slug = process.env.DEMO_WORKSPACE_SLUG || "settle-team";
  const email = process.argv.slice(2).find((arg) => arg.includes("@"));

  if (!email) {
    console.error("이메일을 주세요.  예)  npm run demo:join -- me@gmail.com");
    process.exit(1);
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!workspace) {
    console.error(`데모 워크스페이스(slug=${slug})를 찾지 못했습니다. npm run db:seed 를 먼저 돌리세요.`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) {
    console.error(`${email} 로 로그인한 기록이 없습니다. 먼저 그 계정으로 한 번 로그인한 뒤 다시 돌리세요.`);
    process.exit(1);
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
  });

  if (existing) {
    console.log(`\n${user.name ?? email} 은(는) 이미 ${workspace.name} 멤버입니다.\n`);
    return;
  }

  await prisma.membership.create({
    data: { userId: user.id, workspaceId: workspace.id, role: "MEMBER" },
  });

  console.log(`\n${user.name ?? email} 을(를) ${workspace.name} 에 넣었습니다.`);
  console.log("이제 그 계정으로 로그인하면 곧바로 데모 데이터가 있는 팀으로 들어갑니다.");
  console.log("촬영이 끝나면 npm run demo:leave 로 되돌리세요.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
