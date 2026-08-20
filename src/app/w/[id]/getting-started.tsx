"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { ConnectionDTO, PartnerDTO } from "@/types/api";

/**
 * 새로 만든 팀에서 처음 보게 되는 안내.
 *
 * 실제 Google 로그인으로 들어온 사람은 워크스페이스가 텅 비어 있습니다.
 * 그 상태에서 빈 대시보드만 보여주면 "그래서 뭘 하라는 거지"가 되기 때문에,
 * 인수인계가 한 건이라도 들어올 때까지 이 3단계를 대신 띄웁니다.
 * (게스트 팀은 이미 데이터가 있어서 이 블록이 아예 렌더되지 않습니다.)
 */
export function GettingStarted({
  workspaceId,
  onChanged,
}: {
  workspaceId: string;
  onChanged: () => void;
}) {
  const [connections, setConnections] = useState<ConnectionDTO[] | null>(null);
  const [partner, setPartner] = useState<PartnerDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    try {
      const [items, link] = await Promise.all([api.connections(workspaceId), api.getLink(workspaceId)]);
      setConnections(items);
      setPartner(link);
    } catch {
      setConnections([]);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const notion = connections?.find((item) => item.provider === "NOTION") ?? null;
  const notionDone = notion?.status === "CONNECTED";
  const partnerDone = partner?.status === "ACTIVE";

  async function createInvite() {
    setBusy("invite");
    setError(null);
    setMessage(null);
    try {
      setPartner(await api.createInvite(workspaceId));
      setMessage("초대 링크를 만들었습니다. 파트너 팀에 전달하세요.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "초대를 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function copyInvite() {
    if (!partner?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(`${origin}/invite/${partner.inviteCode}`);
      setMessage("초대 링크를 복사했습니다.");
    } catch {
      setError("복사하지 못했습니다. 아래 주소를 직접 복사해 주세요.");
    }
  }

  async function sync() {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      const result = await api.notionSync(workspaceId);
      const total = result.created + result.updated;
      setMessage(
        total > 0
          ? `${total}건을 가져왔습니다. AI 요약과 우선순위가 함께 만들어집니다.`
          : "가져올 새 문서가 없습니다. Notion 데이터베이스에 문서를 먼저 추가해 주세요.",
      );
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "NOTION_NOT_CONNECTED"
          ? "Notion을 먼저 연결해 주세요."
          : caught instanceof ApiError
            ? caught.message
            : "동기화하지 못했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  const steps = [
    {
      key: "notion",
      done: notionDone,
      title: "Notion 연결하기",
      body: notionDone
        ? `${notion?.displayName ?? "데이터베이스"} 와 연결되어 있습니다.`
        : "인수인계 문서가 들어 있는 Notion 데이터베이스를 연결합니다. Internal Integration Token 과 Database ID 가 필요합니다.",
      action: (
        <Link
          href={`/w/${workspaceId}/connections#service-connections`}
          className="flex h-9 items-center rounded-md bg-black px-5 text-[10px] font-bold text-white hover:bg-[#333]"
        >
          {notionDone ? "연결 정보 보기" : "Notion 연결하러 가기"}
        </Link>
      ),
    },
    {
      key: "partner",
      done: partnerDone,
      title: "파트너 팀 연결하기",
      body: partnerDone
        ? `${partner?.partner?.name ?? "파트너 팀"} 과 연결되어 있습니다.`
        : partner?.inviteCode
          ? "초대 링크를 파트너 팀에 전달하세요. 상대가 수락하면 두 팀이 연결됩니다."
          : "인수인계를 주고받을 상대 팀을 초대합니다. 혼자서도 나머지 기능은 쓸 수 있습니다.",
      action: partnerDone ? null : partner?.inviteCode ? (
        <button
          type="button"
          onClick={() => void copyInvite()}
          className="h-9 rounded-md border border-[#d8d8d8] px-5 text-[10px] font-bold hover:bg-[#f7f7f7]"
        >
          초대 링크 복사
        </button>
      ) : (
        <button
          type="button"
          disabled={busy === "invite"}
          onClick={() => void createInvite()}
          className="h-9 rounded-md border border-[#d8d8d8] px-5 text-[10px] font-bold hover:bg-[#f7f7f7] disabled:opacity-50"
        >
          {busy === "invite" ? "생성 중..." : "초대 링크 만들기"}
        </button>
      ),
      extra:
        !partnerDone && partner?.inviteCode ? (
          <p className="mt-2 truncate rounded-md bg-white px-3 py-2 font-mono text-[10px] text-[#555]">
            {origin}/invite/{partner.inviteCode}
          </p>
        ) : null,
    },
    {
      key: "sync",
      done: false,
      title: "첫 동기화 실행하기",
      body: notionDone
        ? "Notion 문서를 가져와 AI가 요약·우선순위·다음 업무를 만듭니다. 건당 1~3초 걸립니다."
        : "Notion을 연결하면 여기서 첫 동기화를 돌릴 수 있습니다.",
      action: (
        <button
          type="button"
          disabled={!notionDone || busy === "sync"}
          onClick={() => void sync()}
          className="h-9 rounded-md bg-[#7c3aed] px-5 text-[10px] font-bold text-white hover:bg-[#6d28d9] disabled:opacity-40"
        >
          {busy === "sync" ? "가져오는 중..." : "동기화 실행"}
        </button>
      ),
    },
  ];

  return (
    <section aria-label="시작하기" className="mt-6 rounded-md border border-[#a78bfa] bg-[#faf8ff] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-extrabold text-[#5b21b6]">시작하기</h2>
          <p className="mt-1 text-[10px] leading-4 text-[#666]">
            아직 인수인계가 없습니다. 아래 세 가지를 마치면 실제 문서가 이 화면에 채워집니다.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[9px] font-bold text-[#6d28d9]">
          {[notionDone, partnerDone].filter(Boolean).length}/2 연결됨
        </span>
      </div>

      {message ? <p className="mt-4 rounded-md bg-[#f0fdf4] px-3 py-2 text-[10px] text-[#166534]">{message}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-md bg-[#fff1f1] px-3 py-2 text-[10px] text-[#b42318]">{error}</p> : null}

      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => (
          <li key={step.key} className="rounded-md border border-[#e6e0f7] bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${step.done ? "bg-[#ecfdf3] text-[#067647]" : "bg-[#f3f0ff] text-[#6d28d9]"}`}
                  >
                    {step.done ? "✓" : index + 1}
                  </span>
                  <p className="text-[11px] font-extrabold">{step.title}</p>
                  {step.done ? <span className="text-[9px] font-bold text-[#067647]">완료</span> : null}
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-[#666]">{step.body}</p>
                {step.extra ?? null}
              </div>
              {step.action ? <div className="shrink-0">{step.action}</div> : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[9px] leading-4 text-[#999]">
        연결 정보는 이 워크스페이스에만 저장되며, 연결 관리 화면에서 언제든 바꿀 수 있습니다.
      </p>
    </section>
  );
}
