"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { BoardItemDTO, NextActionDTO, PriorityCode } from "@/types/api";

type Props = {
  workspaceId: string;
};

type BoardTab = "ALL" | "ACTIVE" | "BLOCKED";
type DirectionFilter = "ALL" | BoardItemDTO["direction"];
type PriorityFilter = "ALL" | PriorityCode;

const TABS: Array<{ value: BoardTab; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "ACTIVE", label: "진행 중" },
  { value: "BLOCKED", label: "차단" },
];

const PRIORITY_OPTIONS: Array<{ value: PriorityFilter; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "URGENT", label: "긴급" },
  { value: "HIGH", label: "높음" },
  { value: "NORMAL", label: "보통" },
  { value: "LOW", label: "낮음" },
];

function isActive(item: BoardItemDTO) {
  return item.status === "DRAFT" || item.status === "SHARED";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function priorityClasses(priority: BoardItemDTO["priority"]) {
  if (priority.code === "URGENT") return "border-[#111] bg-[#111] text-white";
  if (priority.code === "HIGH") return "border-[#dbdbdb] bg-[#f6f6f6] text-[#111]";
  return "border-[#e4e4e4] bg-white text-[#555]";
}

function statusClasses(status: BoardItemDTO["status"]) {
  if (status === "DECLINED") return "border-[#f1caca] bg-[#fff7f7] text-[#a43d3d]";
  if (status === "ACCEPTED") return "border-[#c9e5d2] bg-[#f5fbf7] text-[#327447]";
  return "border-[#dbdbdb] bg-[#f6f6f6] text-[#111]";
}

function ActionSelector({
  actions,
  selectedIds,
  pending,
  onToggle,
  onClose,
  onCreatePreview,
}: {
  actions: NextActionDTO[];
  selectedIds: Set<string>;
  pending: boolean;
  onToggle: (id: string) => void;
  onClose: () => void;
  onCreatePreview: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-selector-title"
        className="flex max-h-[80vh] w-full max-w-[640px] flex-col rounded-lg border border-[#dbdbdb] bg-white shadow-[0_20px_55px_rgba(0,0,0,0.16)]"
      >
        <header className="border-b border-[#e5e5e5] px-6 py-5">
          <div>
            <h2 id="action-selector-title" className="text-lg font-bold tracking-[-0.03em]">전달할 다음 업무 선택</h2>
            <p className="mt-1 text-[11px] text-[#6b6b6b]">완료되지 않은 업무만 표시합니다.</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
          {actions.map((action) => (
            <label key={action.id} className="flex cursor-pointer items-center gap-3 border-b border-[#ededed] py-4 last:border-b-0">
              <input
                type="checkbox"
                checked={selectedIds.has(action.id)}
                onChange={() => onToggle(action.id)}
                className="size-4 accent-[#7c3aed]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-[#111]">{action.title}</span>
                <span className="mt-1 block text-[11px] text-[#777]">
                  {action.statusLabel} · {action.assignee ?? "담당 미정"} · {formatDate(action.dueDate)}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-bold text-[#555]">{action.priority.label}</span>
            </label>
          ))}
          {actions.length === 0 ? (
            <p className="py-16 text-center text-[12px] text-[#6b6b6b]">전달할 수 있는 다음 업무가 없습니다.</p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between border-t border-[#e5e5e5] px-6 py-4">
          <span className="text-[11px] text-[#6b6b6b]">선택 {selectedIds.size}건</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="h-9 rounded-[7px] border border-[#dbdbdb] px-5 text-[12px] font-bold text-[#555] hover:bg-[#f6f6f6]">취소</button>
            <button
              type="button"
              onClick={onCreatePreview}
              disabled={pending || selectedIds.size === 0}
              className="h-9 rounded-[7px] border border-[#7c3aed] bg-[#7c3aed] px-5 text-[12px] font-bold text-white hover:bg-[#6d28d9] disabled:border-[#d9cdf7] disabled:bg-[#e9e2f7] disabled:text-[#8f7abf]"
            >
              {pending ? "만드는 중" : "전달 미리보기"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function SharedBoardScreen({ workspaceId }: Props) {
  const [items, setItems] = useState<BoardItemDTO[]>([]);
  const [actions, setActions] = useState<NextActionDTO[]>([]);
  const [activeTab, setActiveTab] = useState<BoardTab>("ALL");
  const [direction, setDirection] = useState<DirectionFilter>("ALL");
  const [priority, setPriority] = useState<PriorityFilter>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(() => new Set());
  const [previewIds, setPreviewIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const [boardResult, actionsResult] = await Promise.allSettled([
        api.board(workspaceId),
        api.actions(workspaceId),
      ]);
      if (boardResult.status === "rejected") throw boardResult.reason;

      setItems(boardResult.value);
      if (actionsResult.status === "fulfilled") {
        setActions(actionsResult.value);
      } else {
        setActions([]);
        setNotice("공유 업무는 불러왔지만 다음 업무 선택 기능은 사용할 수 없습니다.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "공유보드를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => ({
    ALL: items.length,
    ACTIVE: items.filter(isActive).length,
    BLOCKED: items.filter((item) => item.status === "DECLINED").length,
  }), [items]);

  const filteredItems = useMemo(() => items.filter((item) => {
    if (activeTab === "ACTIVE" && !isActive(item)) return false;
    if (activeTab === "BLOCKED" && item.status !== "DECLINED") return false;
    if (direction !== "ALL" && item.direction !== direction) return false;
    if (priority !== "ALL" && item.priority.code !== priority) return false;
    return true;
  }), [activeTab, direction, items, priority]);

  const availableActions = useMemo(
    () => actions.filter((action) => action.status !== "DONE"),
    [actions],
  );

  const previewItems = useMemo(
    () => items.filter((item) => previewIds.has(item.id)),
    [items, previewIds],
  );

  const activeFilterCount = Number(direction !== "ALL") + Number(priority !== "ALL");

  function toggleAction(id: string) {
    setSelectedActionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePreview(id: string) {
    setPreviewIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createPreview() {
    if (selectedActionIds.size === 0) return;
    setCreating(true);
    setNotice(null);
    try {
      const created = await api.createBoardItems(workspaceId, {
        nextActionIds: [...selectedActionIds],
        share: false,
      });
      setItems((current) => [...created, ...current]);
      setPreviewIds(new Set(created.map((item) => item.id)));
      setSelectedActionIds(new Set());
      setSelectorOpen(false);
      setActiveTab("ACTIVE");
      setNotice("전달 미리보기를 만들었습니다.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "전달 미리보기를 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function sharePreview() {
    const drafts = previewItems.filter((item) => item.status === "DRAFT" && item.direction === "OUTGOING");
    if (drafts.length === 0) return;
    setSharing(true);
    setNotice(null);
    try {
      const results = await Promise.allSettled(
        drafts.map((item) => api.updateBoardStatus(item.id, "SHARED")),
      );
      const updated = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const failedIds = results.flatMap((result, index) => result.status === "rejected" ? [drafts[index].id] : []);
      const byId = new Map(updated.map(({ item }) => [item.id, item]));
      setItems((current) => current.map((item) => byId.get(item.id) ?? item));
      setPreviewIds(new Set(failedIds));
      if (failedIds.length > 0) {
        await load();
        setPreviewIds(new Set(failedIds));
        setNotice(`${updated.length}건 전달, ${failedIds.length}건 실패했습니다.`);
      } else {
        setNotice(`${updated.length}건을 전달됨 상태로 변경했습니다.`);
      }
    } catch (caught) {
      await load();
      setNotice(caught instanceof Error ? caught.message : "업무를 전달하지 못했습니다.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <article className="w-full min-w-0 pb-12 font-sans text-[#111]">
      <header className="border-b border-[#dbdbdb] pb-6">
        <h1 className="text-2xl font-bold tracking-[-0.03em]">공유 보드</h1>
      </header>

      <section className="mt-6 flex items-center justify-between gap-4">
        <div className="flex gap-2.5" role="tablist" aria-label="공유보드 상태">
          {TABS.map((tab) => {
            const selected = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.value)}
                className={`h-7 rounded-full border px-4 text-[11px] font-bold transition ${selected ? "border-[#7c3aed] bg-[#7c3aed] text-white" : "border-[#dbdbdb] bg-[#f6f6f6] text-[#111] hover:border-[#b8b8b8]"}`}
              >
                {tab.label} ({counts[tab.value]})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((current) => !current)}
              className={`h-9 rounded-[7px] border px-4 text-[12px] font-bold ${activeFilterCount ? "border-[#7c3aed] text-[#5b21b6]" : "border-[#dbdbdb] text-[#111]"}`}
            >
              필터{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
            {filterOpen ? (
              <div className="absolute right-0 top-11 z-30 w-[260px] rounded-lg border border-[#dbdbdb] bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
                <label className="block text-[11px] font-bold text-[#555]">
                  방향
                  <select value={direction} onChange={(event) => setDirection(event.target.value as DirectionFilter)} className="mt-2 h-9 w-full rounded-md border border-[#dbdbdb] bg-white px-3 text-[12px] font-normal outline-none focus:border-[#7c3aed]">
                    <option value="ALL">전체</option>
                    <option value="OUTGOING">보낸 업무</option>
                    <option value="INCOMING">받은 업무</option>
                  </select>
                </label>
                <label className="mt-4 block text-[11px] font-bold text-[#555]">
                  우선순위
                  <select value={priority} onChange={(event) => setPriority(event.target.value as PriorityFilter)} className="mt-2 h-9 w-full rounded-md border border-[#dbdbdb] bg-white px-3 text-[12px] font-normal outline-none focus:border-[#7c3aed]">
                    {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => { setDirection("ALL"); setPriority("ALL"); }} className="mt-4 h-8 w-full rounded-md border border-[#dbdbdb] text-[11px] font-bold text-[#555] hover:bg-[#f6f6f6]">필터 초기화</button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="h-9 rounded-[7px] border border-[#7c3aed] bg-[#7c3aed] px-5 text-[12px] font-bold text-white hover:bg-[#6d28d9] focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:ring-offset-2"
          >
            선택 업무 전달
          </button>
        </div>
      </section>

      <section className="mt-[22px]" aria-label="공유 업무 목록">
        {loading ? (
          <div className="flex min-h-[486px] items-center justify-center rounded-lg border border-[#dbdbdb] bg-white text-[12px] text-[#6b6b6b]">공유 업무를 불러오는 중입니다.</div>
        ) : error ? (
          <div className="flex min-h-[486px] flex-col items-center justify-center rounded-lg border border-[#dbdbdb] bg-white px-6 text-center">
            <p role="alert" className="text-[12px] text-[#6b6b6b]">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-4 h-9 rounded-[7px] border border-[#111] bg-[#111] px-5 text-[12px] font-bold text-white">다시 시도</button>
          </div>
        ) : (
          <div className="min-h-[486px] rounded-lg border border-[#dbdbdb] bg-white">
            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="h-[44px] border-b border-[#e4e4e4] text-[11px] font-bold text-[#6b6b6b]">
                  <th className="w-[34%] px-[22px]">공유 업무</th>
                  <th className="w-[15%] px-3">공유 상태</th>
                  <th className="w-[12%] px-3">우선순위</th>
                  <th className="w-[13%] px-3">담당</th>
                  <th className="w-[11%] px-3">마감</th>
                  <th className="w-[15%] px-3">원본</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const canPreview = item.status === "DRAFT" && item.direction === "OUTGOING";
                  return (
                    <tr key={item.id} className="h-[82px] border-b border-[#e4e4e4] last:border-b-0 hover:bg-[#fcfcfc]">
                      <td className="px-[22px] py-4 align-middle">
                        <div className="flex min-w-0 items-center gap-3">
                          {canPreview ? (
                            <input
                              type="checkbox"
                              aria-label={`${item.title} 전달 미리보기 선택`}
                              checked={previewIds.has(item.id)}
                              onChange={() => togglePreview(item.id)}
                              className="size-4 shrink-0 accent-[#7c3aed]"
                            />
                          ) : <span className="block size-4 shrink-0" />}
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-[#111]" title={item.title}>{item.title}</p>
                            <p className="mt-1 text-[10px] text-[#9a9a9a]">{item.direction === "OUTGOING" ? `${item.to.name}에 보냄` : `${item.from.name}에서 받음`}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4"><span className={`inline-flex h-6 items-center rounded-full border px-3 text-[11px] font-bold ${statusClasses(item.status)}`}>{item.statusLabel}</span></td>
                      <td className="px-3 py-4"><span className={`inline-flex h-6 items-center rounded-full border px-3 text-[11px] font-bold ${priorityClasses(item.priority)}`}>{item.priority.label}</span></td>
                      <td className="px-3 py-4 text-[12px] text-[#6b6b6b]">{item.targetPayload?.display?.assignee ?? "—"}</td>
                      <td className="px-3 py-4 text-[12px] text-[#6b6b6b]">—</td>
                      <td className="px-3 py-4 text-[12px] text-[#6b6b6b]">—</td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 ? (
                  <tr><td colSpan={6} className="h-[220px] px-6 text-center text-[12px] text-[#6b6b6b]">조건에 맞는 공유 업무가 없습니다.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {previewItems.length > 0 ? (
        <section className="mt-[18px] rounded-lg border border-[#7c3aed] bg-[#f7f3ff] px-5 py-5" aria-labelledby="preview-title">
          <div className="grid grid-cols-[260px_1fr_1fr] gap-5">
            <div>
              <h2 id="preview-title" className="text-base font-bold text-[#5b21b6]">전달 미리보기</h2>
              <p className="mt-2 text-[12px] text-[#6b6b6b]">선택된 업무 {previewItems.length}건</p>
            </div>
            <div>
              <p className="text-[11px] text-[#5b21b6]">상태 변환</p>
              <p className="mt-2 text-[13px] font-bold">미리보기 → 전달함</p>
            </div>
            <div>
              <p className="text-[11px] text-[#5b21b6]">우선순위 변환</p>
              <p className="mt-2 text-[13px] font-bold">
                {previewItems[0].priority.label} → {previewItems[0].targetPayload?.display?.priority ?? "—"}
                {previewItems.length > 1 ? ` 외 ${previewItems.length - 1}건` : ""}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-end justify-between gap-3 border-t border-[#ddd3ef] pt-4">
            <div>
              <p className="text-[11px] text-[#5b21b6]">공유 내용</p>
              <p className="mt-1 text-[12px] font-bold">제목 · 설명 · 우선순위 · 담당</p>
              <p className="mt-2 text-[10px] text-[#6b6b6b]">실제 Jira 쓰기 없이 앱 내부 상태만 전달됨으로 변경합니다.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPreviewIds(new Set())} disabled={sharing} className="h-9 rounded-[7px] border border-[#dbdbdb] bg-white px-5 text-[12px] font-bold text-[#555] hover:bg-[#f6f6f6]">취소</button>
              <button type="button" onClick={() => void sharePreview()} disabled={sharing || previewItems.every((item) => item.status !== "DRAFT")} className="h-9 rounded-[7px] border border-[#111] bg-[#111] px-5 text-[12px] font-bold text-white hover:bg-[#2a2a2a] disabled:border-[#bcbcbc] disabled:bg-[#d5d5d5]">
                {sharing ? "전달 중" : "Jira로 전달"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {selectorOpen ? (
        <ActionSelector
          actions={availableActions}
          selectedIds={selectedActionIds}
          pending={creating}
          onToggle={toggleAction}
          onClose={() => { setSelectorOpen(false); setSelectedActionIds(new Set()); }}
          onCreatePreview={() => void createPreview()}
        />
      ) : null}

      {notice ? <div role="status" className="fixed bottom-5 right-5 z-[60] max-w-sm rounded-lg border border-[#dbdbdb] bg-white px-4 py-3 text-[12px] font-bold text-[#111] shadow-lg">{notice}</div> : null}
    </article>
  );
}
