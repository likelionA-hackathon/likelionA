"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { PartnerDTO } from "@/types/api";

type OnboardingMode = "create" | "join";
type Plan = "FREE" | "PRO" | "ENTERPRISE";
type Step = "choice" | "workspace" | "partner";

const TIMEZONES = [
  { value: "Asia/Seoul", label: "Asia/Seoul (KST, UTC+9)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST, UTC+9)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PT)" },
  { value: "America/New_York", label: "America/New_York (ET)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
] as const;

const PLANS: Array<{ id: Plan; name: string; description: string; features: string[] }> = [
  { id: "FREE", name: "Free", description: "개인 또는 소규모 팀", features: ["기본 협업 기능", "제한된 AI 사용량", "기본 도구 연결"] },
  { id: "PRO", name: "Pro", description: "활발하게 협업하는 팀", features: ["확장된 AI 사용량", "더 많은 도구 연결", "고급 공유·자동화 기능"] },
  { id: "ENTERPRISE", name: "Enterprise", description: "조직 단위 운영", features: ["조직 관리·보안 기능", "확장된 권한 관리", "기업용 지원 및 설정"] },
];

function inviteCodeFromInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const segments = new URL(trimmed).pathname.split("/").filter(Boolean);
    const inviteIndex = segments.findIndex((segment) => segment === "invite");
    return inviteIndex >= 0 ? (segments[inviteIndex + 1] ?? "") : "";
  } catch {
    return trimmed.replace(/^.*\/invite\//, "").split(/[?#/]/)[0] ?? "";
  }
}

