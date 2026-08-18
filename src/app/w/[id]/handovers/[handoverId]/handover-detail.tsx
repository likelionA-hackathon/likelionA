"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DashboardDTO,
  HandoverChangeDTO,
  HandoverDetailDTO,
  NextActionDTO,
  RequestDTO,
} from "@/types/api";

type Props = { workspaceId: string; handoverId: string };

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message?: string; details?: unknown } };

const PRIORITY_STYLE: Record<string, string> = {
  red: "border-[#111] bg-[#111] text-white",
  orange: "border-[#2a2a2a] bg-white text-[#111]",
  slate: "border-[#d4d4d4] bg-[#f4f4f4] text-[#333]",
  gray: "border-[#e2e2e2] bg-[#f7f7f7] text-[#666]",
};

function isApiSuccess<T>(value: unknown): value is { ok: true; data: T } {
  return Boolean(value) && typeof value === "object" && (value as { ok?: unknown }).ok === true && "data" in (value as object);
}

function isApiFailure(value: unknown): value is { ok: false; error: { message?: string } } {
  return Boolean(value) && typeof value === "object" && (value as { ok?: unknown }).ok === false && "error" in (value as object);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let body: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      body = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new Error("서버 응답 JSON을 해석할 수 없습니다.");
    }
  } else if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `요청에 실패했습니다. (${response.status})`);
  } else {
    throw new Error("서버 응답 형식이 올바르지 않습니다.");
  }

  if (!response.ok) {
    if (isApiFailure(body)) {
      throw new Error(body.error.message ?? `요청에 실패했습니다. (${response.status})`);
    }
    throw new Error(`요청에 실패했습니다. (${response.status})`);
  }

  if (isApiSuccess<T>(body)) {
    return body.data;
  }

  throw new Error("서버 응답 형식이 올바르지 않습니다.");
}

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const base = `${map.year}-${map.month}-${map.day}`;
  return withTime ? `${base} ${map.hour}:${map.minute}` : base;
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-[#dbdbdb] bg-white px-5 py-10 text-center">
      <p className="text-xs font-bold text-[#111]">{label}</p>
      <p className="mt-2 text-[11px] text-[#6b6b6b]">잠시만 기다려주세요.</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-[#dbdbdb] bg-white px-5 py-10 text-center">
      <p className="text-xs font-bold text-[#111]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 h-8 rounded-[7px] border border-[#111] px-4 text-[11px] font-bold text-[#111] transition hover:bg-[#f6f6f6]"
      >
        다시 시도
      </button>
    </div>
  );
}

