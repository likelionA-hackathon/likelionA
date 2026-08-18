"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { label: "대시보드", href: "" },
  { label: "인수인계" },
  { label: "다음 업무", href: "/actions" },
  { label: "공유 보드" },
  { label: "AI 업무 정의" },
  { label: "연결 관리", href: "/connections" },
];

export function WorkspaceNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="워크스페이스 메뉴" className="mt-8 grid grid-cols-3 gap-1 lg:block lg:space-y-1">
      {navigation.map((item) => {
        const href = item.href === undefined ? null : `/w/${workspaceId}${item.href}`;
        const active = href === pathname;
        const content = <><span aria-hidden className="text-[15px] leading-none text-[#777]">□</span><span>{item.label}</span></>;
        const classes = `flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[11px] font-semibold ${active ? "bg-[#f0f0f0] text-black" : "text-[#666] hover:bg-[#f3f3f3]"}`;
        return href ? <Link key={item.label} href={href} className={classes}>{content}</Link> : <span key={item.label} className={`${classes} cursor-default`}>{content}</span>;
      })}
    </nav>
  );
}
