import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WorkspaceNav } from "./workspace-nav";

/**
 * 워크스페이스 화면 공통 껍데기.
 *
 * /w/[id] 아래 모든 화면에 상단 네비게이션과 좌우 여백이 자동으로 붙습니다.
 * 각 화면 컴포넌트에서 여백을 따로 넣지 마세요.
 *
 * 전철우: 상단바 디자인을 바꾸시려면 workspace-nav.tsx 를 고치시면 됩니다.
 *         공용 파일이라 고치기 전에 팀방에 한마디 남겨주세요.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const workspace = await prisma.workspace
    .findUnique({ where: { id }, select: { id: true, name: true } })
    .catch(() => null);

  if (!workspace) notFound();

  // 파트너 팀 이름 — 상단에 "정산팀 ↔ 페이팀" 으로 표시
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
    <div className="min-h-screen bg-white">
      <WorkspaceNav
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        partnerName={partnerName}
      />
      <div className="mx-auto w-full max-w-[1200px] px-5 py-8 sm:px-8">{children}</div>
    </div>
  );
}
