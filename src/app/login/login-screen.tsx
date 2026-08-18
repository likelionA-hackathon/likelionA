"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginScreen({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-5">
      <section className="w-full max-w-[360px] rounded-lg border border-[#e1e1e1] bg-white px-8 py-10 text-center shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <p className="text-[11px] font-extrabold tracking-[0.14em]">
          PM CONNECTOR
        </p>
        <h1 className="mt-8 text-xl font-extrabold tracking-[-0.04em]">
          팀의 업무를 연결하세요
        </h1>
        <p className="mt-3 text-[11px] leading-5 text-[#777]">
          인수인계를 정리하고 다음 업무까지
          <br />한 곳에서 이어갑니다.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void signIn("google", {
              redirectTo: callbackUrl.startsWith("/") ? callbackUrl : "/",
            });
          }}
          className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-md border border-[#d8d8d8] bg-white text-xs font-bold hover:bg-[#f8f8f8] disabled:opacity-60"
        >
          <span className="text-base font-bold text-[#4285f4]">G</span>
          {loading ? "로그인 중..." : "Google 계정으로 계속하기"}
        </button>
        <p className="mt-6 text-[9px] leading-4 text-[#999]">
          계속하면 서비스 이용약관 및 개인정보 처리방침에 동의하게 됩니다.
        </p>
      </section>
    </main>
  );
}
