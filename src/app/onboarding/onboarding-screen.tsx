"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";

export function OnboardingScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().catch((caught) => {
      if (caught instanceof ApiError && caught.code === "UNAUTHENTICATED")
        router.replace("/login");
    });
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "create") {
        const workspace = await api.createWorkspace({
          name,
          tagline: tagline || undefined,
        });
        router.push(`/w/${workspace.id}`);
      } else {
        const me = await api.me();
        if (me.workspaces.length === 0) {
          setError("초대에 참여하려면 먼저 내 팀을 만들어야 합니다.");
          return;
        }
        await api.acceptInvite({
          inviteCode: inviteCode.trim(),
          workspaceId: me.workspaces[0].id,
        });
        router.push(`/w/${me.workspaces[0].id}`);
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "UNAUTHENTICATED")
        router.replace("/login");
      else if (caught instanceof ApiError && caught.code === "INVITE_NOT_FOUND")
        setError("유효하지 않은 초대 코드입니다.");
      else if (caught instanceof ApiError && caught.code === "INVITE_REVOKED")
        setError("만료된 초대 코드입니다.");
      else if (caught instanceof ApiError && caught.code === "SELF_LINK")
        setError("같은 팀의 초대 코드는 사용할 수 없습니다.");
      else if (caught instanceof ApiError && caught.code === "ALREADY_LINKED")
        setError("이미 다른 팀이 사용한 초대 코드입니다.");
      else
        setError(
          caught instanceof ApiError
            ? caught.message
            : "요청을 처리하지 못했습니다.",
        );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-5 py-12">
      <section className="w-full max-w-[520px] rounded-lg border border-[#e1e1e1] bg-white p-8">
        <p className="text-[11px] font-extrabold tracking-[0.12em]">
          PM CONNECTOR
        </p>
        <h1 className="mt-6 text-2xl font-extrabold tracking-[-0.04em]">
          워크스페이스 시작하기
        </h1>
        <p className="mt-2 text-xs text-[#777]">
          새 팀을 만들거나 전달받은 초대 코드로 파트너 팀과 연결하세요.
        </p>
        <div className="mt-7 grid grid-cols-2 rounded-md bg-[#f3f3f3] p-1">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`h-9 rounded text-xs font-bold ${mode === "create" ? "bg-white shadow-sm" : "text-[#777]"}`}
          >
            팀 만들기
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`h-9 rounded text-xs font-bold ${mode === "join" ? "bg-white shadow-sm" : "text-[#777]"}`}
          >
            초대 코드 참여
          </button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-5">
          {mode === "create" ? (
            <>
              <label className="block text-[11px] font-bold">
                팀 이름
                <input
                  required
                  maxLength={50}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 결제 플랫폼팀"
                  className="mt-2 h-11 w-full rounded-md border border-[#d8d8d8] px-3 text-xs outline-none focus:border-[#8b5cf6]"
                />
              </label>
              <label className="block text-[11px] font-bold">
                팀 설명 <span className="font-normal text-[#999]">(선택)</span>
                <input
                  maxLength={100}
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="예: 결제 백엔드 · 정산"
                  className="mt-2 h-11 w-full rounded-md border border-[#d8d8d8] px-3 text-xs outline-none focus:border-[#8b5cf6]"
                />
              </label>
            </>
          ) : (
            <label className="block text-[11px] font-bold">
              초대 코드
              <input
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="초대 코드를 입력하세요"
                className="mt-2 h-11 w-full rounded-md border border-[#d8d8d8] px-3 font-mono text-xs uppercase outline-none focus:border-[#8b5cf6]"
              />
            </label>
          )}
          {error ? (
            <p
              role="alert"
              className="rounded-md bg-[#fff1f1] px-3 py-2 text-[10px] text-[#b42318]"
            >
              {error}
            </p>
          ) : null}
          <button
            disabled={loading}
            className="h-11 w-full rounded-md bg-black text-xs font-bold text-white hover:bg-[#292929] disabled:opacity-50"
          >
            {loading
              ? "처리 중..."
              : mode === "create"
                ? "팀 만들기"
                : "초대 수락하기"}
          </button>
        </form>
      </section>
    </main>
  );
}
