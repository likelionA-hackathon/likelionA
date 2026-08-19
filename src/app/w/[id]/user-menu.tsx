"use client";

import { LogoutButton } from "./logout-button";

/**
 * 사이드바 하단 계정 영역.
 *
 * 로그아웃 버튼 자체는 전철우님이 만든 LogoutButton 을 그대로 씁니다.
 * 여기서는 "지금 누구로 보고 있는지"만 위에 얹습니다.
 * 게스트로 둘러보는 사람이 자기가 게스트인 걸 모르면
 * 데모 데이터를 자기 팀 데이터로 착각하기 때문입니다.
 */
export function UserMenu({
  name,
  email,
  via,
}: {
  name: string | null;
  email: string;
  /** google = 실제 로그인, guest = 로그인 없이 둘러보기, dev = 개발용 헤더 */
  via: "google" | "guest" | "dev";
}) {
  const signedIn = via === "google";
  const displayName = name ?? (signedIn ? email : "게스트");

  return (
    <div className="mt-4 border-t border-[#e5e5e5] pt-4">
      <div className="flex items-center gap-2">
        <p className="min-w-0 truncate text-[10px] font-bold">{displayName}</p>
        {via === "guest" ? (
          <span className="shrink-0 rounded-full bg-[#f3f0ff] px-2 py-0.5 text-[9px] font-bold text-[#6d28d9]">
            게스트
          </span>
        ) : null}
        {via === "dev" ? (
          <span className="shrink-0 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[9px] font-bold text-[#c2410c]">
            개발
          </span>
        ) : null}
      </div>

      {signedIn ? (
        <p className="mt-0.5 truncate text-[9px] text-[#999]" title={email}>
          {email}
        </p>
      ) : (
        <p className="mt-0.5 text-[9px] text-[#999]">로그인 필요</p>
      )}

      {via === "guest" ? (
        <p className="mt-1 text-[9px] leading-4 text-[#999]">
          예시 데이터를 둘러보는 중입니다. 실제로 쓰려면 Google 로그인이 필요합니다.
        </p>
      ) : null}

      <LogoutButton signedIn={signedIn} />
    </div>
  );
}
