"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { ConnectionDTO, PartnerDTO } from "@/types/api";

export function ConnectionsScreen({ workspaceId }: { workspaceId: string }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [connections, setConnections] = useState<ConnectionDTO[]>([]);
  const [partner, setPartner] = useState<PartnerDTO | null>(null);
  const [token, setToken] = useState(""); const [databaseId, setDatabaseId] = useState("");
  const [site, setSite] = useState("pmconnector.atlassian.net"); const [projectKey, setProjectKey] = useState("BAT");
  const [busy, setBusy] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setError(null); try { const [items, link] = await Promise.all([api.connections(workspaceId), api.getLink(workspaceId)]); setConnections(items); setPartner(link); } catch (caught) { setError(apiErrorMessage(caught, "연결 정보를 불러오지 못했습니다.")); } }, [workspaceId]);
  useEffect(() => { void load(); }, [load]);
  async function invite() { setBusy("invite"); setError(null); try { setPartner(await api.createInvite(workspaceId)); } catch (caught) { setError(apiErrorMessage(caught, "초대를 만들지 못했습니다.")); } finally { setBusy(null); } }
  async function copyInvite() { if (!partner?.inviteCode) return; await navigator.clipboard.writeText(`${origin}/invite/${partner.inviteCode}`); setMessage("초대 링크를 복사했습니다."); }
  async function saveNotion(event: FormEvent) { event.preventDefault(); setBusy("notion"); setError(null); setMessage(null); try { await api.saveConnection(workspaceId, { provider: "NOTION", token, databaseId }); setToken(""); setDatabaseId(""); setMessage("Notion 연결을 저장했습니다."); await load(); } catch (caught) { setError(apiErrorMessage(caught, "Notion을 연결하지 못했습니다.")); } finally { setBusy(null); } }
  async function saveJira(event: FormEvent) { event.preventDefault(); setBusy("jira"); setError(null); try { await api.saveConnection(workspaceId, { provider: "JIRA", site, projectKey }); setMessage("Jira 데모 연결을 저장했습니다."); await load(); } catch (caught) { setError(apiErrorMessage(caught, "Jira 설정을 저장하지 못했습니다.")); } finally { setBusy(null); } }
  const notion = connections.find((item) => item.provider === "NOTION"); const jira = connections.find((item) => item.provider === "JIRA");
  return <main className="pb-14"><header className="border-b border-[#e5e5e5] pb-5"><p className="text-[10px] font-semibold text-[#888]">워크스페이스 설정</p><h1 className="mt-1 text-lg font-extrabold tracking-[-0.03em]">연결 관리</h1></header>{error ? <p role="alert" className="mt-5 rounded-md bg-[#fff1f1] px-4 py-3 text-[10px] text-[#b42318]">{error}</p> : null}{message ? <p className="mt-5 rounded-md bg-[#f0fdf4] px-4 py-3 text-[10px] text-[#166534]">{message}</p> : null}
    <section className="mt-7"><h2 className="text-sm font-extrabold">파트너 팀 연결</h2><div className="mt-3 rounded-md border border-[#e1e1e1] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold">{partner?.status === "ACTIVE" ? partner.partner?.name ?? "파트너 팀" : partner?.status === "PENDING" ? "초대 수락 대기 중" : "연결된 파트너 팀이 없습니다."}</p><p className="mt-1 text-[10px] text-[#777]">{partner?.status === "ACTIVE" ? "워크스페이스가 서로 연결되어 있습니다." : "초대 링크를 전달해 두 팀을 연결하세요."}</p></div>{!partner || partner.status !== "ACTIVE" ? <button type="button" disabled={busy === "invite"} onClick={() => partner?.inviteCode ? void copyInvite() : void invite()} className="h-9 rounded-md bg-black px-5 text-[10px] font-bold text-white">{partner?.inviteCode ? "초대 링크 복사" : busy === "invite" ? "생성 중..." : "초대 링크 만들기"}</button> : <span className="rounded-full bg-[#ecfdf3] px-3 py-1.5 text-[9px] font-bold text-[#067647]">연결됨</span>}</div>{partner?.inviteCode ? <p className="mt-4 rounded-md bg-[#fafafa] px-3 py-2 font-mono text-[10px] text-[#555]">{origin}/invite/{partner.inviteCode}</p> : null}</div></section>
    <section className="mt-8"><h2 className="text-sm font-extrabold">서비스 연결</h2><p className="mt-1 text-[10px] text-[#777]">업무 원본을 가져오고 전달할 외부 서비스를 설정합니다.</p><div className="mt-3 grid gap-4 xl:grid-cols-2">
      <form onSubmit={saveNotion} className="rounded-md border border-[#e1e1e1] p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-extrabold">Notion</p><p className="mt-1 text-[9px] text-[#777]">인수인계 데이터베이스를 동기화합니다.</p></div><Status item={notion} /></div><div className="mt-5 space-y-3"><input required type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Internal Integration Token" className="h-10 w-full rounded-md border border-[#d8d8d8] px-3 text-[10px] outline-none focus:border-[#8b5cf6]" /><input required value={databaseId} onChange={(e) => setDatabaseId(e.target.value)} placeholder="Database ID" className="h-10 w-full rounded-md border border-[#d8d8d8] px-3 text-[10px] outline-none focus:border-[#8b5cf6]" /><button disabled={busy === "notion"} className="h-9 rounded-md bg-[#7c3aed] px-5 text-[10px] font-bold text-white disabled:opacity-50">{busy === "notion" ? "연결 확인 중..." : notion ? "연결 정보 변경" : "Notion 연결"}</button></div></form>
      <form onSubmit={saveJira} className="rounded-md border border-[#e1e1e1] p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-extrabold">Jira</p><p className="mt-1 text-[9px] text-[#777]">전달 업무의 Jira 이슈 미리보기를 만듭니다.</p></div><Status item={jira} /></div><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_110px]"><input required value={site} onChange={(e) => setSite(e.target.value)} placeholder="your-team.atlassian.net" className="h-10 rounded-md border border-[#d8d8d8] px-3 text-[10px]" /><input required value={projectKey} onChange={(e) => setProjectKey(e.target.value.toUpperCase())} placeholder="KEY" className="h-10 rounded-md border border-[#d8d8d8] px-3 text-[10px] uppercase" /></div><button disabled={busy === "jira"} className="mt-3 h-9 rounded-md bg-black px-5 text-[10px] font-bold text-white disabled:opacity-50">{busy === "jira" ? "저장 중..." : "Jira 데모 설정"}</button></form>
    </div></section>
  </main>;
}

function Status({ item }: { item?: ConnectionDTO }) {
  const connected = item?.status === "CONNECTED" || item?.status === "MOCK";
  return <span className={`rounded-full px-3 py-1.5 text-[9px] font-bold ${connected ? "bg-[#ecfdf3] text-[#067647]" : "bg-[#f2f2f2] text-[#777]"}`}>{item?.statusLabel ?? "연결 안 됨"}{item?.isMock ? " · 데모" : ""}</span>;
}

function apiErrorMessage(caught: unknown, fallback: string) {
  if (caught instanceof ApiError) {
    if (caught.code === "NOT_A_MEMBER") return "이 워크스페이스의 연결 설정을 변경할 권한이 없습니다.";
    return caught.message;
  }
  return fallback;
}
