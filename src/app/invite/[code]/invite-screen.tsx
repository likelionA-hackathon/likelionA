"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import type { WorkspaceDTO } from "@/types/api";

export function InviteScreen({ code }: { code: string }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceDTO[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    api
      .me()
      .then((me) => {
        setWorkspaces(me.workspaces);
        setSelected(me.workspaces[0]?.id ?? "");
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.code === "UNAUTHENTICATED")
          router.replace(
            `/login?callbackUrl=${encodeURIComponent(`/invite/${code}`)}`,
          );
        else
          setError(
            caught instanceof ApiError
              ? caught.message
              : "사용자 정보를 불러오지 못했습니다.",
          );
      });
  }, [code, router]);
  async function accept() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      await api.acceptInvite({ inviteCode: code, workspaceId: selected });
      router.push(`/w/${selected}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "UNAUTHENTICATED")
        router.replace(
          `/login?callbackUrl=${encodeURIComponent(`/invite/${code}`)}`,
        );
      else if (caught instanceof ApiError && caught.code === "INVITE_NOT_FOUND")
        setError("유효하지 않은 초대입니다.");
      else if (caught instanceof ApiError && caught.code === "INVITE_REVOKED")
        setError("만료된 초대입니다.");
      else if (caught instanceof ApiError && caught.code === "SELF_LINK")
        setError("같은 팀끼리는 연결할 수 없습니다.");
      else if (caught instanceof ApiError && caught.code === "ALREADY_LINKED")
        setError("이미 다른 팀과 연결된 초대입니다.");
      else
        setError(
          caught instanceof ApiError
            ? caught.message
            : "초대를 수락하지 못했습니다.",
        );
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fafafa] px-5">
      <section className="w-full max-w-[440px] rounded-lg border border-[#e1e1e1] bg-white p-8 text-center">
        <p className="text-[11px] font-extrabold tracking-[0.12em]">
          PM CONNECTOR
        </p>
        <h1 className="mt-7 text-xl font-extrabold">파트너 팀 초대</h1>
        <p className="mt-2 text-xs text-[#777]">
          내 워크스페이스를 선택해 팀 연결을 완료하세요.
        </p>
        <p className="mt-6 rounded-md bg-[#f6f3ff] py-3 font-mono text-sm font-bold text-[#6d28d9]">
          {code.toUpperCase()}
        </p>
        {workspaces?.length === 0 ? (
          <div className="mt-6">
            <p className="text-xs text-[#777]">먼저 내 팀을 만들어야 합니다.</p>
            <Link
              href="/onboarding"
              className="mt-4 inline-flex h-10 items-center rounded-md bg-black px-6 text-xs font-bold text-white"
            >
              팀 만들기
            </Link>
          </div>
        ) : (
          <>
            <select
              aria-label="워크스페이스 선택"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-6 h-11 w-full rounded-md border border-[#d8d8d8] px-3 text-xs"
            >
              {workspaces?.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selected || loading}
              onClick={() => void accept()}
              className="mt-4 h-11 w-full rounded-md bg-black text-xs font-bold text-white disabled:opacity-50"
            >
              {loading ? "연결 중..." : "초대 수락하기"}
            </button>
          </>
        )}
        {error ? (
          <p role="alert" className="mt-4 text-[10px] text-[#b42318]">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
