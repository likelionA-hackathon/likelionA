"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 6개 전부 실제 페이지가 있습니다. 클릭해도 안 움직이는 메뉴는 두지 않습니다.
const navigation = [
  { label: "대시보드", href: "" },
  { label: "인수인계", href: "/handovers" },
  { label: "다음 업무", href: "/actions" },
  { label: "공유 보드", href: "/board" },
  { label: "정보 요청", href: "/requests" },
  { label: "AI 업무 정의", href: "/ai" },
  { label: "연결 관리", href: "/connections" },
];

export function WorkspaceNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="워크스페이스 메뉴" className="mt-8 grid grid-cols-3 gap-1 lg:block lg:space-y-1">
      {navigation.map((item) => {
        const href = `/w/${workspaceId}${item.href}`;
        // 인수인계는 상세(/handovers/:id)에서도 메뉴가 켜져 있어야 합니다.
        const active = item.href === "" ? href === pathname : pathname.startsWith(href);
        const classes = `flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[11px] font-semibold ${active ? "bg-[#f0f0f0] text-black" : "text-[#666] hover:bg-[#f3f3f3]"}`;
        return (
          <Link key={item.label} href={href} className={classes}>
            <span aria-hidden className="text-[15px] leading-none text-[#777]">□</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
