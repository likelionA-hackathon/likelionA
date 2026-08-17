/**
 * 워크스페이스 화면 공통 껍데기.
 *
 * /w/[id] 아래 모든 화면(대시보드 · 연결관리 · 인수인계 상세 · 다음업무 · 공유보드)에
 * 자동으로 적용됩니다. 각 화면 컴포넌트는 좌우 여백을 직접 넣지 마세요. 여기서 한 번만 잡습니다.
 *
 * ── 전철우님께
 * 사이드바나 상단 헤더가 필요하면 이 파일에 넣으시면 됩니다.
 * 아래 주석 자리에 넣고 children 을 감싸면 전체 화면에 한 번에 적용됩니다.
 * 이 파일은 공용이라, 고치기 전에 팀방에 한마디 남겨주세요.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* 사이드바 / 상단 헤더 자리 (전철우) */}
      <div className="mx-auto w-full max-w-[1200px] px-5 py-8 sm:px-8">
        {children}
      </div>
    </div>
  );
}
