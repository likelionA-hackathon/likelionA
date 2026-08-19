"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { HandoverListItemDTO, PriorityBadge } from "@/types/api";

type Props = { workspaceId: string };

/** 대시보드와 같은 배지. 색은 서버가 주는 tone 값에만 의존합니다. */
function PriorityBadgeView({ priority }: { priority: PriorityBadge }) {
  return <span data-tone={priority.tone} title={priority.reason ?? priority.raw ?? undefined} className="inline-flex min-w-12 justify-center rounded-full border px-3 py-1 text-[9px] font-bold data-[tone=red]:border-black data-[tone=red]:bg-black data-[tone=red]:text-white data-[tone=orange]:border-[#fed7aa] data-[tone=orange]:bg-[#fff7ed] data-[tone=orange]:text-[#c2410c] data-[tone=slate]:border-[#cbd5e1] data-[tone=slate]:bg-[#f1f5f9] data-[tone=slate]:text-[#334155] data-[tone=gray]:border-[#e5e7eb] data-[tone=gray]:bg-white data-[tone=gray]:text-[#6b7280]">{priority.label}</span>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).format(date);
}

const STATUS_TABS = [
  { key: "ALL", label: "전체", status: undefined },
  { key: "NEW", label: "확인 전", status: "NEW" },
  { key: "ACKNOWLEDGED", label: "확인 완료", status: "ACKNOWLEDGED" },
  { key: "ARCHIVED", label: "보관", status: "ARCHIVED" },
] as const;

export function HandoverListScreen({ workspaceId }: Props) {
  const [items, setItems] = useState<HandoverListItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]["key"]>("ALL");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = STATUS_TABS.find((item) => item.key === tab)?.status;
      setItems(
        await api.handovers(workspaceId, {
          ...(status ? { status } : {}),
          ...(urgentOnly ? { priority: "URGENT,HIGH" } : {}),
          ...(query ? { q: query } : {}),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "인수인계 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, tab, urgentOnly, query]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="pb-14">
      <header className="border-b border-[#e5e5e5] pb-5">
        <p className="text-[10px] font-semibold text-[#888]">파트너 팀에서 도착한 문서</p>
        <h1 className="mt-1 text-lg font-extrabold tracking-[-0.03em]">인수인계</h1>
        <p className="mt-2 text-[10px] leading-4 text-[#777]">
          Notion 원본을 AI 가 요약·우선순위까지 정리한 목록입니다. 항목을 누르면 변경사항과 추가 확인이 필요한 항목을 볼 수 있습니다.
        </p>
      </header>

      <section className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="상태 필터" className="flex gap-1">
          {STATUS_TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              type="button"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`h-8 rounded-md px-3 text-[10px] font-bold ${tab === item.key ? "bg-black text-white" : "border border-[#dedede] text-[#666] hover:bg-[#f7f7f7]"}`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={urgentOnly}
            onClick={() => setUrgentOnly((prev) => !prev)}
            className={`h-8 rounded-md px-3 text-[10px] font-bold ${urgentOnly ? "border border-[#7c3aed] bg-[#f3f0ff] text-[#5b21b6]" : "border border-[#dedede] text-[#666] hover:bg-[#f7f7f7]"}`}
          >
            긴급·높음만
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(keyword.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="제목·요약 검색"
            aria-label="인수인계 검색"
            className="h-8 w-full min-w-0 rounded-md border border-[#dedede] px-3 text-[10px] outline-none focus:border-[#7c3aed] lg:w-52"
          />
          <button type="submit" className="h-8 shrink-0 rounded-md border border-[#d9d9d9] px-4 text-[10px] font-bold hover:bg-[#f7f7f7]">
            검색
          </button>
          {query ? (
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setQuery("");
              }}
              className="h-8 shrink-0 rounded-md px-2 text-[10px] font-bold text-[#777] hover:underline"
            >
              초기화
            </button>
          ) : null}
        </form>
      </section>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center text-xs text-[#777]">목록을 불러오는 중입니다.</div>
      ) : error ? (
        <div className="py-20 text-center">
          <p className="text-sm font-bold">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-4 rounded-md bg-black px-5 py-2 text-xs font-bold text-white">
            다시 시도
          </button>
        </div>
      ) : (
        <>
          <p className="mt-5 text-[10px] text-[#777]">{items.length}건</p>
          <div className="mt-2 space-y-2">
            {items.length === 0 ? (
              <div className="rounded-md border border-[#e2e2e2] py-16 text-center text-[11px] text-[#777]">
                조건에 맞는 인수인계가 없습니다.
                <br />
                <span className="text-[10px]">대시보드의 동기화 버튼을 누르면 Notion 문서를 가져옵니다.</span>
              </div>
            ) : (
              items.map((handover) => (
                <Link
                  key={handover.id}
                  href={`/w/${workspaceId}/handovers/${handover.id}`}
                  className="block rounded-md border border-[#e1e1e1] px-4 py-3 hover:bg-[#fafafa]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {handover.status === "NEW" ? (
                          <span className="rounded-full bg-[#f3f0ff] px-2 py-0.5 text-[9px] font-bold text-[#6d28d9]">{handover.statusLabel}</span>
                        ) : (
                          <span className="text-[9px] font-semibold text-[#999]">{handover.statusLabel}</span>
                        )}
                        <p className="truncate text-[12px] font-extrabold">{handover.title}</p>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-[#666]">{handover.summary ?? "요약이 아직 생성되지 않았습니다."}</p>
                      <p className="mt-2 text-[9px] text-[#888]">
                        {handover.from?.name ?? "내부 팀"} · {handover.author ?? "작성자 미상"} · {formatDate(handover.occurredAt)} · 변경 {handover.changeCount} · 추가확인 {handover.openQuestionCount} · 다음 업무 {handover.nextActionCount}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <PriorityBadgeView priority={handover.priority} />
                      <span aria-hidden className="text-sm text-[#888]">›</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
