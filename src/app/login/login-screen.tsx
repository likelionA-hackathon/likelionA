"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

const AUTH_ERROR_MESSAGE: Record<string, string> = {
  AccessDenied: "Google 로그인이 취소되었거나 접근 권한이 없습니다.",
  Configuration: "Google 로그인 설정을 확인해 주세요.",
  OAuthSignin: "Google 로그인 요청을 시작하지 못했습니다.",
  OAuthCallback: "Google 로그인 응답을 처리하지 못했습니다.",
  OAuthAccountNotLinked: "이미 다른 로그인 방식으로 가입된 이메일입니다.",
  Callback: "로그인 처리 중 오류가 발생했습니다.",
  Default: "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

export function LoginScreen({
  callbackUrl = "/",
  errorCode,
  oauthConfigured,
}: {
  callbackUrl?: string;
  errorCode?: string;
  oauthConfigured: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const safeCallbackUrl = callbackUrl.startsWith("/") ? callbackUrl : "/";
  const authError = errorCode
    ? AUTH_ERROR_MESSAGE[errorCode] ?? AUTH_ERROR_MESSAGE.Default
    : null;

  async function startGoogleLogin() {
    setLoading(true);
    setClientError(null);
    try {
      await signIn("google", { redirectTo: safeCallbackUrl });
    } catch {
      setClientError("Google 로그인 페이지를 열지 못했습니다. 다시 시도해 주세요.");
      setLoading(false);
    }
  }

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
          disabled={loading || !oauthConfigured}
          onClick={() => void startGoogleLogin()}
          className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-md border border-[#d8d8d8] bg-white text-xs font-bold hover:bg-[#f8f8f8] disabled:opacity-60"
        >
          <span className="text-base font-bold text-[#4285f4]">G</span>
          {loading ? "로그인 중..." : "Google 계정으로 계속하기"}
        </button>
        {!oauthConfigured ? (
          <p role="alert" className="mt-4 rounded-md bg-[#fff7ed] px-3 py-2 text-[10px] leading-4 text-[#9a3412]">
            Google OAuth 설정이 필요합니다. 환경변수를 설정한 뒤 서버를 다시 시작해 주세요.
          </p>
        ) : null}
        {authError || clientError ? (
          <p role="alert" className="mt-4 rounded-md bg-[#fff1f1] px-3 py-2 text-[10px] leading-4 text-[#b42318]">
            {clientError ?? authError}
          </p>
        ) : null}
        <p className="mt-6 text-[9px] leading-4 text-[#999]">
          계속하면 서비스 이용약관 및 개인정보 처리방침에 동의하게 됩니다.
        </p>
      </section>
    </main>
  );
}
