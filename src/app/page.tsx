import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * 진입점.
 *
 * 접속하면 내 워크스페이스로 바로 들여보냅니다.
 * 시연 영상에서 주소창에 URL 을 타이핑하는 장면이 나오면 안 되므로,
 * 배포 주소만 열면 바로 서비스가 시작되어야 합니다.
 *
 * ⚠ 대시보드(/w/[id])가 만들어지면 아래 ENTRY 를 "" 로 바꾸세요. (지금은 404 라서 다음 업무로 보냄)
 */
const ENTRY = "/actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser().catch(() => null);

  if (user) {
    const membership = await prisma.membership
      .findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: { workspaceId: true },
      })
      .catch(() => null);

    if (membership) redirect(`/w/${membership.workspaceId}${ENTRY}`);
  }

  // 여기까지 왔으면 로그인이 안 됐거나 워크스페이스가 없는 상태입니다.
  const workspaces = await prisma.workspace
    .findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, tagline: true } })
    .catch(() => null);

  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <h1 className="text-2xl font-bold tracking-[-0.03em]">Baton</h1>
      <p className="mt-2 text-sm text-[#6b6b6b]">팀 간 인수인계 허브</p>

      {workspaces === null ? (
        <div className="mt-8 rounded-lg border border-[#dbdbdb] bg-white p-5 text-sm">
          <p className="font-bold">데이터베이스에 연결할 수 없습니다.</p>
          <p className="mt-2 text-[#6b6b6b]">
            <code className="rounded bg-[#f4f4f4] px-1.5 py-0.5">.env</code> 의 DATABASE_URL 을 확인하고,
            터미널에서 <code className="rounded bg-[#f4f4f4] px-1.5 py-0.5">npm run doctor</code> 를 실행해 보세요.
          </p>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="mt-8 rounded-lg border border-[#dbdbdb] bg-white p-5 text-sm">
          <p className="font-bold">워크스페이스가 없습니다.</p>
          <p className="mt-2 text-[#6b6b6b]">
            터미널에서 <code className="rounded bg-[#f4f4f4] px-1.5 py-0.5">npm run db:seed</code> 를 실행하세요.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <p className="text-xs font-bold text-[#6b6b6b]">워크스페이스 선택</p>
          <ul className="mt-3 space-y-2">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <Link
                  href={`/w/${ws.id}${ENTRY}`}
                  className="block rounded-lg border border-[#dbdbdb] bg-white px-4 py-3 transition hover:border-[#7c3aed]"
                >
                  <span className="text-sm font-bold">{ws.name}</span>
                  {ws.tagline ? <span className="ml-2 text-xs text-[#6b6b6b]">{ws.tagline}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
