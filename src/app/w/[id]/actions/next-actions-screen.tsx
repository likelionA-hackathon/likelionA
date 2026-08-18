"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { NextActionDTO, PriorityBadge, PriorityCode } from "@/types/api";

type Props = { workspaceId: string };
type ActionStatus = NextActionDTO["status"];
type PriorityFilter = "ALL" | PriorityCode;

const STATUS_META: Array<{ value: ActionStatus; label: string }> = [
  { value: "TODO", label: "할 일" },
  { value: "DOING", label: "진행 중" },
  { value: "DONE", label: "완료" },
];

const PRIORITY_OPTIONS: Array<{ value: PriorityFilter; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "URGENT", label: "긴급" },
  { value: "HIGH", label: "높음" },
  { value: "NORMAL", label: "보통" },
  { value: "LOW", label: "낮음" },
];

// 상태는 어느 방향으로든 바꿀 수 있어야 합니다.
// 앞으로만 갈 수 있으면 실수로 완료 처리했을 때 되돌릴 방법이 없습니다.
const ALL_STATUS: ActionStatus[] = ["TODO", "DOING", "DONE"];

const EMPTY_FORM = {
  title: "",
  assignee: "",
  priority: "NORMAL" as PriorityCode,
  dueDate: "",
  status: "TODO" as ActionStatus,
};

function statusLabel(status: ActionStatus) {
  return STATUS_META.find((item) => item.value === status)?.label ?? status;
}

function formatDate(value: string | null) {
  if (!value) return "미정";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function PriorityPill({ priority }: { priority: PriorityBadge }) {
  // 4단계가 눈으로 구분되어야 합니다. (기존에는 orange 와 slate 가 완전히 동일했습니다)
  // 인수인계 상세 화면과 같은 팔레트입니다.
  const classes: Record<PriorityBadge["tone"], string> = {
    red: "border-[#111] bg-[#111] text-white",
    orange: "border-[#2a2a2a] bg-white text-[#111]",
    slate: "border-[#d4d4d4] bg-[#f4f4f4] text-[#333]",
    gray: "border-[#e2e2e2] bg-[#f7f7f7] text-[#666]",
  };

  return (
    <span
      title={priority.reason ?? undefined}
      className={`inline-flex h-6 min-w-10 items-center justify-center rounded-full border px-3 text-[11px] font-bold ${classes[priority.tone]}`}
    >
      {priority.label}
    </span>
  );
}

function StatusSelect({
  action,
  disabled,
  onChange,
}: {
  action: NextActionDTO;
  disabled: boolean;
  onChange: (status: ActionStatus) => void;
}) {
  return (
    <select
      aria-label={`${action.title} 상태`}
      value={action.status}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ActionStatus)}
      className="h-7 min-w-[64px] appearance-none rounded-full border border-[#dbdbdb] bg-[#f6f6f6] px-3 text-center text-[11px] font-bold text-[#111] outline-none focus:border-[#7c3aed] focus:ring-2 focus:ring-[#ede9fe] disabled:cursor-wait disabled:text-[#9e9e9e]"
    >
      {ALL_STATUS.map((status) => (
        <option key={status} value={status}>{statusLabel(status)}</option>
      ))}
    </select>
  );
}

function LoadingRows() {
  return (
    <div className="flex min-h-[612px] items-center justify-center rounded-lg border border-[#dbdbdb] bg-white text-[12px] text-[#6b6b6b]">
      다음 업무를 불러오는 중입니다.
    </div>
  );
}