export function OnboardingScreen({ initialInviteCode = "" }: { initialInviteCode?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialInviteCode ? "workspace" : "choice");
  const [mode, setMode] = useState<OnboardingMode>(initialInviteCode ? "join" : "create");
  const [name, setName] = useState("");
  const [inviteLink, setInviteLink] = useState(initialInviteCode);
  const [timezone, setTimezone] = useState("Asia/Seoul");
  const [plan, setPlan] = useState<Plan>("PRO");
  const [workspaceId, setWorkspaceId] = useState("");
  const [partner, setPartner] = useState<PartnerDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.me().catch((caught) => {
      if (caught instanceof ApiError && caught.code === "UNAUTHENTICATED") router.replace("/login");
    });
  }, [router]);

  function chooseMode(nextMode: OnboardingMode) {
    setMode(nextMode);
    setError(null);
    setStep("workspace");
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("팀 이름을 입력해 주세요.");
    const inviteCode = inviteCodeFromInput(inviteLink);
    if (mode === "join" && !inviteCode) return setError("올바른 초대 링크 또는 초대 코드를 입력해 주세요.");

    setLoading(true);
    setError(null);
    try {
      const currentWorkspaceId =
        workspaceId ||
        (await api.createWorkspace({ name: name.trim(), timezone, plan })).id;
      setWorkspaceId(currentWorkspaceId);
      if (mode === "join") {
        setPartner(await api.acceptInvite({ inviteCode, workspaceId: currentWorkspaceId }));
      } else {
        setPartner(await api.createInvite(currentWorkspaceId));
      }
      setStep("partner");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function refreshPartner() {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const current = await api.getLink(workspaceId);
      setPartner(current);
      setMessage(current?.status === "ACTIVE" ? "파트너 팀 연결이 완료되었습니다." : "아직 초대 수락을 기다리고 있습니다.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function copyInvite() {
    if (!partner?.inviteCode) return;
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${partner.inviteCode}`);
    setMessage("초대 링크를 복사했습니다.");
  }

  async function goToDashboard() {
    setLoading(true);
    setError(null);
    try {
      let targetWorkspaceId = workspaceId;
      if (!targetWorkspaceId) {
        const me = await api.me();
        targetWorkspaceId = me.workspaces.at(-1)?.id ?? "";
      }
      if (!targetWorkspaceId) {
        setError("이동할 워크스페이스를 찾지 못했습니다. 팀을 다시 생성해 주세요.");
        setLoading(false);
        return;
      }
      // 새로 생성된 멤버십과 워크스페이스 정보를 서버에서 다시 읽도록 전체 이동합니다.
      window.location.assign(`/w/${targetWorkspaceId}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-[#171717]">
      <header className="border-b border-[#e5e5e5] px-6 py-7 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-[-0.04em]">팀 생성 및 참여</h1>
          <ol className="hidden items-center gap-2 text-[10px] font-bold sm:flex">
            <StepBadge active={step === "choice"} done={step !== "choice"} number="1" label="방식 선택" />
            <span className="h-px w-5 bg-[#d8d8d8]" />
            <StepBadge active={step === "workspace"} done={step === "partner"} number="2" label="팀 생성" />
            <span className="h-px w-5 bg-[#d8d8d8]" />
            <StepBadge active={step === "partner"} done={partner?.status === "ACTIVE"} number="3" label="파트너 연결" />
          </ol>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1480px] px-6 py-10 sm:px-10 lg:px-16">
        {step === "choice" ? (
          <section className="mx-auto max-w-4xl">
            <h2 className="text-xl font-extrabold tracking-[-0.03em]">어떻게 시작하시겠어요?</h2>
            <p className="mt-2 text-xs text-[#777]">새 팀을 만들거나 전달받은 초대로 파트너 팀과 연결할 수 있습니다.</p>
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <ChoiceCard title="새 팀 만들기" description="새 워크스페이스를 만들고 파트너에게 초대 링크를 보냅니다." action="팀 만들기 시작" onClick={() => chooseMode("create")} />
              <ChoiceCard title="초대 링크로 참여하기" description="내 팀을 만든 뒤 전달받은 파트너 초대에 연결합니다." action="초대로 참여" onClick={() => chooseMode("join")} />
            </div>
          </section>
        ) : null}

        {step === "workspace" ? (
          <form onSubmit={createWorkspace}>
            <section>
              <button type="button" onClick={() => setStep("choice")} className="mb-5 text-[11px] font-bold text-[#666]">← 이전</button>
              <h2 className="text-lg font-extrabold tracking-[-0.03em]">{mode === "create" ? "새 팀 만들기" : "초대받을 내 팀 만들기"}</h2>
              <p className="mt-1 text-[11px] text-[#777]">팀 이름과 기준 타임존을 설정하고 요금제를 선택하세요.</p>
              <div className="mt-6 grid gap-4 rounded-xl border border-[#dedede] p-6 md:grid-cols-2">
                <label className="block text-[11px] font-bold">팀 이름<input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 디자인팀" maxLength={50} className="mt-2 h-11 w-full rounded-md border border-[#d8d8d8] px-4 text-xs outline-none focus:border-[#171717]" /></label>
                <TimezoneField value={timezone} onChange={setTimezone} />
                {mode === "join" ? <label className="block text-[11px] font-bold md:col-span-2">초대 링크 또는 코드<input value={inviteLink} onChange={(event) => setInviteLink(event.target.value)} placeholder="https://pmconnector.app/invite/..." className="mt-2 h-11 w-full rounded-md border border-[#d8d8d8] px-4 text-xs outline-none focus:border-[#171717]" /></label> : null}
              </div>
            </section>
            <PlanSection plan={plan} onChange={setPlan} />
            {error ? <ErrorMessage message={error} /> : null}
            <div className="mt-8 flex justify-end"><button disabled={loading} className="h-11 min-w-52 rounded-md bg-[#171717] px-8 text-xs font-bold text-white disabled:opacity-50">{loading ? "팀을 만드는 중..." : mode === "join" ? "팀 만들고 연결하기" : "팀 만들기"}</button></div>
          </form>
        ) : null}

        {step === "partner" ? (
          <section className="mx-auto max-w-2xl text-center">
            <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-xl ${partner?.status === "ACTIVE" ? "bg-[#ecfdf3] text-[#067647]" : "bg-[#f4f4f4]"}`}>{partner?.status === "ACTIVE" ? "✓" : "↗"}</span>
            <h2 className="mt-6 text-xl font-extrabold">{partner?.status === "ACTIVE" ? "파트너 연결 완료" : "파트너 팀을 초대하세요"}</h2>
            <p className="mt-2 text-xs leading-5 text-[#777]">{partner?.status === "ACTIVE" ? `${partner.partner?.name ?? "파트너 팀"}과 연결되었습니다. 이제 대시보드에서 협업을 시작할 수 있습니다.` : "아래 링크를 파트너 PM에게 전달하세요. 상대 팀이 초대를 수락하면 연결이 완료됩니다."}</p>
            {partner?.inviteCode ? <div className="mt-7 rounded-lg border border-[#dedede] p-5"><p className="break-all rounded-md bg-[#fafafa] px-4 py-3 text-left font-mono text-[11px]">{typeof window === "undefined" ? "" : window.location.origin}/invite/{partner.inviteCode}</p><button type="button" onClick={() => void copyInvite()} className="mt-3 h-10 w-full rounded-md border border-[#171717] text-xs font-bold">초대 링크 복사</button></div> : null}
            {message ? <p className="mt-4 text-[11px] text-[#067647]">{message}</p> : null}
            {error ? <ErrorMessage message={error} /> : null}
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              {partner?.status !== "ACTIVE" ? <button type="button" disabled={loading} onClick={() => void refreshPartner()} className="h-11 rounded-md border border-[#d8d8d8] px-7 text-xs font-bold disabled:opacity-50">{loading ? "확인 중..." : "연결 상태 확인"}</button> : null}
              <button type="button" disabled={loading} onClick={() => void goToDashboard()} className="h-11 rounded-md bg-[#171717] px-8 text-xs font-bold text-white disabled:opacity-50">{loading ? "이동 중..." : partner?.status === "ACTIVE" ? "대시보드 시작하기" : "나중에 연결하고 대시보드 보기"}</button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function StepBadge({ active, done, number, label }: { active: boolean; done: boolean; number: string; label: string }) { return <li className={`flex items-center gap-2 ${active || done ? "text-[#171717]" : "text-[#aaa]"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full ${active || done ? "bg-black text-white" : "bg-[#eee]"}`}>{done ? "✓" : number}</span>{label}</li>; }
function ChoiceCard({ title, description, action, onClick }: { title: string; description: string; action: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="group min-h-56 rounded-xl border border-[#dedede] p-7 text-left transition hover:border-[#171717] hover:ring-1 hover:ring-[#171717]"><span className="text-lg font-extrabold">{title}</span><span className="mt-3 block text-xs leading-5 text-[#777]">{description}</span><span className="mt-10 flex h-10 items-center justify-center rounded-md bg-[#171717] text-xs font-bold text-white">{action}</span></button>; }
function TimezoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <label className="block text-[11px] font-bold">기준 타임존<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-4 text-xs outline-none focus:border-[#171717]">{TIMEZONES.map((timezone) => <option key={timezone.value} value={timezone.value}>{timezone.label}</option>)}</select><span className="mt-2 block text-[10px] font-normal text-[#8a8a8a]">인수인계 시간과 마감일 표시에 사용됩니다.</span></label>; }
function PlanSection({ plan, onChange }: { plan: Plan; onChange: (plan: Plan) => void }) { return <section className="mt-10"><h2 className="text-lg font-extrabold tracking-[-0.03em]">요금제 선택</h2><p className="mt-1 text-[11px] text-[#777]">팀 규모와 사용 범위에 맞는 플랜을 선택합니다.</p><div className="mt-6 grid gap-6 lg:grid-cols-3">{PLANS.map((item) => { const selected = plan === item.id; return <button key={item.id} type="button" aria-pressed={selected} onClick={() => onChange(item.id)} className={`flex min-h-64 flex-col rounded-xl border p-6 text-left transition ${selected ? "border-[#171717] ring-1 ring-[#171717]" : "border-[#dedede] hover:border-[#999]"}`}><span className="text-2xl font-extrabold">{item.name}</span><span className="mt-2 text-[11px] text-[#777]">{item.description}</span><span className="mt-7 space-y-3 text-[11px]">{item.features.map((feature) => <span key={feature} className="block">• {feature}</span>)}</span><span className={`mt-auto flex h-11 items-center justify-center rounded-md border text-xs font-bold ${selected ? "border-[#171717] bg-[#171717] text-white" : "border-[#d8d8d8] bg-white"}`}>{selected ? `${item.name} 선택됨` : `${item.name} 선택`}</span></button>; })}</div></section>; }
function ErrorMessage({ message }: { message: string }) { return <p role="alert" className="mt-6 rounded-md bg-[#fff1f1] px-4 py-3 text-[11px] text-[#b42318]">{message}</p>; }
function errorMessage(caught: unknown) { if (!(caught instanceof ApiError)) return "요청을 처리하지 못했습니다."; if (caught.code === "INVITE_NOT_FOUND") return "유효하지 않은 초대 링크입니다."; if (caught.code === "INVITE_REVOKED") return "만료된 초대 링크입니다."; if (caught.code === "SELF_LINK") return "같은 팀의 초대 링크는 사용할 수 없습니다."; if (caught.code === "ALREADY_LINKED") return "이미 다른 팀이 사용한 초대 링크입니다."; return caught.message; }
