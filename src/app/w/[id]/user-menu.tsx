"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

/**
 * 사이드바 하단 계정 영역.
 * 게스트로 들어온 사람도 여기서 나가서 실제 Google 로그인으로 갈아탈 수 있어야 합니다.
 */
export function UserMenu({
  name,
  email,
  isGuest,
}: {
  name: string | null;
  email: string;
  isGuest: boolean;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="mt-4 border-t border-[#e5e5e5] pt-4">
      <div className="flex items-center gap-2">
        <p className="min-w-0 truncate text-[10px] font-bold">{name ?? email}</p>
        {isGuest ? (
          <span className="shrink-0 rounded-full bg-[#f3f0ff] px-2 py-0.5 text-[9px] font-bold text-[#6d28d9]">
            게스트
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-[9px] text-[#999]">{email}</p>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setLoading(true);
          void signOut({ redirectTo: "/login" });
        }}
        className="mt-2 h-7 w-full rounded-md border border-[#dedede] text-[10px] font-bold text-[#666] hover:bg-[#f0f0f0] disabled:opacity-60"
      >
        {loading ? "로그아웃 중..." : isGuest ? "게스트 종료" : "로그아웃"}
      </button>
    </div>
  );
}
