"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { HandoverDetailDTO, HandoverListItemDTO, PriorityBadge } from "@/types/api";

type Props = { workspaceId: string };

function PriorityBadgeView({ priority }: { priority: PriorityBadge }) {
  return <span data-tone={priority.tone} title={priority.reason ?? priority.raw ?? undefined} className="inline-flex min-w-12 justify-center rounded-full border px-3 py-1 text-[9px] font-bold data-[tone=red]:border-black data-[tone=red]:bg-black data-[tone=red]:text-white data-[tone=orange]:border-[#fed7aa] data-[tone=orange]:bg-[#fff7ed] data-[tone=orange]:text-[#c2410c] data-[tone=slate]:border-[#cbd5e1] data-[tone=slate]:bg-[#f1f5f9] data-[tone=slate]:text-[#334155] data-[tone=gray]:border-[#e5e7eb] data-[tone=gray]:bg-white data-[tone=gray]:text-[#6b7280]">{priority.label}</span>;
}

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
 * AI 업무 정의.
 *
 * 인수인계 원문 → AI 산출물(요약·우선순위·다음 업무)이 어떻게 만들어지는지
 * 한 화면에서 보여주는 곳입니다. 심사에서 "하드코딩 아니냐"는 질문에
 * 원문과 산출물을 나란히 두고 답할 수 있어야 해서 원문도 같이 띄웁니다.
 */