function PriorityPill({ priority }: { priority: NextActionDTO["priority"] }) {
  return (
    <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold ${PRIORITY_STYLE[priority.tone] ?? PRIORITY_STYLE.gray}`}>
      {priority.label}
    </span>
  );
}

function SectionTitle({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return <h2 className={`text-lg font-bold tracking-[-0.025em] ${accent ? "text-[#5b21b6]" : "text-[#111]"}`}>{children}</h2>;
}

function ChangesPanel({ changes }: { changes: HandoverChangeDTO[] }) {
  if (changes.length === 0) {
    return <div className="mt-3 rounded-lg border border-[#dbdbdb] bg-white px-5 py-8 text-center text-xs text-[#6b6b6b]">등록된 변경 사항이 없습니다.</div>;
  }
  return (
    <div className="mt-3 rounded-lg border border-[#dbdbdb] bg-white px-4">
      {changes.map((change, index) => (
        <div key={`${change.type}-${change.text}-${index}`} className="flex min-h-[58px] items-center justify-between gap-4 border-b border-[#e8e8e8] py-3 last:border-b-0">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#111]">{change.text}</p>
            {change.impact ? <p className="mt-1 line-clamp-1 text-[11px] text-[#6b6b6b]">{change.impact}</p> : null}
          </div>
          <span className="shrink-0 rounded-full border border-[#d8d8d8] bg-[#f8f8f8] px-3 py-1 text-[10px] font-bold text-[#222]">{change.typeLabel}</span>
        </div>
      ))}
    </div>
  );
}

function ContextPanel({ handover }: { handover: HandoverDetailDTO }) {
  const firstAction = handover.nextActions[0];
  const fields = [
    ["업무", handover.title],
    ["상태", handover.statusLabel],
    ["담당", firstAction?.assignee ?? handover.author ?? "미정"],
    ["선행 확인", handover.openQuestions[0]?.question ?? "별도 선행 확인 없음"],
    ["차단 요소", handover.changes.find((item) => item.impact)?.impact ?? "등록된 차단 요소 없음"],
    ["마감", formatDate(firstAction?.dueDate ?? null)],
  ];
  return (
    <div className="mt-3 rounded-lg border border-[#dbdbdb] bg-white p-5">
      <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] text-[#6b6b6b]">{label}</dt>
            <dd className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-5 text-[#111]" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
      {handover.workContext ? <p className="mt-5 whitespace-pre-line border-t border-[#eeeeee] pt-4 text-[12px] leading-6 text-[#666]">{handover.workContext}</p> : null}
    </div>
  );
}

function ActionCard({ action }: { action: NextActionDTO }) {
  return (
    <article className={`rounded-lg border p-4 ${action.origin === "AI" ? "border-[#7c3aed] bg-[#f7f3ff]" : "border-[#dbdbdb] bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-bold leading-5 text-[#111]">{action.title}</p>
        {action.aiDraft ? <span className="shrink-0 text-[10px] font-bold text-[#5b21b6]">AI 초안</span> : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-[11px] leading-5 text-[#6b6b6b]">
          <p>{action.assignee ?? "담당자 미정"}</p>
          <p>마감 {formatDate(action.dueDate)}</p>
        </div>
        <PriorityPill priority={action.priority} />
      </div>
    </article>
  );
}

export function HandoverDetailScreen({ workspaceId, handoverId }: Props) {
  const [handover, setHandover] = useState<HandoverDetailDTO | null>(null);
  const [workspaceName, setWorkspaceName] = useState("현재 팀");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"ack" | "request" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, dashboard] = await Promise.all([
        api<HandoverDetailDTO>(`/api/handovers/${handoverId}?workspaceId=${encodeURIComponent(workspaceId)}`),
        api<DashboardDTO>(`/api/workspaces/${workspaceId}/dashboard`),
      ]);
      setHandover(detail);
      setWorkspaceName(dashboard.workspace.name);
      setSelected(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "인수인계를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [handoverId, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const selectableCount = useMemo(
    () => handover?.openQuestions.filter((question) => !question.requested).length ?? 0,
    [handover],
  );

  async function acknowledge() {
    if (!handover || handover.status !== "NEW") return;
    setPending("ack");
    setNotice(null);
    try {
      const updated = await api<HandoverDetailDTO>(`/api/handovers/${handoverId}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ workspaceId }),
      });
      setHandover(updated);
      setNotice("인수인계를 확인했습니다.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "확인 처리에 실패했습니다.");
    } finally {
      setPending(null);
    }
  }

  async function sendRequests() {
    if (selected.size === 0) return;
    setPending("request");
    setNotice(null);
    try {
      await Promise.all([...selected].map((question) => api<RequestDTO>(`/api/workspaces/${workspaceId}/requests`, {
        method: "POST",
        body: JSON.stringify({ question, handoverItemId: handoverId }),
      })));
      setNotice(`${selected.size}개 항목의 요청 상태를 생성했습니다.`);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "요청 상태를 만들지 못했습니다.");
    } finally {
      setPending(null);
    }
  }

  if (loading) return <LoadingState label="인수인계를 불러오는 중입니다." />;
  if (error || !handover) return <ErrorState message={error ?? "인수인계를 찾을 수 없습니다."} onRetry={() => void load()} />;

  return (
    <article className="w-full min-w-0 pb-16 font-sans text-[#111]">
      <header className="flex flex-col gap-5 border-b border-[#dbdbdb] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-[-0.03em] sm:text-2xl" title={handover.title}>{handover.title}</h1>
          <p className="mt-2 text-[11px] text-[#6b6b6b]">{handover.from?.name ?? "내부 조직"} → {workspaceName} · {formatDate(handover.occurredAt, true)} KST</p>
        </div>
        <button
          type="button"
          disabled={handover.status !== "NEW" || pending !== null}
          onClick={() => void acknowledge()}
          className="h-9 shrink-0 rounded-[7px] border border-[#111] bg-[#111] px-6 text-xs font-bold text-white transition hover:bg-[#333] disabled:border-[#dbdbdb] disabled:bg-[#f6f6f6] disabled:text-[#6b6b6b]"
        >
          {pending === "ack" ? "처리 중" : handover.status === "NEW" ? "인수인계 확인" : "확인 완료"}
        </button>
      </header>

      <div className="mt-[30px] grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,820px)_312px] xl:gap-7">
        <div className="min-w-0 space-y-7">
          <section className="rounded-lg border border-[#7c3aed] bg-[#f7f3ff] px-5 py-4">
            <p className="text-xs font-bold text-[#5b21b6]">AI 요약</p>
            <p className="mt-3 whitespace-pre-line text-[13px] leading-[21px] text-[#111]">{handover.summary ?? "요약이 없습니다."}</p>
          </section>

          <section>
            <SectionTitle>변경 사항</SectionTitle>
            <ChangesPanel changes={handover.changes} />
          </section>

          <section>
            <SectionTitle>업무 맥락</SectionTitle>
            <ContextPanel handover={handover} />
          </section>
        </div>

        <aside className="min-w-0 space-y-7">
          <section>
            <SectionTitle>다음 업무</SectionTitle>
            <div className="mt-3 space-y-3">
              {handover.nextActions.length ? handover.nextActions.slice(0, 3).map((action) => <ActionCard key={action.id} action={action} />) : (
                <div className="rounded-lg border border-[#dbdbdb] bg-white px-4 py-7 text-center text-xs text-[#6b6b6b]">생성된 다음 업무가 없습니다.</div>
              )}
            </div>
          </section>

          <section>
            <SectionTitle accent>추가 확인 필요</SectionTitle>
            <div className="mt-3 rounded-lg border border-[#7c3aed] bg-[#f7f3ff] p-4">
              {handover.openQuestions.length ? (
                <div className="space-y-2.5">
                  {handover.openQuestions.map((question) => {
                    const checked = selected.has(question.question);
                    return (
                      <label key={question.question} className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[11px] leading-5 ${question.requested ? "border-[#dedede] bg-[#f2f2f2] text-[#8a8a8a]" : checked ? "border-[#7c3aed] bg-white text-[#111]" : "border-[#ded2f6] bg-white/60 text-[#111]"}`}>
                        <input
                          type="checkbox"
                          checked={question.requested || checked}
                          disabled={question.requested || pending !== null}
                          onChange={(event) => setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(question.question);
                            else next.delete(question.question);
                            return next;
                          })}
                          className="mt-0.5 h-4 w-4 accent-[#6d28d9]"
                        />
                        <span>{question.question}{question.requested ? <span className="mt-1 block text-[10px] font-bold">요청 받음 상태 생성됨</span> : null}</span>
                      </label>
                    );
                  })}
                  <button
                    type="button"
                    disabled={selected.size === 0 || pending !== null}
                    onClick={() => void sendRequests()}
                    className="mt-2 h-9 w-full rounded-[7px] border border-[#6d28d9] bg-[#6d28d9] text-xs font-bold text-white transition hover:bg-[#5b21b6] disabled:border-[#d8cdef] disabled:bg-[#e9e2f7] disabled:text-[#8d7ab6]"
                  >
                    {pending === "request" ? "요청 처리 중" : `요청 보내기${selected.size ? ` (${selected.size})` : ""}`}
                  </button>
                </div>
              ) : <p className="py-3 text-center text-xs text-[#6b6b6b]">추가 확인 제안이 없습니다.</p>}
              {selectableCount === 0 && handover.openQuestions.length ? <p className="mt-3 text-center text-[10px] text-[#777]">모든 항목을 요청했습니다.</p> : null}
            </div>
          </section>

          <section>
            <SectionTitle>첨부 시안</SectionTitle>
            <div className="mt-3 flex min-h-[118px] items-center justify-center rounded-lg border border-dashed border-[#d6d6d6] bg-[#fafafa] px-4 text-center text-[11px] leading-5 text-[#8a8a8a]">첨부된 이미지 또는 파일이 없습니다.</div>
          </section>
        </aside>
      </div>

      {notice ? <div role="status" className="fixed bottom-5 right-5 z-30 max-w-sm rounded-lg border border-[#dbdbdb] bg-white px-4 py-3 text-xs font-bold text-[#111] shadow-lg">{notice}</div> : null}
    </article>
  );
}
