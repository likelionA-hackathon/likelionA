/**
 * 전 엔드포인트 스모크 테스트
 *
 *   npm run dev        (다른 터미널에서 켜둔 채로)
 *   npm run smoke
 *
 * 목적: 프론트 두 분이 화면 붙이다 500 을 만나기 전에 우리가 먼저 만난다.
 *
 * ⚠ 이 스크립트는 DB 를 건드립니다 (인수인계 확인 처리, 보드/요청 생성, 임시 워크스페이스 2개).
 *   끝나고 반드시 `npm run db:seed` 로 데모 데이터를 되돌리세요. 스크립트가 마지막에 다시 알려줍니다.
 *   그래서 팀원에게 .env 를 뿌리기 "전에" 돌리는 게 좋습니다.
 */

const BASE = process.env.BASE || "http://localhost:3000";

const JIWOO = "jiwoo@baton.dev";       // 정산팀 OWNER
const CHEOLWOO = "cheolwoo@baton.dev"; // 페이팀 OWNER
const GEONHEE = "geonhee@baton.dev";   // 두 팀 모두 MEMBER

const results = [];
let currentGroup = "";

function group(name) {
  currentGroup = name;
}

async function call(method, path, { user = JIWOO, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(user ? { "x-baton-user": user } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 본문 없음 */
  }
  return { status: res.status, json };
}

/**
 * @param label  화면에 찍힐 이름
 * @param fn     () => Promise<{status, json}>
 * @param check  (res) => true | string(실패 사유)
 */
async function test(label, fn, check) {
  const started = Date.now();
  try {
    const res = await fn();
    const verdict = check ? check(res) : res.status < 400 ? true : `status ${res.status}`;
    const ok = verdict === true;
    results.push({
      group: currentGroup,
      label,
      ok,
      ms: Date.now() - started,
      detail: ok ? "" : `${verdict} · ${JSON.stringify(res.json)?.slice(0, 200)}`,
    });
    return res;
  } catch (e) {
    results.push({
      group: currentGroup,
      label,
      ok: false,
      ms: Date.now() - started,
      detail: e instanceof Error ? e.message : String(e),
    });
    return { status: 0, json: null };
  }
}

// 자주 쓰는 검사기
const ok200 = (r) => (r.status === 200 && r.json?.ok === true ? true : `기대 200/ok, 실제 ${r.status}`);
const ok201 = (r) => (r.status === 201 && r.json?.ok === true ? true : `기대 201/ok, 실제 ${r.status}`);
const okAny = (r) => (r.status < 300 && r.json?.ok === true ? true : `기대 2xx/ok, 실제 ${r.status}`);
const errCode = (status, code) => (r) =>
  r.status === status && r.json?.error?.code === code
    ? true
    : `기대 ${status}/${code}, 실제 ${r.status}/${r.json?.error?.code}`;

async function main() {
  console.log(`\n▶ ${BASE} 대상으로 스모크 테스트 시작\n`);

  // ── 0. 서버 살아있는지 ────────────────────────────────
  try {
    await fetch(BASE + "/api/me", { headers: { "x-baton-user": JIWOO } });
  } catch {
    console.error(`✗ ${BASE} 에 연결할 수 없습니다. 다른 터미널에서 npm run dev 를 켰는지 확인하세요.\n`);
    process.exit(1);
  }

  // ── 1. 인증 / 워크스페이스 ────────────────────────────
  group("인증 · 워크스페이스");

  const me = await test("GET /api/me (정산팀)", () => call("GET", "/api/me"), ok200);
  const settleId = me.json?.data?.workspaces?.[0]?.id;

  const mePay = await test("GET /api/me (페이팀)", () => call("GET", "/api/me", { user: CHEOLWOO }), ok200);
  const payId = mePay.json?.data?.workspaces?.[0]?.id;

  if (!settleId || !payId) {
    console.error("✗ 워크스페이스 id 를 못 찾았습니다. npm run db:seed 를 먼저 돌리셨나요?\n");
    process.exit(1);
  }
  console.log(`  정산팀 ${settleId}`);
  console.log(`  페이팀 ${payId}\n`);

  await test("GET /api/workspaces", () => call("GET", "/api/workspaces"), ok200);

  await test(
    "인증 없음 → 401",
    () => call("GET", "/api/me", { user: "nobody@nowhere.dev" }),
    errCode(401, "UNAUTHENTICATED"),
  );

  await test(
    "남의 워크스페이스 → 403",
    () => call("GET", `/api/workspaces/${payId}/dashboard`, { user: JIWOO }),
    errCode(403, "NOT_A_MEMBER"),
  );

  await test(
    "없는 워크스페이스 → 403/404",
    () => call("GET", "/api/workspaces/does-not-exist/dashboard"),
    (r) => (r.status === 403 || r.status === 404 ? true : `기대 403/404, 실제 ${r.status}`),
  );

  // ── 2. 대시보드 ───────────────────────────────────────
  group("대시보드");

  const dash = await test("GET .../dashboard", () => call("GET", `/api/workspaces/${settleId}/dashboard`), ok200);
  await test(
    "  └ stats/badges/partner 채워짐",
    async () => dash,
    (r) => {
      const d = r.json?.data;
      if (!d) return "data 없음";
      if (typeof d.stats?.newHandovers !== "number") return "stats.newHandovers 없음";
      if (typeof d.badges?.incomingRequests !== "number") return "badges 없음";
      if (!d.partner?.partner?.name) return "partner 연결 안 됨";
      if (!Array.isArray(d.recentHandovers) || d.recentHandovers.length === 0) return "recentHandovers 비어있음";
      if (!d.recentHandovers[0].priority?.label) return "우선순위 배지 없음";
      return true;
    },
  );

  await test("GET .../link", () => call("GET", `/api/workspaces/${settleId}/link`), ok200);
  await test("GET .../connections", () => call("GET", `/api/workspaces/${settleId}/connections`), ok200);

  // ── 3. 인수인계 ───────────────────────────────────────
  group("인수인계");

  const list = await test("GET .../handovers", () => call("GET", `/api/workspaces/${settleId}/handovers`), ok200);
  const handovers = list.json?.data ?? [];
  const newOne = handovers.find((h) => h.status === "NEW");
  const anyOne = handovers[0];

  await test(
    "GET .../handovers?status=NEW&priority=URGENT",
    () => call("GET", `/api/workspaces/${settleId}/handovers?status=NEW&priority=URGENT`),
    ok200,
  );
  await test(
    "GET .../handovers?q=PG",
    () => call("GET", `/api/workspaces/${settleId}/handovers?q=PG`),
    (r) => (r.json?.data?.length > 0 ? true : "검색 결과 0건"),
  );

  const detail = await test(
    "GET /api/handovers/:id",
    () => call("GET", `/api/handovers/${anyOne?.id}`),
    ok200,
  );
  await test(
    "  └ changes/openQuestions/rawContent 있음",
    async () => detail,
    (r) => {
      const d = r.json?.data;
      if (!d) return "data 없음";
      if (!Array.isArray(d.changes)) return "changes 배열 아님";
      if (!Array.isArray(d.openQuestions)) return "openQuestions 배열 아님";
      if (typeof d.rawContent !== "string") return "rawContent 없음";
      if (!Array.isArray(d.nextActions)) return "nextActions 없음";
      return true;
    },
  );

  await test(
    "없는 인수인계 → 404",
    () => call("GET", "/api/handovers/nope"),
    errCode(404, "HANDOVER_NOT_FOUND"),
  );

  await test(
    "POST .../acknowledge",
    () => call("POST", `/api/handovers/${newOne?.id}/acknowledge`),
    (r) => (r.json?.data?.status === "ACKNOWLEDGED" ? true : `status=${r.json?.data?.status}`),
  );
  await test(
    "  └ 이미 확인한 건 재호출도 200",
    () => call("POST", `/api/handovers/${newOne?.id}/acknowledge`),
    ok200,
  );

  await test(
    "POST .../actions/generate (AI 키 없음 → 503)",
    () => call("POST", `/api/handovers/${anyOne?.id}/actions/generate`),
    (r) =>
      r.status === 503 && r.json?.error?.code === "AI_DISABLED"
        ? true
        : r.status === 201
          ? true // 키가 있으면 실제로 생성됨. 그것도 통과.
          : `기대 503/AI_DISABLED 또는 201, 실제 ${r.status}/${r.json?.error?.code}`,
  );

  // ── 4. 다음 업무 ──────────────────────────────────────
  group("다음 업무");

  const actions = await test(
    "GET .../next-actions",
    () => call("GET", `/api/workspaces/${settleId}/next-actions`),
    ok200,
  );
  const seedAction = actions.json?.data?.[0];

  await test(
    "GET .../next-actions?status=TODO,DOING",
    () => call("GET", `/api/workspaces/${settleId}/next-actions?status=TODO,DOING`),
    ok200,
  );
  await test(
    "GET .../next-actions?assignee=백지우",
    () => call("GET", `/api/workspaces/${settleId}/next-actions?assignee=${encodeURIComponent("백지우")}`),
    (r) => (r.json?.data?.length > 0 ? true : "담당자 필터 결과 0건"),
  );

  const created = await test(
    "POST .../next-actions",
    () =>
      call("POST", `/api/workspaces/${settleId}/next-actions`, {
        body: { title: "[smoke] 임시 업무", description: "스모크 테스트", priority: "HIGH" },
      }),
    ok201,
  );
  const tempActionId = created.json?.data?.id;

  await test(
    "  └ 빈 body → 400",
    () => call("POST", `/api/workspaces/${settleId}/next-actions`, { body: {} }),
    errCode(400, "INVALID_BODY"),
  );

  await test(
    "PATCH /api/next-actions/:id (status=DONE)",
    () => call("PATCH", `/api/next-actions/${tempActionId}`, { body: { status: "DONE" } }),
    (r) => (r.json?.data?.status === "DONE" ? true : `status=${r.json?.data?.status}`),
  );
  await test(
    "  └ 수정하면 aiDraft 가 false 로",
    () => call("PATCH", `/api/next-actions/${tempActionId}`, { body: { assignee: "백지우" } }),
    (r) => (r.json?.data?.aiDraft === false ? true : `aiDraft=${r.json?.data?.aiDraft}`),
  );
  await test(
    "DELETE /api/next-actions/:id (정리)",
    () => call("DELETE", `/api/next-actions/${tempActionId}`),
    ok200,
  );

  // ── 5. 공유보드 ───────────────────────────────────────
  group("공유보드");

  await test("GET .../board", () => call("GET", `/api/workspaces/${settleId}/board`), ok200);
  await test(
    "GET .../board?direction=INCOMING",
    () => call("GET", `/api/workspaces/${settleId}/board?direction=INCOMING`),
    (r) => (r.json?.data?.every?.((b) => b.direction === "INCOMING") ? true : "방향 필터 안 먹음"),
  );

  const board = await test(
    "POST .../board (업무 선택 → DRAFT)",
    () =>
      call("POST", `/api/workspaces/${settleId}/board`, {
        body: { nextActionIds: [seedAction?.id], share: false },
      }),
    ok201,
  );
  const boardId = board.json?.data?.[0]?.id;

  await test(
    "  └ targetPayload(Jira 미리보기) 생성됨",
    async () => board,
    (r) => {
      const p = r.json?.data?.[0]?.targetPayload;
      if (!p) return "targetPayload 없음";
      if (!p.project || !p.issueType || !p.summary) return "payload 필드 누락";
      if (!Array.isArray(p.labels)) return "labels 없음";
      return true;
    },
  );

  await test(
    "PATCH /api/board/:id → SHARED (보낸 팀)",
    () => call("PATCH", `/api/board/${boardId}`, { body: { status: "SHARED" } }),
    (r) => (r.json?.data?.item?.status === "SHARED" ? true : `status=${r.json?.data?.item?.status}`),
  );
  await test(
    "  └ 보낸 팀이 ACCEPTED 시도 → 403",
    () => call("PATCH", `/api/board/${boardId}`, { body: { status: "ACCEPTED" } }),
    errCode(403, "RECEIVER_ONLY"),
  );
  await test(
    "PATCH → ACCEPTED (받는 팀) + 업무 자동 복사",
    () => call("PATCH", `/api/board/${boardId}`, { user: CHEOLWOO, body: { status: "ACCEPTED" } }),
    (r) => (r.json?.data?.copiedAction?.id ? true : "copiedAction 없음"),
  );

  // ── 6. 정보요청 ───────────────────────────────────────
  group("정보요청");

  await test("GET .../requests", () => call("GET", `/api/workspaces/${settleId}/requests`), ok200);
  await test(
    "GET .../requests?direction=INCOMING&status=OPEN",
    () => call("GET", `/api/workspaces/${settleId}/requests?direction=INCOMING&status=OPEN`),
    ok200,
  );

  const q = "[smoke] 이 부분 기준이 뭔가요?";
  const req = await test(
    "POST .../requests",
    () =>
      call("POST", `/api/workspaces/${settleId}/requests`, {
        body: { question: q, handoverItemId: anyOne?.id },
      }),
    ok201,
  );
  const reqId = req.json?.data?.id;

  await test(
    "  └ 같은 질문 재전송 → 중복 안 만듦",
    () => call("POST", `/api/workspaces/${settleId}/requests`, { body: { question: q } }),
    (r) => (r.json?.data?.id === reqId ? true : "새 요청이 또 만들어짐"),
  );
  await test(
    "  └ 보낸 팀이 답변 시도 → 403",
    () => call("POST", `/api/requests/${reqId}/answer`, { body: { answer: "내가 답함" } }),
    errCode(403, "NOT_A_MEMBER"),
  );
  await test(
    "POST /api/requests/:id/answer (받은 팀)",
    () => call("POST", `/api/requests/${reqId}/answer`, { user: CHEOLWOO, body: { answer: "[smoke] 답변" } }),
    (r) => (r.json?.data?.status === "ANSWERED" ? true : `status=${r.json?.data?.status}`),
  );

  // ── 7. 팀 생성 / 초대 / 연결 ──────────────────────────
  group("팀 생성 · 초대");

  const wsA = await test(
    "POST /api/workspaces (A)",
    () => call("POST", "/api/workspaces", { user: GEONHEE, body: { name: "[smoke] A팀" } }),
    ok201,
  );
  const wsB = await test(
    "POST /api/workspaces (B)",
    () => call("POST", "/api/workspaces", { user: GEONHEE, body: { name: "[smoke] B팀" } }),
    ok201,
  );
  const aId = wsA.json?.data?.id;
  const bId = wsB.json?.data?.id;

  await test(
    "  └ 생성 시 Jira 목 연결 자동 추가",
    () => call("GET", `/api/workspaces/${aId}/connections`, { user: GEONHEE }),
    (r) => (r.json?.data?.some?.((c) => c.provider === "JIRA" && c.isMock) ? true : "Jira 목 연결 없음"),
  );

  const invite = await test(
    "POST .../link (초대 코드 발급)",
    () => call("POST", `/api/workspaces/${aId}/link`, { user: GEONHEE }),
    okAny,
  );
  const code = invite.json?.data?.inviteCode;

  await test(
    "  └ 재발급하면 같은 코드",
    () => call("POST", `/api/workspaces/${aId}/link`, { user: GEONHEE }),
    (r) => (r.json?.data?.inviteCode === code ? true : "코드가 새로 생김"),
  );
  await test(
    "  └ 자기 팀에 수락 시도 → 400",
    () => call("POST", "/api/links/accept", { user: GEONHEE, body: { inviteCode: code, workspaceId: aId } }),
    errCode(400, "SELF_LINK"),
  );
  await test(
    "POST /api/links/accept",
    () => call("POST", "/api/links/accept", { user: GEONHEE, body: { inviteCode: code, workspaceId: bId } }),
    (r) => (r.json?.data?.status === "ACTIVE" ? true : `status=${r.json?.data?.status}`),
  );
  await test(
    "  └ 없는 코드 → 404",
    () => call("POST", "/api/links/accept", { user: GEONHEE, body: { inviteCode: "ZZZZZZZZ", workspaceId: bId } }),
    errCode(404, "INVITE_NOT_FOUND"),
  );

  await test(
    "POST .../connections (Jira 목)",
    () =>
      call("POST", `/api/workspaces/${aId}/connections`, {
        user: GEONHEE,
        body: { provider: "JIRA", site: "smoke.atlassian.net", projectKey: "SMK" },
      }),
    ok201,
  );
  await test(
    "  └ Notion 잘못된 토큰 → 4xx",
    () =>
      call("POST", `/api/workspaces/${aId}/connections`, {
        user: GEONHEE,
        body: { provider: "NOTION", token: "ntn_invalid_token_xxxxx", databaseId: "0000000000000000" },
      }),
    // 401 로 오면 프론트가 /login 으로 튕긴다. 반드시 400 대역이어야 한다.
    (r) =>
      r.status === 401
        ? "401 이면 프론트가 로그인 화면으로 튕긴다. NOTION_AUTH_FAILED(400) 여야 함"
        : r.status === 400 && r.json?.error?.code?.startsWith("NOTION_")
          ? true
          : `기대 400/NOTION_*, 실제 ${r.status}/${r.json?.error?.code}`,
  );

  // ── 8. Notion 동기화 ──────────────────────────────────
  group("Notion 동기화");

  await test(
    "POST .../notion/sync (토큰 없음 → 409)",
    () => call("POST", `/api/workspaces/${settleId}/notion/sync`, { body: { limit: 2 } }),
    (r) =>
      r.status === 409 && r.json?.error?.code === "NOTION_NOT_CONNECTED"
        ? true
        : r.status === 200
          ? true // 토큰이 있으면 실제로 동기화됨. 그것도 통과.
          : `기대 409/NOTION_NOT_CONNECTED 또는 200, 실제 ${r.status}/${r.json?.error?.code}`,
  );

  // ── 결과 ──────────────────────────────────────────────
  print();
}

function print() {
  console.log("");
  let lastGroup = "";
  for (const r of results) {
    if (r.group !== lastGroup) {
      console.log(`\n  ${r.group}`);
      lastGroup = r.group;
    }
    const mark = r.ok ? "✅" : "❌";
    const time = String(r.ms).padStart(5) + "ms";
    console.log(`  ${mark} ${time}  ${r.label}`);
    if (!r.ok) console.log(`              └ ${r.detail}`);
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;

  console.log("\n" + "─".repeat(60));
  console.log(`  통과 ${pass} / ${results.length}${fail ? `   실패 ${fail}` : ""}`);
  console.log("─".repeat(60));

  if (fail === 0) {
    console.log("\n  전 구간 통과. 프론트 붙여도 됩니다.\n");
  } else {
    console.log("\n  ❌ 표시된 줄을 지우한테 그대로 붙여주세요.\n");
  }

  console.log("  ⚠ 이 테스트가 DB 를 건드렸습니다 (인수인계 확인 처리, 보드/요청 생성, [smoke] 워크스페이스 2개).");
  console.log("    데모 데이터를 원래대로 돌리려면:  npm run db:seed\n");

  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\n스크립트 자체가 터졌습니다:", e);
  process.exit(1);
});
