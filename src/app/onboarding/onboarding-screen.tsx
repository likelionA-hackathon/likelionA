"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";

type OnboardingMode = "create" | "join";
type Plan = "FREE" | "PRO" | "ENTERPRISE";

const TIMEZONES = [
  { value: "Asia/Seoul", label: "Asia/Seoul (KST, UTC+9)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST, UTC+9)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PT)" },
  { value: "America/New_York", label: "America/New_York (ET)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
] as const;

const PLANS: Array<{
  id: Plan;
  name: string;
  description: string;
  features: string[];
}> = [
  { id: "FREE", name: "Free", description: "개인 또는 소규모 팀", features: ["기본 협업 기능", "제한된 AI 사용량", "기본 도구 연결"] },
  { id: "PRO", name: "Pro", description: "활발하게 협업하는 팀", features: ["확장된 AI 사용량", "더 많은 도구 연결", "고급 공유·자동화 기능"] },
  { id: "ENTERPRISE", name: "Enterprise", description: "조직 단위 운영", features: ["조직 관리·보안 기능", "확장된 권한 관리", "기업용 지원 및 설정"] },
];

function inviteCodeFromInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const inviteIndex = segments.findIndex((segment) => segment === "invite");
    return inviteIndex >= 0 ? (segments[inviteIndex + 1] ?? "") : "";
  } catch {
    return trimmed.replace(/^.*\/invite\//, "").split(/[?#/]/)[0] ?? "";
  }
}