export function AiWorkScreen({ workspaceId }: Props) {
  const [list, setList] = useState<HandoverListItemDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HandoverDetailDTO | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setListLoading(true);
      try {
        const items = await api.handovers(workspaceId, { take: 30 });
        if (!alive) return;
        setList(items);
        setSelectedId((prev) => prev ?? items[0]?.id ?? null);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "인수인계를 불러오지 못했습니다.");
      } finally {
        if (alive) setListLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const loadDetail = useCallback(async (handoverId: string) => {
    setDetailLoading(true);
    setGenError(null);
    setMessage(null);
    try {
      setDetail(await api.handover(handoverId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "인수인계를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function generate() {
    if (!selectedId) return;
    setGenerating(true);
    setGenError(null);
    setMessage(null);
    try {
      const actions = await api.generateActions(selectedId);
      setMessage(`다음 업무 ${actions.length}개를 만들었습니다.`);
      await loadDetail(selectedId);
    } catch (caught) {
      setGenError(
        caught instanceof ApiError && caught.code === "AI_DISABLED"
          ? "AI 키가 설정되지 않았습니다. 환경변수를 확인해 주세요."
          : caught instanceof ApiError && caught.code === "NO_ACTIONS"
            ? "이 문서에서는 뽑아낼 업무를 찾지 못했습니다. 원문이 너무 짧을 수 있습니다."
            : caught instanceof Error
              ? caught.message
              : "업무를 생성하지 못했습니다.",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (listLoading) {
    return <div className="flex min-h-[520px] items-center justify-center text-xs text-[#777]">인수인계를 불러오는 중입니다.</div>;
  }

  const generatedAt = formatDateTime(detail?.ai?.generatedAt ?? null);

  return (
    <main className="pb-14">
      <header className="border-b border-[#e5e5e5] pb-5">
        <p className="text-[10px] font-semibold text-[#888]">원문에서 업무를 뽑아내는 단계</p>
        <h1 className="mt-1 text-lg font-extrabold tracking-[-0.03em]">AI 업무 정의</h1>
        <p className="mt-2 text-[10px] leading-4 text-[#777]">
          인수인계 문서를 고르면 AI 가 정리한 요약·우선순위와 그 근거를 보여줍니다. 다음 업무를 새로 뽑거나 다시 뽑을 수 있습니다.
        </p>
      </header>

      {error ? <p role="alert" className="mt-4 rounded-md bg-[#fff1f1] px-4 py-2 text-[10px] text-[#b42318]">{error}</p> : null}

      {list.length === 0 ? (
        <div className="mt-6 rounded-md border border-[#e2e2e2] py-16 text-center text-[11px] text-[#777]">
          아직 인수인계가 없습니다.
          <br />
          <Link href={`/w/${workspaceId}`} className="mt-2 inline-block text-[10px] font-bold text-[#6d28d9] hover:underline">
            대시보드에서 Notion 동기화하기
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside>
            <p className="text-[10px] font-bold text-[#666]">인수인계 문서</p>
            <div className="mt-2 space-y-1">
              {list.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={active}
                    className={`w-full rounded-md border px-3 py-2.5 text-left ${active ? "border-[#7c3aed] bg-[#faf8ff]" : "border-[#e5e5e5] hover:bg-[#fafafa]"}`}
                  >
                    <p className="truncate text-[10px] font-extrabold">{item.title}</p>
                    <p className="mt-1 text-[9px] text-[#888]">
                      {item.priority.label} · 업무 {item.nextActionCount}개
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <section>
            {detailLoading || !detail ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-md border border-[#e5e5e5] text-xs text-[#777]">불러오는 중입니다.</div>
            ) : (
              <>
                <div className="rounded-md border border-[#e1e1e1] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[13px] font-extrabold">{detail.title}</h2>
                      <p className="mt-1 text-[9px] text-[#888]">
                        {detail.source.provider} · {detail.author ?? "작성자 미상"}
                        {detail.source.url ? (
                          <>
                            {" · "}
                            <a href={detail.source.url} target="_blank" rel="noreferrer" className="font-bold text-[#6d28d9] hover:underline">
                              원문 열기
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <PriorityBadgeView priority={detail.priority} />
                  </div>

                  <p className="mt-3 text-[11px] leading-5 text-[#333]">{detail.summary ?? "요약이 아직 생성되지 않았습니다."}</p>

                  {detail.priority.reason ? (
                    <p className="mt-3 rounded-md bg-[#fafafa] px-3 py-2 text-[9px] leading-4 text-[#666]">
                      <span className="font-bold">우선순위 근거</span> · {detail.priority.raw ? `원문 값 "${detail.priority.raw}" → ` : ""}
                      {detail.priority.reason}
                    </p>
                  ) : null}

                  <p className="mt-3 text-[9px] text-[#999]">
                    {detail.ai?.model ? `모델 ${detail.ai.model}` : "AI 산출 정보 없음"}
                    {generatedAt ? ` · ${generatedAt} 생성` : ""}
                  </p>

                  <button type="button" onClick={() => setShowRaw((prev) => !prev)} className="mt-3 text-[9px] font-bold text-[#6d28d9] hover:underline">
                    {showRaw ? "원문 접기" : "AI 가 읽은 원문 보기"}
                  </button>
                  {showRaw ? (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-[#fafafa] p-3 text-[9px] leading-4 text-[#444]">{detail.rawContent}</pre>
                  ) : null}
                </div>

                {detail.changes.length > 0 || detail.openQuestions.length > 0 ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-md border border-[#e1e1e1] p-4">
                      <p className="text-[11px] font-extrabold text-[#6d28d9]">AI 가 찾은 변경사항 {detail.changes.length}</p>
                      <ul className="mt-2 space-y-2">
                        {detail.changes.map((change, index) => (
                          <li key={`${change.text}-${index}`} className="text-[10px] leading-4">
                            <span className="mr-1 font-bold text-[#888]">[{change.typeLabel}]</span>
                            {change.text}
                            {change.impact ? <span className="block text-[9px] text-[#888]">영향: {change.impact}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-md border border-[#e1e1e1] p-4">
                      <p className="text-[11px] font-extrabold text-[#6d28d9]">추가 확인이 필요한 항목 {detail.openQuestions.length}</p>
                      <ul className="mt-2 space-y-2">
                        {detail.openQuestions.map((question, index) => (
                          <li key={`${question.question}-${index}`} className="text-[10px] leading-4">
                            {question.question}
                            {question.why ? <span className="block text-[9px] text-[#888]">{question.why}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 rounded-md border border-[#e1e1e1] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] font-extrabold text-[#6d28d9]">정의된 다음 업무 {detail.nextActions.length}</p>
                    <div className="flex items-center gap-2">
                      <Link href={`/w/${workspaceId}/actions`} className="text-[9px] font-bold text-[#777] hover:underline">
                        전체 업무 보기
                      </Link>
                      <button
                        type="button"
                        disabled={generating}
                        onClick={() => void generate()}
                        className="h-8 rounded-md bg-black px-4 text-[10px] font-bold text-white disabled:opacity-50"
                      >
                        {generating ? "생성 중..." : detail.nextActions.length > 0 ? "다시 생성" : "AI 로 업무 생성"}
                      </button>
                    </div>
                  </div>

                  {message ? <p className="mt-3 rounded-md bg-[#f0fdf4] px-3 py-2 text-[10px] text-[#166534]">{message}</p> : null}
                  {genError ? <p role="alert" className="mt-3 rounded-md bg-[#fff1f1] px-3 py-2 text-[10px] text-[#b42318]">{genError}</p> : null}
                  <p className="mt-2 text-[9px] text-[#999]">다시 생성하면 AI 초안만 새로 만들고, 사람이 수정한 업무는 그대로 남습니다.</p>

                  <div className="mt-3 space-y-2">
                    {detail.nextActions.length === 0 ? (
                      <div className="rounded-md border border-dashed border-[#dcdcdc] py-10 text-center text-[10px] text-[#888]">
                        아직 정의된 업무가 없습니다. 위 버튼을 누르면 원문에서 뽑아냅니다.
                      </div>
                    ) : (
                      detail.nextActions.map((action) => (
                        <div key={action.id} className="rounded-md border border-[#ececec] px-3 py-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {action.aiDraft ? <span className="rounded-full bg-[#f3f0ff] px-2 py-0.5 text-[9px] font-bold text-[#6d28d9]">AI 초안</span> : null}
                                <p className="truncate text-[11px] font-bold">{action.title}</p>
                              </div>
                              {action.description ? <p className="mt-1 whitespace-pre-wrap text-[9px] leading-4 text-[#777]">{action.description}</p> : null}
                              <p className="mt-1 text-[9px] text-[#999]">담당 {action.assignee ?? "미정"} · {action.statusLabel}</p>
                            </div>
                            <PriorityBadgeView priority={action.priority} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
