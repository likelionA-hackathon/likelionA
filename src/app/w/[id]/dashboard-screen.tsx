"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { DashboardDTO, PriorityBadge } from "@/types/api";

type Props = { workspaceId: string };

function PriorityBadgeView({ priority }: { priority: PriorityBadge }) {
  return <span data-tone={priority.tone} title={priority.reason ?? priority.raw ?? undefined} className="inline-flex min-w-12 justify-center rounded-full border px-3 py-1 text-[9px] font-bold data-[tone=red]:border-black data-[tone=red]:bg-black data-[tone=red]:text-white data-[tone=orange]:border-[#fed7aa] data-[tone=orange]:bg-[#fff7ed] data-[tone=orange]:text-[#c2410c] data-[tone=slate]:border-[#cbd5e1] data-[tone=slate]:bg-[#f1f5f9] data-[tone=slate]:text-[#334155] data-[tone=gray]:border-[#e5e7eb] data-[tone=gray]:bg-white data-[tone=gray]:text-[#6b7280]">{priority.label}</span>;
}

function formatDate(value: string | null) {
  if (!value) return "미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).format(date);
}

export function DashboardScreen({ workspaceId }: Props) {
  const [dashboard, setDashboard] = useState<DashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setDashboard(await api.dashboard(workspaceId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "대시보드를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [workspaceId]);
  useEffect(() => { void load(); }, [load]);

  async function syncNotion() {
    setSyncing(true); setSyncMessage(null); setSyncWarnings([]); setSyncError(null);
    try {
      const result = await api.notionSync(workspaceId);
      setSyncMessage(`${result.created + result.updated}개 항목을 동기화했습니다.`);
      setSyncWarnings(result.warnings);
      await load();
    } catch (caught) {
      setSyncError(caught instanceof ApiError && caught.code === "NOTION_NOT_CONNECTED" ? "연결 관리에서 Notion을 먼저 연결해 주세요." : caught instanceof ApiError ? caught.message : "동기화하지 못했습니다.");
    }
    finally { setSyncing(false); }
  }

  if (loading) return <div className="flex min-h-[520px] items-center justify-center text-xs text-[#777]">대시보드를 불러오는 중입니다.</div>;
  if (error || !dashboard) return <div className="py-24 text-center"><p className="text-sm font-bold">{error ?? "대시보드 정보가 없습니다."}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-md bg-black px-5 py-2 text-xs font-bold text-white">다시 시도</button></div>;

  const { workspace, stats, badges, recentHandovers, todayActions } = dashboard;
  // 라벨은 API 가 주는 값의 실제 의미와 맞춰야 합니다.
  //   openActions  = 끝나지 않은 업무 전체 (AI 생성 + 수동 추가)
  //   openRequests = 상대 팀이 보내와 우리가 답해야 할 정보요청
  const summaryCards = [["신규 인수인계", stats.newHandovers], ["긴급 인수인계", stats.urgentHandovers], ["진행 중 업무", stats.openActions], ["답할 요청", stats.openRequests]] as const;
  const notifications = [{ label: "새 인수인계", count: badges.unreadHandovers }, { label: "정보 요청", count: badges.incomingRequests }, { label: "공유 보드", count: badges.incomingBoardItems }].filter((item) => item.count > 0);

  return (
    <main className="pb-14">
      <header className="flex items-center justify-between border-b border-[#e5e5e5] pb-5">
        <div><p className="text-[10px] font-semibold text-[#888]">{workspace.tagline ?? "파트너 팀 업무 연결 보드"}</p><h1 className="mt-1 text-lg font-extrabold tracking-[-0.03em]">{workspace.name}</h1></div>
        <button type="button" disabled={syncing} onClick={() => void syncNotion()} className="h-8 rounded-md border border-[#d9d9d9] px-4 text-[10px] font-bold hover:bg-[#f7f7f7] disabled:opacity-50">{syncing ? "동기화 중..." : "동기화"}</button>
      </header>
      {syncMessage ? <p className="mt-4 rounded-md bg-[#f0fdf4] px-4 py-2 text-[10px] text-[#166534]">{syncMessage}</p> : null}
      {syncError ? <p role="alert" className="mt-4 rounded-md bg-[#fff1f1] px-4 py-2 text-[10px] text-[#b42318]">{syncError}</p> : null}
      {syncWarnings.map((warning) => <p key={warning} className="mt-2 rounded-md bg-[#fffaeb] px-4 py-2 text-[10px] text-[#854d0e]">{warning}</p>)}
      {notifications.length > 0 ? <div aria-label="새 알림" className="mt-4 flex flex-wrap gap-2">{notifications.map(({ label, count }) => <span key={label} className="rounded-full bg-[#f3f0ff] px-3 py-1.5 text-[9px] font-bold text-[#6d28d9]">{label} {count}</span>)}</div> : null}

      <section aria-label="업무 요약" className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(([label, value], index) => <article key={label} className={`min-h-20 rounded-md border p-3 ${index > 1 ? "border-[#a78bfa] bg-[#faf8ff]" : "border-[#dedede]"}`}><p className="text-[10px] text-[#666]">{label}</p><p className={`mt-2 text-xl font-extrabold ${index > 1 ? "text-[#7c3aed]" : "text-black"}`}>{value}</p></article>)}
        </div>
        <Link href={`/w/${workspaceId}/board`} className="flex h-8 shrink-0 items-center rounded-sm border border-[#ddd] px-5 text-[10px] font-bold text-[#666] hover:bg-[#f7f7f7]">공유 보드 보기</Link>
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between"><h2 className="text-[13px] font-extrabold text-[#6d28d9]">AI가 정리한 인수인계</h2><Link href={`/w/${workspaceId}/handovers`} className="text-[9px] text-[#777] hover:underline">전체 보기</Link></div>
        <div className="mt-3 space-y-2">
          {recentHandovers.length === 0 ? <div className="rounded-md border border-[#e2e2e2] py-10 text-center text-[11px] text-[#777]">아직 도착한 인수인계가 없습니다.</div> : recentHandovers.slice(0, 5).map((handover) => (
            <Link key={handover.id} href={`/w/${workspaceId}/handovers/${handover.id}`} className="grid min-h-[62px] grid-cols-[18px_minmax(0,1fr)_auto_14px] items-center gap-3 rounded-md border border-[#e1e1e1] px-3 py-2.5 hover:bg-[#fafafa]">
              <span aria-hidden className="h-3 w-3 rounded-[2px] border border-[#bdbdbd]" /><div className="min-w-0"><p className="truncate text-[11px] font-extrabold">{handover.title}</p><p className="mt-1 truncate text-[9px] text-[#777]">{handover.from?.name ?? "내부 팀"} → 다음 업무 {handover.nextActionCount}개</p></div><PriorityBadgeView priority={handover.priority} /><span aria-hidden className="text-sm text-[#888]">›</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between"><h2 className="text-[13px] font-extrabold text-[#6d28d9]">AI가 생성한 다음 업무</h2><Link href={`/w/${workspaceId}/actions`} className="text-[9px] text-[#777] hover:underline">전체 보기</Link></div>
        <div className="mt-3 overflow-x-auto rounded-md border border-[#e1e1e1]">
          <table className="w-full min-w-[620px] border-collapse text-left"><thead className="bg-[#fafafa] text-[9px] font-semibold text-[#666]"><tr><th className="px-4 py-2.5">업무</th><th className="px-4 py-2.5">담당</th><th className="px-4 py-2.5">마감</th><th className="px-4 py-2.5">우선도</th></tr></thead>
            <tbody>{todayActions.length === 0 ? <tr><td colSpan={4} className="py-10 text-center text-[11px] text-[#777]">생성된 다음 업무가 없습니다.</td></tr> : todayActions.slice(0, 4).map((action) => <tr key={action.id} className="border-t border-[#ededed] text-[10px]"><td className="px-4 py-3 font-bold">{action.title}</td><td className="px-4 py-3 text-[#777]">{action.assignee ?? "미정"}</td><td className="px-4 py-3 text-[#777]">{formatDate(action.dueDate)}</td><td className="px-4 py-3"><PriorityBadgeView priority={action.priority} /></td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
