import Link from "next/link";
import { WorkspaceNav } from "./workspace-nav";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-white text-[#171717] lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-[#e5e5e5] bg-[#fafafa] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-5 py-6">
          <Link href={`/w/${id}`} className="text-[13px] font-extrabold tracking-[-0.02em]">PM CONNECTOR</Link>
          <WorkspaceNav workspaceId={id} />
          <div className="mt-auto hidden border-t border-[#e5e5e5] pt-5 lg:block">
            <p className="text-[11px] font-bold">팀 이름</p><p className="mt-1 text-[10px] text-[#777]">워크스페이스</p><p className="mt-4 text-[10px] text-[#777]">연결된 팀 있음</p>
          </div>
        </div>
      </aside>
      <div className="min-w-0 px-5 py-6 sm:px-8 lg:px-10 lg:py-8"><div className="mx-auto w-full max-w-[1180px]">{children}</div></div>
    </div>
  );
}
