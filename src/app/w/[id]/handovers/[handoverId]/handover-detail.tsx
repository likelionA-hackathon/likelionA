"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  ApiResponse,
  HandoverChangeDTO,
  HandoverDetailDTO,
  HandoverQuestionDTO,
  NextActionDTO,
  PriorityBadge,
  RequestDTO,
} from "@/types/api";

type HandoverDetailScreenProps = {
  workspaceId: string;
  handoverId: string;
};

class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json()) as ApiResponse<T>;

  if (!json.ok) {
    throw new ApiClientError(json.error.code, json.error.message);
  }

  return json.data;
}

const priorityStyles: Record<PriorityBadge["tone"], string> = {
  red: "border-[#111] bg-[#111] text-white",
  orange: "border-[#dbdbdb] bg-[#f6f6f6] text-[#111]",
  slate: "border-[#dbdbdb] bg-[#f6f6f6] text-[#111]",
  gray: "border-[#dbdbdb] bg-white text-[#6b6b6b]",
};

function formatDate(value: string | null, withTime = false) {
  if (!value) return "미정";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(value));
}

function DetailState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <section className="w-full font-sans text-[#111]" aria-live="polite">
      <h1 className="text-xl font-bold tracking-[-0.03em] sm:text-2xl">{title}</h1>
      <div className="mt-6 rounded-lg border border-[#dbdbdb] bg-[#fbfbfb] px-5 py-8 text-center">
        <p className="text-sm text-[#6b6b6b]">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 h-9 rounded-[7px] border border-[#111] bg-[#111] px-5 text-xs font-bold text-white"
          >
            다시 시도
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SectionHeading({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <h2 className={`text-lg font-bold tracking-[-0.025em] ${accent ? "text-[#5b21b6]" : "text-[#111]"}`}>
      {children}
    </h2>
  );
}

function PriorityPill({ priority }: { priority: PriorityBadge }) {
  return (
    <span
      title={priority.reason ?? undefined}
      className={`inline-flex h-6 items-center justify-center rounded-full border px-3 text-[11px] font-bold ${priorityStyles[priority.tone]}`}
    >
      {priority.label}
    </span>
  );
}

function ChangesPanel({ changes }: { changes: HandoverChangeDTO[] }) {
  if (changes.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-[#dbdbdb] bg-white px-5 py-8 text-center text-xs text-[#6b6b6b]">
        등록된 변경 사항이 없습니다.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[#dbdbdb] bg-white px-4">
      {changes.map((change) => (
        <div
          key={`${change.type}-${change.text}`}
          className="flex min-h-[54px] flex-col items-start justify-between gap-3 border-b border-[#dbdbdb] py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#111]">{change.text}</p>
            <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-[#6b6b6b]" title={change.impact}>
              {change.impact}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[#dbdbdb] bg-[#f6f6f6] px-3 py-1 text-[11px] font-bold text-[#111]">
            {change.typeLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

function ContextField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[#6b6b6b]">{label}</dt>
      <dd className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-5 text-[#111]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ContextPanel({ handover }: { handover: HandoverDetailDTO }) {
  const pendingQuestionCount = handover.openQuestions.filter((question) => !question.requested).length;

  return (
    <div className="mt-3 rounded-lg border border-[#dbdbdb] bg-white p-5">
      <p className="whitespace-pre-line text-[13px] leading-6 text-[#333]">{handover.workContext ?? "등록된 업무 맥락이 없습니다."}</p>
      <dl className="mt-5 grid gap-x-10 gap-y-5 border-t border-[#eeeeee] pt-5 sm:grid-cols-2">
        <ContextField label="상태" value={handover.statusLabel} />
        <ContextField label="전달 팀" value={handover.from?.name ?? "내부 인수인계"} />
        <ContextField label="작성자" value={handover.author ?? "미지정"} />
        <ContextField label="받은 시각" value={formatDate(handover.occurredAt, true)} />
        <ContextField label="확인 필요한 항목" value={pendingQuestionCount > 0 ? `${pendingQuestionCount}건` : "없음"} />
        <ContextField label="연결된 다음 업무" value={handover.nextActions.length > 0 ? `${handover.nextActions.length}건` : "없음"} />
      </dl>
    </div>
  );
}

function ActionCard({ action }: { action: NextActionDTO }) {
  const isAiAction = action.origin === "AI";

  return (
    <article className={`rounded-lg border p-4 ${isAiAction ? "border-[#7c3aed] bg-[#f7f3ff]" : "border-[#dbdbdb] bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-bold leading-5 text-[#111]">{action.title}</p>
        {action.aiDraft ? <span className="shrink-0 text-[10px] font-bold text-[#5b21b6]">AI 초안</span> : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-[11px] leading-5 text-[#6b6b6b]">
          <p>{action.assignee ?? "담당자 미정"} · {action.statusLabel}</p>
          <p>마감 {formatDate(action.dueDate)}</p>
        </div>
        <PriorityPill priority={action.priority} />
      </div>
    </article>
  );
}

function QuestionsPanel({
  questions,
  partnerName,
  pending,
  onWriteRequest,
}: {
  questions: HandoverQuestionDTO[];
  partnerName: string;
  pending: boolean;
  onWriteRequest: (question: string) => void;
}) {
  if (questions.length === 0) {
    return (
      <div id="ai-questions" className="rounded-lg border border-[#7c3aed] bg-[#f7f3ff] px-4 py-7 text-center text-xs text-[#6b6b6b]">
        추가 확인 제안이 없습니다.
      </div>
    );
  }

  return (
    <div id="ai-questions" className="rounded-lg border border-[#7c3aed] bg-[#f7f3ff] p-4">
      <ul className="divide-y divide-[#ded2f6] text-xs leading-5 text-[#111]">
        {questions.map((question) => (
          <li key={question.question} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{question.question}</p>
              {question.requested ? (
                <span className="shrink-0 text-[10px] font-bold text-[#6b6b6b]">요청함</span>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onWriteRequest(question.question)}
                  className="shrink-0 rounded-md border border-[#7c3aed] bg-white px-2.5 py-1 text-[10px] font-bold text-[#5b21b6] transition hover:bg-[#efe7ff] disabled:cursor-default disabled:opacity-50"
                >
                  요청 작성
                </button>
              )}
            </div>
            {question.why ? <p className="mt-1 text-[11px] leading-4 text-[#6b6b6b]">{question.why}</p> : null}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={pending}
        onClick={() => onWriteRequest("")}
        className="mt-4 h-9 w-full rounded-[7px] border border-[#dbdbdb] bg-white text-xs font-bold text-[#111] transition hover:border-[#111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111] disabled:cursor-default disabled:bg-[#f6f6f6] disabled:text-[#9e9e9e]"
      >
        {pending ? "요청 전송 중" : `${partnerName}에 직접 요청 작성`}
      </button>
    </div>
  );
}

function InformationRequestDialog({
  open,
  partnerName,
  handoverTitle,
  message,
  sourceQuestion,
  pending,
  onMessageChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  partnerName: string;
  handoverTitle: string;
  message: string;
  sourceQuestion: string | null;
  pending: boolean;
  onMessageChange: (message: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="information-request-title"
        className="w-full max-w-[520px] rounded-xl border border-[#dbdbdb] bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 id="information-request-title" className="text-lg font-bold tracking-[-0.025em] text-[#111]">
              정보 요청 보내기
            </h2>
            <p className="mt-1.5 text-xs text-[#6b6b6b]">받는 팀 · {partnerName}</p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="text-xs font-bold text-[#6b6b6b] hover:text-[#111] disabled:cursor-default disabled:opacity-40"
          >
            닫기
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-[#eeeeee] bg-[#f8f8f8] px-4 py-3">
          <p className="text-[11px] text-[#6b6b6b]">관련 인수인계</p>
          <p className="mt-1 truncate text-xs font-bold text-[#111]" title={handoverTitle}>{handoverTitle}</p>
        </div>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label htmlFor="information-request-message" className="text-xs font-bold text-[#111]">
            요청 메시지
          </label>
          <textarea
            id="information-request-message"
            autoFocus
            rows={7}
            maxLength={2000}
            value={message}
            disabled={pending}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="상대 팀에 확인이 필요한 내용을 입력하세요."
            className="mt-2 w-full resize-none rounded-lg border border-[#dbdbdb] px-4 py-3 text-sm leading-6 text-[#111] outline-none transition placeholder:text-[#9e9e9e] focus:border-[#111] disabled:bg-[#f6f6f6]"
          />
          <div className="mt-1 flex items-center justify-between gap-4 text-[11px] text-[#9e9e9e]">
            <p>현재는 텍스트 요청만 보낼 수 있습니다.</p>
            <span className="shrink-0">{message.length}/2000</span>
          </div>
          {sourceQuestion && message.trim() !== sourceQuestion.trim() ? (
            <p className="mt-2 text-[11px] text-[#6b6b6b]">제안 문구를 수정하면 해당 제안과 별도의 정보 요청으로 기록됩니다.</p>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="h-9 rounded-[7px] border border-[#dbdbdb] bg-white px-5 text-xs font-bold text-[#111] hover:border-[#111] disabled:cursor-default disabled:opacity-40"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending || message.trim().length === 0}
              className="h-9 rounded-[7px] border border-[#111] bg-[#111] px-5 text-xs font-bold text-white hover:bg-[#333] disabled:cursor-default disabled:border-[#dbdbdb] disabled:bg-[#f6f6f6] disabled:text-[#9e9e9e]"
            >
              {pending ? "전송 중" : "정보 요청 보내기"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function HandoverDetailScreen({ workspaceId, handoverId }: HandoverDetailScreenProps) {
  const [handover, setHandover] = useState<HandoverDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"acknowledge" | "requests" | null>(null);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestSourceQuestion, setRequestSourceQuestion] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function openRequestDialog(initialMessage = "") {
    setRequestMessage(initialMessage);
    setRequestSourceQuestion(initialMessage.trim() ? initialMessage : null);
    setNotice(null);
    setIsRequestDialogOpen(true);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const detail = await api<HandoverDetailDTO>(`/api/handovers/${handoverId}`, { signal: controller.signal });
        setHandover(detail);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "인수인계를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [handoverId]);

  useEffect(() => {
    if (!isRequestDialogOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && pendingAction !== "requests") {
        setIsRequestDialogOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isRequestDialogOpen, pendingAction]);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const detail = await api<HandoverDetailDTO>(`/api/handovers/${handoverId}`);
      setHandover(detail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "인수인계를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function acknowledge() {
    setPendingAction("acknowledge");
    setNotice(null);
    try {
      const updated = await api<HandoverDetailDTO>(`/api/handovers/${handoverId}/acknowledge`, {
        method: "POST",
      });
      setHandover(updated);
      setNotice("인수인계를 확인했습니다.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "인수 확인에 실패했습니다.");
    } finally {
      setPendingAction(null);
    }
  }

  async function sendCustomRequest() {
    if (!handover) return;
    const question = requestMessage.trim();
    if (!question) return;

    setPendingAction("requests");
    setNotice(null);
    try {
      const created = await api<RequestDTO>(`/api/workspaces/${workspaceId}/requests`, {
        method: "POST",
        body: JSON.stringify({ question, handoverItemId: handoverId }),
      });
      setHandover((current) => current ? {
        ...current,
        openQuestions: current.openQuestions.map((item) =>
          item.question.trim() === question
            ? { ...item, requested: true, requestId: created.id }
            : item,
        ),
      } : current);
      setRequestMessage("");
      setRequestSourceQuestion(null);
      setIsRequestDialogOpen(false);
      setNotice(`${handover.from?.name ?? "상대 팀"}에 정보 요청을 보냈습니다.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "정보 요청 전송에 실패했습니다.");
    } finally {
      setPendingAction(null);
    }
  }

  if (loading) {
    return <DetailState title="인수인계 불러오는 중" message="인수인계 내용을 불러오고 있습니다." />;
  }

  if (error || !handover) {
    return (
      <DetailState
        title="인수인계를 열 수 없습니다"
        message={error ?? "인수인계를 찾을 수 없습니다."}
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <article className="min-w-0 w-full pb-16 font-sans text-[#111]">
      <header className="flex min-h-[58px] items-start justify-between gap-4 border-b border-[#dbdbdb] pb-5">
        <h1 className="min-w-0 truncate text-xl font-bold tracking-[-0.03em] text-[#111] sm:text-2xl" title={handover.title}>
          {handover.title}
        </h1>
      </header>

      <div className="pt-[30px]">
          <div className="grid min-w-0 items-start gap-7 xl:grid-cols-[minmax(0,820px)_312px]">
            <section className="min-w-0 overflow-hidden rounded-lg border border-[#7c3aed] bg-[#f7f3ff] px-5 py-4 xl:min-h-[98px]">
              <p className="text-xs font-bold text-[#5b21b6]">AI 요약</p>
              <p className="mt-3 whitespace-pre-line text-[13px] leading-[21px] text-[#111]">{handover.summary ?? "요약이 없습니다."}</p>
              <p className="mt-2 text-[11px] text-[#6b6b6b]">
                {handover.from?.name ?? "내부"} · {handover.author ?? "작성자 미상"} · {formatDate(handover.occurredAt, true)} · {handover.source.provider}
              </p>
            </section>

            <section aria-label="인수인계 작업" className="grid min-w-0 content-start grid-cols-1 gap-3 sm:grid-cols-[118px_1fr]">
              <button
                type="button"
                title={handover.from ? undefined : "연결된 상대 팀이 없습니다."}
                disabled={!handover.from || pendingAction !== null}
                onClick={() => openRequestDialog()}
                className="h-9 rounded-[7px] border border-[#dbdbdb] bg-white text-xs font-bold transition hover:border-[#111] disabled:cursor-default disabled:bg-[#f6f6f6] disabled:text-[#9e9e9e]"
              >
                정보 요청
              </button>
              <button
                type="button"
                disabled={handover.status !== "NEW" || pendingAction !== null}
                onClick={acknowledge}
                className="h-9 rounded-[7px] border border-[#111] bg-[#111] text-xs font-bold text-white transition hover:bg-[#333] disabled:cursor-default disabled:border-[#dbdbdb] disabled:bg-[#f6f6f6] disabled:text-[#6b6b6b]"
              >
                {pendingAction === "acknowledge"
                  ? "처리 중"
                  : handover.status === "NEW"
                    ? "인수인계 확인"
                    : "확인 완료"}
              </button>
              <Link
                href={{
                  pathname: `/w/${workspaceId}/ai`,
                  query: { context: "handover", handoverId },
                }}
                aria-label="AI 업무 질의 보드에서 이 인수인계를 컨텍스트로 질문하기"
                className="flex h-9 items-center justify-center rounded-[7px] border border-[#7c3aed] bg-[#f7f3ff] text-xs font-bold text-[#5b21b6] transition hover:bg-[#efe7ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7c3aed] sm:col-span-2"
              >
                AI에 인수인계 질의하기
              </Link>
            </section>
          </div>

          <div className="mt-8 grid min-w-0 gap-8 xl:grid-cols-[minmax(0,820px)_312px] xl:gap-7">
            <div className="min-w-0 space-y-6">
              <section id="ai-actions">
                <SectionHeading>변경 사항</SectionHeading>
                <ChangesPanel changes={handover.changes} />
              </section>

              <section>
                <SectionHeading>업무 맥락</SectionHeading>
                <ContextPanel handover={handover} />
              </section>

              <details className="group rounded-lg border border-[#dbdbdb] bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111]">
                  <span>Notion 원문</span>
                  <span className="text-[11px] font-normal text-[#6b6b6b]">
                    <span className="group-open:hidden">펼치기</span>
                    <span className="hidden group-open:inline">접기</span>
                  </span>
                </summary>
                <div className="mx-5 mb-5 border-t border-[#eeeeee] pt-4">
                  {handover.source.url ? (
                    <a
                      href={handover.source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-bold text-[#333] underline decoration-[#bdbdbd] underline-offset-4 hover:decoration-[#111]"
                    >
                      Notion에서 원문 열기
                    </a>
                  ) : null}
                  <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap font-sans text-xs leading-6 text-[#6b6b6b]">
                    {handover.rawContent || "등록된 원문이 없습니다."}
                  </pre>
                </div>
              </details>
            </div>

            <aside className="min-w-0 space-y-6">
              <section>
                <SectionHeading>다음 업무</SectionHeading>
                <div className="mt-3 space-y-3">
                  {handover.nextActions.length > 0 ? (
                    handover.nextActions.slice(0, 2).map((action) => <ActionCard key={action.id} action={action} />)
                  ) : (
                    <div className="rounded-lg border border-[#7c3aed] bg-[#f7f3ff] px-4 py-7 text-center text-xs text-[#6b6b6b]">
                      생성된 다음 업무가 없습니다.
                    </div>
                  )}
                </div>
                {handover.nextActions.length > 2 ? (
                  <p className="mt-2 text-right text-[11px] font-bold text-[#5b21b6]">전체 {handover.nextActions.length}건</p>
                ) : null}
              </section>

              <section>
                <SectionHeading accent>AI 추가 확인 제안</SectionHeading>
                <div className="mt-3">
                  <QuestionsPanel
                    questions={handover.openQuestions}
                    partnerName={handover.from?.name ?? "파트너 팀"}
                    pending={pendingAction === "requests"}
                    onWriteRequest={openRequestDialog}
                  />
                </div>
              </section>
            </aside>
          </div>
      </div>

      <InformationRequestDialog
        open={isRequestDialogOpen}
        partnerName={handover.from?.name ?? "상대 팀"}
        handoverTitle={handover.title}
        message={requestMessage}
        sourceQuestion={requestSourceQuestion}
        pending={pendingAction === "requests"}
        onMessageChange={setRequestMessage}
        onClose={() => {
          if (pendingAction !== "requests") setIsRequestDialogOpen(false);
        }}
        onSubmit={() => void sendCustomRequest()}
      />

      {notice ? (
        <div role="status" className="fixed bottom-5 right-5 z-30 max-w-sm rounded-lg border border-[#dbdbdb] bg-white px-4 py-3 text-xs font-bold text-[#111] shadow-lg">
          <div className="flex items-start gap-4">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-[#6b6b6b]">닫기</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
