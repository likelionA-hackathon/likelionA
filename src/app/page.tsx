import Link from "next/link";

/**
 * 임시 랜딩. 화면은 전철우/김건희가 각자 라우트를 붙일 예정이라
 * 여기는 "API 가 살아있는지" 확인하는 용도로만 둡니다. 나중에 갈아엎어도 됩니다.
 *
 *  /login            로그인 (전철우)
 *  /onboarding       팀 생성/참여 (전철우)
 *  /invite/[code]    초대 수락 (전철우)
 *  /w/[id]           대시보드 (전철우)
 *  /w/[id]/connections  연결 관리 (전철우)
 *  /w/[id]/handovers/[handoverId]  인수인계 상세 (김건희)
 *  /w/[id]/actions   다음 업무 (김건희)
 *  /w/[id]/board     공유보드 (김건희)
 */
export default function Home() {
  const routes = [
    ["GET", "/api/me", "내 정보 + 소속 워크스페이스"],
    ["GET", "/api/workspaces/:id/dashboard", "대시보드 한 방"],
    ["GET", "/api/workspaces/:id/handovers", "인수인계 목록"],
    ["GET", "/api/handovers/:id", "인수인계 상세"],
    ["GET", "/api/workspaces/:id/next-actions", "다음 업무"],
    ["GET", "/api/workspaces/:id/board", "공유보드"],
    ["GET", "/api/workspaces/:id/requests", "정보요청"],
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">Baton</h1>
      <p className="mt-2 text-sm text-gray-600">
        팀 간 인수인계 허브 — 백엔드 API 가 준비되어 있습니다.
      </p>

      <div className="mt-8 rounded-lg border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900">읽기 엔드포인트</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {routes.map(([method, path, desc]) => (
            <li key={path} className="flex gap-3">
              <span className="w-10 shrink-0 font-mono text-xs text-gray-400">{method}</span>
              <code className="font-mono text-xs text-gray-800">{path}</code>
              <span className="text-xs text-gray-500">{desc}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-500">
          전체 명세는 저장소의 <code className="font-mono">docs/API.md</code> 를 보세요.
        </p>
      </div>

      <p className="mt-6 text-sm">
        <Link href="/api/me" className="text-blue-600 underline">
          /api/me 로 연결 확인하기
        </Link>
      </p>
    </main>
  );
}