export function OnboardingScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<OnboardingMode>("create");
  const [name, setName] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [createTimezone, setCreateTimezone] = useState("Asia/Seoul");
  const [joinTimezone, setJoinTimezone] = useState("Asia/Seoul");
  const [plan, setPlan] = useState<Plan>("PRO");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.me().catch((caught) => {
      if (caught instanceof ApiError && caught.code === "UNAUTHENTICATED") router.replace("/login");
    });
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "create") {
        if (!name.trim()) {
          setError("팀 이름을 입력해 주세요.");
          return;
        }
        // TODO: DB 필드가 준비되면 createTimezone과 plan을 생성 API에 함께 전달합니다.
        const workspace = await api.createWorkspace({ name: name.trim() });
        router.push(`/w/${workspace.id}`);
        return;
      }

      const inviteCode = inviteCodeFromInput(inviteLink);
      if (!inviteCode) {
        setError("올바른 초대 링크 또는 초대 코드를 입력해 주세요.");
        return;
      }
      const me = await api.me();
      if (me.workspaces.length === 0) {
        setError("초대에 참여하려면 먼저 내 팀을 만들어야 합니다.");
        return;
      }
      // TODO: DB 필드가 준비되면 joinTimezone과 plan을 참여 워크스페이스에 저장합니다.
      await api.acceptInvite({ inviteCode, workspaceId: me.workspaces[0].id });
      router.push(`/w/${me.workspaces[0].id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "UNAUTHENTICATED") router.replace("/login");
      else if (caught instanceof ApiError && caught.code === "INVITE_NOT_FOUND") setError("유효하지 않은 초대 링크입니다.");
      else if (caught instanceof ApiError && caught.code === "INVITE_REVOKED") setError("만료된 초대 링크입니다.");
      else if (caught instanceof ApiError && caught.code === "SELF_LINK") setError("같은 팀의 초대 링크는 사용할 수 없습니다.");
      else if (caught instanceof ApiError && caught.code === "ALREADY_LINKED") setError("이미 다른 팀이 사용한 초대 링크입니다.");
      else setError(caught instanceof ApiError ? caught.message : "요청을 처리하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-[#171717]">
      <header className="border-b border-[#e5e5e5] px-6 py-7 sm:px-10 lg:px-16">
        <h1 className="text-2xl font-extrabold tracking-[-0.04em]">팀 생성 및 참여</h1>
      </header>

      <form onSubmit={submit} className="mx-auto w-full max-w-[1480px] px-6 py-10 sm:px-10 lg:px-16">
        <section>
          <h2 className="text-lg font-extrabold tracking-[-0.03em]">팀(스페이스) 생성 및 참여</h2>
          <p className="mt-1 text-[11px] text-[#777]">하나의 팀 공간에서 연결된 PM과 공유 범위를 관리합니다.</p>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <fieldset className={`rounded-xl border p-6 transition ${mode === "create" ? "border-[#171717] ring-1 ring-[#171717]" : "border-[#dedede]"}`}>
              <legend className="sr-only">새 팀 만들기</legend>
              <h3 className="text-base font-extrabold">새 팀 만들기</h3>
              <p className="mt-2 text-[11px] text-[#777]">팀 정보를 입력하고 새 워크스페이스를 생성합니다.</p>
              <label className="mt-6 block text-[11px] font-bold">
                팀 이름
                <input value={name} onFocus={() => setMode("create")} onChange={(event) => setName(event.target.value)} placeholder="예: 디자인팀" maxLength={50} className="mt-2 h-11 w-full rounded-md border border-[#d8d8d8] px-4 text-xs outline-none focus:border-[#171717]" />
              </label>
              <TimezoneField value={createTimezone} onFocus={() => setMode("create")} onChange={setCreateTimezone} />
              <div className="mt-6 flex justify-end">
                <ModeButton selected={mode === "create"} onClick={() => setMode("create")} label="새 팀 만들기" />
              </div>
            </fieldset>

            <fieldset className={`rounded-xl border p-6 transition ${mode === "join" ? "border-[#171717] ring-1 ring-[#171717]" : "border-[#dedede]"}`}>
              <legend className="sr-only">초대 링크로 참여하기</legend>
              <h3 className="text-base font-extrabold">초대 링크로 참여하기</h3>
              <p className="mt-2 text-[11px] text-[#777]">전달받은 초대 링크로 파트너 워크스페이스에 참여합니다.</p>
              <label className="mt-6 block text-[11px] font-bold">
                초대 링크
                <input value={inviteLink} onFocus={() => setMode("join")} onChange={(event) => setInviteLink(event.target.value)} placeholder="https://pmconnector.app/invite/..." className="mt-2 h-11 w-full rounded-md border border-[#d8d8d8] px-4 text-xs outline-none focus:border-[#171717]" />
              </label>
              <TimezoneField value={joinTimezone} onFocus={() => setMode("join")} onChange={setJoinTimezone} />
              <div className="mt-6 flex justify-end">
                <ModeButton selected={mode === "join"} onClick={() => setMode("join")} label="팀 참여하기" />
              </div>
            </fieldset>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-extrabold tracking-[-0.03em]">요금제 선택</h2>
          <p className="mt-1 text-[11px] text-[#777]">팀 규모와 사용 범위에 맞는 플랜을 선택합니다.</p>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {PLANS.map((item) => {
              const selected = plan === item.id;
              return (
                <button key={item.id} type="button" aria-pressed={selected} onClick={() => setPlan(item.id)} className={`flex min-h-64 flex-col rounded-xl border p-6 text-left transition ${selected ? "border-[#171717] ring-1 ring-[#171717]" : "border-[#dedede] hover:border-[#999]"}`}>
                  <span className="text-2xl font-extrabold">{item.name}</span>
                  <span className="mt-2 text-[11px] text-[#777]">{item.description}</span>
                  <span className="mt-7 space-y-3 text-[11px]">
                    {item.features.map((feature) => <span key={feature} className="block">• {feature}</span>)}
                  </span>
                  <span className={`mt-auto flex h-11 items-center justify-center rounded-md border text-xs font-bold ${selected ? "border-[#171717] bg-[#171717] text-white" : "border-[#d8d8d8] bg-white"}`}>
                    {selected ? `${item.name} 선택됨` : `${item.name} 선택`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {error ? <p role="alert" className="mt-6 rounded-md bg-[#fff1f1] px-4 py-3 text-[11px] text-[#b42318]">{error}</p> : null}
        <div className="mt-8 flex justify-end">
          <button disabled={loading} className="h-11 min-w-52 rounded-md bg-[#171717] px-8 text-xs font-bold text-white hover:bg-black disabled:opacity-50">
            {loading ? "처리 중..." : "설정 완료"}
          </button>
        </div>
      </form>
    </main>
  );
}

function TimezoneField({ value, onFocus, onChange }: { value: string; onFocus: () => void; onChange: (value: string) => void }) {
  return (
    <>
      <label className="mt-4 block text-[11px] font-bold">
        기준 타임존
        <select value={value} onFocus={onFocus} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-4 text-xs outline-none focus:border-[#171717]">
          {TIMEZONES.map((timezone) => <option key={timezone.value} value={timezone.value}>{timezone.label}</option>)}
        </select>
      </label>
      <p className="mt-2 text-[10px] text-[#8a8a8a]">인수인계 시간과 마감일 표시에 사용됩니다.</p>
    </>
  );
}

function ModeButton({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`h-10 min-w-44 rounded-md px-6 text-xs font-bold ${selected ? "bg-[#171717] text-white" : "border border-[#d8d8d8] bg-white"}`}>
      {selected ? `${label} 선택됨` : label}
    </button>
  );
}
