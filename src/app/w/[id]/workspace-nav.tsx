"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 워크스페이스 상단 네비게이션.
 *
 * 전철우님: 대시보드를 만드시면서 여기 디자인을 바꾸셔도 됩니다.
 * 지금은 "클릭해서 화면 간 이동이 된다"를 만드는 게 목적입니다.
 * (시연 영상에서 주소창에 URL 을 타이핑하는 장면이 나오면 안 되므로)
 */

const ITEMS = [
  { path: "", label: "대시보드" },
  { path: "/actions", label: "다음 업무" },
  { path: "/board", label: "공유보드" },
  { path: "/connections", label: "연결 관리" },
];

export function WorkspaceNav({
  workspaceId,
  workspaceName,
  partnerName,
}: {
  workspaceId: string;
  workspaceName: string;
  partnerName: string | null;
}) {
  const pathname = usePathname();
  const base = `/w/${workspaceId}`;
  const onHandover = pathname.startsWith(`${base}/handovers`);

  return (
    <header className="sticky top-0 z-40 border-b border-[#e4e4e4] bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-6 px-5 sm:px-8">
        <Link href={base} className="shrink-0 text-[15px] font-bold tracking-[-0.03em] text-[#111]">
          Baton
        </Link>

        <div className="hidden shrink-0 items-center gap-1.5 text-[11px] text-[#6b6b6b] sm:flex">
          <span className="font-bold text-[#111]">{workspaceName}</span>
          {partnerName ? (
            <>
              <span className="text-[#c4c4c4]">↔</span>
              <span>{partnerName}</span>
            </>
          ) : null}
        </div>

        <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
          {ITEMS.map((item) => {
            const href = `${base}${item.path}`;
            const active = item.path === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={item.path}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                  active
                    ? "bg-[#7c3aed] text-white"
                    : "text-[#555] hover:bg-[#f4f4f4] hover:text-[#111]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {onHandover ? (
            <span className="shrink-0 rounded-full bg-[#f3efff] px-3.5 py-1.5 text-[12px] font-bold text-[#5b21b6]">
              인수인계
            </span>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