function FilterPanel({
  priority,
  assignee,
  assignees,
  onPriorityChange,
  onAssigneeChange,
  onReset,
}: {
  priority: PriorityFilter;
  assignee: string;
  assignees: string[];
  onPriorityChange: (value: PriorityFilter) => void;
  onAssigneeChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute right-0 top-11 z-30 w-[280px] rounded-lg border border-[#dbdbdb] bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
      <label className="block text-[11px] font-bold text-[#555]">
        우선순위
        <select
          value={priority}
          onChange={(event) => onPriorityChange(event.target.value as PriorityFilter)}
          className="mt-2 h-9 w-full rounded-md border border-[#dbdbdb] bg-white px-3 text-[12px] text-[#111] outline-none focus:border-[#7c3aed]"
        >
          {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="mt-4 block text-[11px] font-bold text-[#555]">
        담당자
        <select
          value={assignee}
          onChange={(event) => onAssigneeChange(event.target.value)}
          className="mt-2 h-9 w-full rounded-md border border-[#dbdbdb] bg-white px-3 text-[12px] text-[#111] outline-none focus:border-[#7c3aed]"
        >
          <option value="ALL">전체</option>
          <option value="UNASSIGNED">미정</option>
          {assignees.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <button type="button" onClick={onReset} className="mt-4 h-8 w-full rounded-md border border-[#dbdbdb] text-[11px] font-bold text-[#555] hover:bg-[#f6f6f6]">
        필터 초기화
      </button>
    </div>
  );
}

function AddActionDialog({
  open,
  pending,
  onClose,
  onCreate,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onCreate: (form: typeof EMPTY_FORM) => Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby="add-action-title" className="w-full max-w-[500px] rounded-lg border border-[#dbdbdb] bg-white p-6 shadow-[0_20px_55px_rgba(0,0,0,0.16)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="add-action-title" className="text-xl font-bold tracking-[-0.03em] text-[#111]">업무 추가</h2>
            <p className="mt-2 text-[12px] text-[#6b6b6b]">직접 관리할 다음 업무를 추가합니다.</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} className="h-8 rounded-md border border-[#dbdbdb] px-3 text-[11px] font-bold text-[#555] hover:bg-[#f6f6f6]">닫기</button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void onCreate(form); }}>
          <label className="block text-[11px] font-bold text-[#555]">
            업무명
            <input
              autoFocus
              required
              maxLength={200}
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="해야 할 업무를 입력하세요."
              className="mt-2 h-10 w-full rounded-md border border-[#dbdbdb] px-3 text-[13px] font-normal outline-none placeholder:text-[#9e9e9e] focus:border-[#7c3aed] focus:ring-2 focus:ring-[#ede9fe]"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[11px] font-bold text-[#555]">
              담당
              <input
                maxLength={50}
                value={form.assignee}
                onChange={(event) => setForm((current) => ({ ...current, assignee: event.target.value }))}
                placeholder="담당자 미정"
                className="mt-2 h-10 w-full rounded-md border border-[#dbdbdb] px-3 text-[13px] font-normal outline-none placeholder:text-[#9e9e9e] focus:border-[#7c3aed]"
              />
            </label>
            <label className="block text-[11px] font-bold text-[#555]">
              마감
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                className="mt-2 h-10 w-full rounded-md border border-[#dbdbdb] px-3 text-[13px] font-normal outline-none focus:border-[#7c3aed]"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[11px] font-bold text-[#555]">
              우선순위
              <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as PriorityCode }))} className="mt-2 h-10 w-full rounded-md border border-[#dbdbdb] bg-white px-3 text-[13px] font-normal outline-none focus:border-[#7c3aed]">
                {PRIORITY_OPTIONS.slice(1).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-bold text-[#555]">
              상태
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ActionStatus }))} className="mt-2 h-10 w-full rounded-md border border-[#dbdbdb] bg-white px-3 text-[13px] font-normal outline-none focus:border-[#7c3aed]">
                {STATUS_META.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#ededed] pt-5">
            <button type="button" onClick={onClose} disabled={pending} className="h-9 rounded-[7px] border border-[#dbdbdb] px-5 text-[12px] font-bold text-[#555] hover:bg-[#f6f6f6]">취소</button>
            <button type="submit" disabled={pending || !form.title.trim()} className="h-9 rounded-[7px] border border-[#7c3aed] bg-[#7c3aed] px-5 text-[12px] font-bold text-white hover:bg-[#6d28d9] disabled:border-[#d9cdf7] disabled:bg-[#e9e2f7] disabled:text-[#8f7abf]">
              {pending ? "추가 중" : "업무 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function NextActionsScreen({ workspaceId }: Props) {
  const [items, setItems] = useState<NextActionDTO[]>([]);
  const [activeStatus, setActiveStatus] = useState<ActionStatus>("TODO");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<PriorityFilter>("ALL");
  const [assignee, setAssignee] = useState("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const actions = await api.actions(workspaceId);
      setItems(actions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "다음 업무를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  // 필터 패널은 바깥을 클릭하거나 Esc 를 누르면 닫힙니다.
  useEffect(() => {
    if (!filterOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFilterOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

  const counts = useMemo(() => {
    const result: Record<ActionStatus, number> = { TODO: 0, DOING: 0, DONE: 0 };
    for (const item of items) result[item.status] += 1;
    return result;
  }, [items]);

  const assignees = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) if (item.assignee) values.add(item.assignee);
    return [...values].sort((a, b) => a.localeCompare(b, "ko"));
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko");
    return items.filter((item) => {
      if (item.status !== activeStatus) return false;
      if (priority !== "ALL" && item.priority.code !== priority) return false;
      if (assignee === "UNASSIGNED" && item.assignee) return false;
      if (assignee !== "ALL" && assignee !== "UNASSIGNED" && item.assignee !== assignee) return false;
      if (!query) return true;
      return [item.title, item.assignee ?? "", item.handover?.title ?? ""]
        .some((value) => value.toLocaleLowerCase("ko").includes(query));
    });
  }, [activeStatus, assignee, items, priority, search]);

  const activeFilterCount = Number(priority !== "ALL") + Number(assignee !== "ALL");

  async function updateStatus(action: NextActionDTO, status: ActionStatus) {
    if (status === action.status) return;
    setPendingIds((current) => new Set(current).add(action.id));
    setNotice(null);
    try {
      const updated = await api.updateAction(action.id, { status });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`업무를 ${statusLabel(status)} 상태로 변경했습니다.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "상태를 변경하지 못했습니다.");
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(action.id);
        return next;
      });
    }
  }

  async function createAction(form: typeof EMPTY_FORM) {
    setCreating(true);
    setNotice(null);
    try {
      const created = await api.createAction(workspaceId, {
        title: form.title.trim(),
        assignee: form.assignee.trim() || undefined,
        priority: form.priority,
        status: form.status,
        dueDate: form.dueDate ? new Date(`${form.dueDate}T00:00:00+09:00`).toISOString() : undefined,
      });
      setItems((current) => [created, ...current]);
      setActiveStatus(created.status);
      setSearch("");
      setPriority("ALL");
      setAssignee("ALL");
      setDialogOpen(false);
      setNotice("새 업무를 추가했습니다.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "업무를 추가하지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <article className="w-full min-w-0 pb-16 font-sans text-[#111]">
      <header className="border-b border-[#dbdbdb] pb-6">
        <h1 className="text-2xl font-bold tracking-[-0.03em]">다음 업무</h1>
      </header>

      <section className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2.5" role="tablist" aria-label="업무 상태">
                {STATUS_META.map((status) => {
                  const selected = activeStatus === status.value;
                  return (
                    <button
                      key={status.value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveStatus(status.value)}
                      className={`h-7 rounded-full border px-4 text-[11px] font-bold transition ${selected ? "border-[#7c3aed] bg-[#7c3aed] text-white" : "border-[#dbdbdb] bg-[#f6f6f6] text-[#111] hover:border-[#b8b8b8]"}`}
                    >
                      {status.label} ({counts[status.value]})
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="block">
                  <span className="sr-only">업무명 또는 담당자 검색</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="업무명 또는 담당자 검색"
                    className="h-9 w-full rounded-[7px] border border-[#dbdbdb] bg-white px-3.5 text-[12px] outline-none placeholder:text-[#9e9e9e] focus:border-[#7c3aed] focus:ring-2 focus:ring-[#ede9fe] sm:w-[200px]"
                  />
                </label>
                <div className="relative" ref={filterRef}>
                  <button
                    type="button"
                    aria-expanded={filterOpen}
                    onClick={() => setFilterOpen((current) => !current)}
                    className={`h-9 w-full rounded-[7px] border px-4 text-[12px] font-bold sm:w-auto ${activeFilterCount ? "border-[#7c3aed] text-[#5b21b6]" : "border-[#dbdbdb] text-[#111]"}`}
                  >
                    필터{activeFilterCount ? ` (${activeFilterCount})` : ""}
                  </button>
                  {filterOpen ? (
                    <FilterPanel
                      priority={priority}
                      assignee={assignee}
                      assignees={assignees}
                      onPriorityChange={setPriority}
                      onAssigneeChange={setAssignee}
                      onReset={() => { setPriority("ALL"); setAssignee("ALL"); }}
                    />
                  ) : null}
                </div>
                <button type="button" onClick={() => setDialogOpen(true)} className="h-9 rounded-[7px] border border-[#7c3aed] bg-[#7c3aed] px-5 text-[12px] font-bold text-white hover:bg-[#6d28d9] focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:ring-offset-2">
                  업무 추가
                </button>
              </div>
      </section>

      <section className="mt-[22px]" aria-label="다음 업무 목록">
              {loading ? <LoadingRows /> : error ? (
                <div className="flex min-h-[612px] flex-col items-center justify-center rounded-lg border border-[#dbdbdb] bg-white px-6 text-center">
                  <p role="alert" className="text-[12px] text-[#6b6b6b]">{error}</p>
                  <button type="button" onClick={() => void load()} className="mt-4 h-9 rounded-[7px] border border-[#111] bg-[#111] px-5 text-[12px] font-bold text-white">다시 시도</button>
                </div>
              ) : (
                <div className="min-h-[612px] overflow-x-auto rounded-lg border border-[#dbdbdb] bg-white">
                  <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
                    <thead>
                      <tr className="h-[44px] border-b border-[#e4e4e4] text-[11px] font-bold text-[#6b6b6b]">
                        <th className="w-[34%] px-[22px]">업무</th>
                        <th className="w-[20%] px-3 text-[#5b21b6]">관련 인수인계</th>
                        <th className="w-[13%] px-3">담당</th>
                        <th className="w-[12%] px-3">우선순위</th>
                        <th className="w-[10%] px-3">마감</th>
                        <th className="w-[11%] px-3">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((action) => (
                        <tr key={action.id} className="h-[102px] border-b border-[#e4e4e4] last:border-b-0 hover:bg-[#fcfcfc]">
                          <td className="px-[22px] py-4 align-middle">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-[13px] font-bold text-[#111]" title={action.title}>{action.title}</span>
                              {action.aiDraft ? <span className="shrink-0 text-[10px] font-bold text-[#7c3aed]">AI 초안</span> : null}
                            </div>
                            {action.description ? <p className="mt-2 truncate text-[11px] text-[#9a9a9a]" title={action.description}>{action.description}</p> : null}
                          </td>
                          <td className="px-3 py-4 align-middle">
                            {action.handover ? (
                              <Link href={`/w/${workspaceId}/handovers/${action.handover.id}`} className="line-clamp-2 text-[12px] leading-5 text-[#5b21b6] hover:underline" title={action.handover.title}>
                                {action.handover.title}
                              </Link>
                            ) : <span className="text-[12px] text-[#9e9e9e]">수동 생성</span>}
                          </td>
                          <td className="px-3 py-4 text-[12px] text-[#6b6b6b]">{action.assignee ?? "미정"}</td>
                          <td className="px-3 py-4"><PriorityPill priority={action.priority} /></td>
                          <td className="px-3 py-4 text-[12px] text-[#6b6b6b]">{formatDate(action.dueDate)}</td>
                          <td className="px-3 py-4">
                            <StatusSelect action={action} disabled={pendingIds.has(action.id)} onChange={(status) => void updateStatus(action, status)} />
                          </td>
                        </tr>
                      ))}
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="h-[220px] px-6 text-center text-[12px] text-[#6b6b6b]">조건에 맞는 {statusLabel(activeStatus)} 업무가 없습니다.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
      </section>

      <AddActionDialog open={dialogOpen} pending={creating} onClose={() => setDialogOpen(false)} onCreate={createAction} />
      {notice ? <div role="status" className="fixed bottom-5 right-5 z-[60] max-w-sm rounded-lg border border-[#dbdbdb] bg-white px-4 py-3 text-[12px] font-bold text-[#111] shadow-lg">{notice}</div> : null}
    </article>
  );
}
