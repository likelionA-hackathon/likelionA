"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { RequestDTO } from "@/types/api";

type Props = { workspaceId: string };
type Direction = "INCOMING" | "OUTGOING";

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * 정보 요청.
 *
 * 인수인계 상세의 "추가 확인 필요" 항목에서 [요청 보내기] 를 누르면 상대 팀에 질문이 갑니다.
 * 지금까지는 보낸 뒤 받는 쪽이 답할 화면이 없어서 흐름이 끊겨 있었습니다.
 * 여기가 그 끝단입니다.
 */
export function RequestsScreen({ workspaceId }: Props) {
  const [direction, setDirection] = useState<Direction>("INCOMING");
  const [items, setItems] = useState<RequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.requests(workspaceId, { direction }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, direction]);

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(request: RequestDTO) {
    const text = (drafts[request.id] ?? "").trim();
    if (!text) {
      setError("답변을 입력해 주세요.");
      return;
    }
    setSending(request.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.answerRequest(request.id, text);
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDrafts((current) => ({ ...current, [request.id]: "" }));
      setNotice("답변을 보냈습니다. 상대 팀 화면에 바로 표시됩니다.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "답변을 보내지 못했습니다.");
    } finally {
      setSending(null);
    }
  }

  const openCount = items.filter((item) => item.status === "OPEN").length;

  return (
    <main className="pb-14">
      <header className="border-b border-[#e5e5e5] pb-5">
        <p className="text-[10px] font-semibold text-[#888]">팀 사이에 오간 질문</p>
        <h1 className="mt-1 text-lg font-extrabold tracking-[-0.03em]">정보 요청</h1>
        <p className="mt-2 text-[10px] leading-4 text-[#777]">
          인수인계만으로 판단이 안 될 때 상대 팀에 물어본 것들입니다. 답이 달리면 보낸 쪽 대시보드의 배지가 내려갑니다.
        </p>
      </header>

      <div role="tablist" aria-label="방향 필터" className="mt-5 flex gap-1">
        {(
          [
            { key: "INCOMING", label: "받은 요청" },
            { key: "OUTGOING", label: "보낸 요청" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={direction === tab.key}
            onClick={() => setDirection(tab.key)}
            className={`h-8 rounded-md px-4 text-[10px] font-bold ${direction === tab.key ? "bg-black text-white" : "border border-[#dedede] text-[#666] hover:bg-[#f7f7f7]"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice ? <p className="mt-4 rounded-md bg-[#f0fdf4] px-4 py-2 text-[10px] text-[#166534]">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-md bg-[#fff1f1] px-4 py-2 text-[10px] text-[#b42318]">{error}</p> : null}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center text-xs text-[#777]">불러오는 중입니다.</div>
      ) : (
        <>
          <p className="mt-5 text-[10px] text-[#777]">
            {items.length}건
            {direction === "INCOMING" && openCount > 0 ? ` · 답을 기다리는 요청 ${openCount}건` : ""}
          </p>

          <div className="mt-2 space-y-2">
            {items.length === 0 ? (
              <div className="rounded-md border border-[#e2e2e2] py-16 text-center text-[11px] text-[#777]">
                {direction === "INCOMING" ? "받은 요청이 없습니다." : "보낸 요청이 없습니다."}
                <br />
                <span className="text-[10px]">
                  인수인계 상세의 &quot;추가 확인 필요&quot; 항목에서 요청을 보낼 수 있습니다.
                </span>
              </div>
            ) : (
              items.map((request) => {
                const answered = request.status !== "OPEN";
                const counterpart = direction === "INCOMING" ? request.from : request.to;
                return (
                  <article key={request.id} className="rounded-md border border-[#e1e1e1] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${answered ? "bg-[#ecfdf3] text-[#067647]" : "bg-[#fff7ed] text-[#c2410c]"}`}
                          >
                            {request.statusLabel}
                          </span>
                          <span className="text-[9px] text-[#888]">
                            {direction === "INCOMING" ? `${counterpart.name} 이(가) 물었습니다` : `${counterpart.name} 에게 보냄`}
                          </span>
                          <span className="text-[9px] text-[#aaa]">{formatDateTime(request.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-[12px] font-bold leading-5">{request.question}</p>
                        {request.handover ? (
                          <Link
                            href={`/w/${workspaceId}/handovers/${request.handover.id}`}
                            className="mt-1.5 inline-block text-[9px] font-bold text-[#6d28d9] hover:underline"
                          >
                            출처: {request.handover.title}
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {request.answer ? (
                      <div className="mt-3 rounded-md bg-[#fafafa] p-3">
                        <p className="text-[9px] font-bold text-[#888]">답변</p>
                        <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-[#333]">{request.answer}</p>
                        {formatDateTime(request.answeredAt) ? (
                          <p className="mt-1.5 text-[9px] text-[#aaa]">{formatDateTime(request.answeredAt)}</p>
                        ) : null}
                      </div>
                    ) : direction === "INCOMING" ? (
                      <div className="mt-3">
                        <label className="sr-only" htmlFor={`answer-${request.id}`}>
                          답변 작성
                        </label>
                        <textarea
                          id={`answer-${request.id}`}
                          rows={3}
                          value={drafts[request.id] ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [request.id]: event.target.value }))
                          }
                          placeholder="상대 팀이 바로 업무를 이어갈 수 있게 답해 주세요."
                          className="w-full rounded-md border border-[#d8d8d8] p-3 text-[10px] leading-4 outline-none focus:border-[#7c3aed]"
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            disabled={sending === request.id}
                            onClick={() => void answer(request)}
                            className="h-8 rounded-md bg-black px-5 text-[10px] font-bold text-white disabled:opacity-50"
                          >
                            {sending === request.id ? "보내는 중..." : "답변 보내기"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 rounded-md border border-dashed border-[#dcdcdc] px-3 py-3 text-[10px] text-[#888]">
                        아직 답이 오지 않았습니다.
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </>
      )}
    </main>
  );
}
