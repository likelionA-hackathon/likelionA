"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await signOut({ redirectTo: "/login" });
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
      {loading ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}
