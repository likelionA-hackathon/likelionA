"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function LogoutButton({ signedIn = true }: { signedIn?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await signOut({ redirectTo: "/login" });
      // signOut 이 리다이렉트를 못 하는 경우(팝업 차단 등)를 위한 보험.
      window.location.assign("/login");
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void logout()}
      className="mt-5 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#d8d8d8] bg-white text-[10px] font-bold text-[#555] hover:bg-[#f3f3f3] hover:text-black disabled:cursor-wait disabled:opacity-60"
    >
      <span aria-hidden className="text-sm leading-none">↪</span>
      {loading ? "나가는 중..." : signedIn ? "로그아웃" : "둘러보기 종료"}
    </button>
  );
}
