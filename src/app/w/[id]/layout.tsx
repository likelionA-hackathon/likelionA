import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WorkspaceNav } from "./workspace-nav";
import { UserMenu } from "./user-menu";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  // 사이드바 하단에 실제 팀 정보를 보여줍니다. (자리표시자 텍스트였던 부분)
  const workspace = await prisma.workspace
    .findUnique({ where: { id }, select: { name: true, tagline: true } })
    .catch(() => null);

  if (!workspace) notFound();

  const link = await prisma.link
    .findFirst({
      where: { status: "ACTIVE", OR: [{ workspaceAId: id }, { workspaceBId: id }] },
      include: { workspaceA: { select: { name: true } }, workspaceB: { select: { name: true } } },
    })
    .catch(() => null);

  const partnerName = link
    ? link.workspaceAId === id
      ? (link.workspaceB?.name ?? null)
      : link.workspaceA.name
    : null;
  return (
    <div className="min-h-screen bg-white text-[#171717] lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-[#e5e5e5] bg-[#fafafa] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-5 py-6">
          <Link href={`/w/${id}`} className="text-[13px] font-extrabold tracking-[-0.02em]">PM CONNECTOR</Link>
          <WorkspaceNav workspaceId={id} />
          <div className="mt-auto hidden border-t border-[#e5e5e5] pt-5 lg:block">
            <p className="text-[11px] font-bold">{workspace.name}</p>
            <p className="mt-1 text-[10px] text-[#777]">{workspace.tagline ?? "워크스페이스"}</p>
            <p className="mt-4 text-[10px] text-[#777]">
              {partnerName ? `${partnerName} 와 연결됨` : "연결된 팀 없음"}
            </p>
            {currentUser ? (
              <UserMenu
                name={currentUser.name}
                email={currentUser.email}
                isGuest={currentUser.email === (process.env.DEMO_GUEST_EMAIL || "guest@pmconnector.dev")}
              />
            ) : null}
          </div>
        </div>
      </aside>
      <div className="min-w-0 px-5 py-6 sm:px-8 lg:px-10 lg:py-8"><div className="mx-auto w-full max-w-[1180px]">{children}</div></div>
    </div>
  );
}
