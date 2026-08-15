/**
 * Notion 연결 + 동기화 + AI 결과 확인을 한 번에.
 *
 *   npm run dev        (다른 터미널)
 *   npm run notion
 *
 * .env 의 NOTION_TOKEN / NOTION_DATABASE_ID 를 읽어서
 *   ① 페이팀에 Notion 연결 등록 (여기서 토큰·DB id 가 맞는지 판명남)
 *   ② 동기화 실행 (Claude 요약 포함)
 *   ③ 생성된 인수인계의 AI 결과물을 터미널에 보기 좋게 출력
 *
 * 프롬프트 튜닝하는 동안 계속 돌릴 스크립트입니다.
 * 두 번째부터는 --force 로 이미 있는 것도 다시 요약합니다:  npm run notion -- --force
 */

import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
//   npm run notion:force        ← 이걸 쓰세요
const FORCE =
  process.argv.some((a) => ["--force", "-f", "--again"].includes(a)) ||
  process.env.FORCE === "1";
// --actions 를 붙이면 요약 뒤에 "다음 업무 생성"까지 돌려서 결과를 보여준다.
const WITH_ACTIONS = process.argv.includes("--actions");
const OWNER = "cheolwoo@baton.dev"; // 페이팀 = 인수인계를 넘기는 쪽

function readEnv() {
  let raw;
  try {
    raw = readFileSync(".env", "utf8");
  } catch {
    fail(".env 파일이 없습니다. copy .env.example .env 부터 하세요.");
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function fail(msg, extra) {
  console.error(`\n✗ ${msg}\n`);
  if (extra) console.error(extra, "\n");
  process.exit(1);
}

async function api(method, path, { user = OWNER, body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", "x-baton-user": user },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    fail(`${BASE} 에 연결할 수 없습니다. 다른 터미널에서 npm run dev 를 켜두세요.`);
  }
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const line = (c = "─") => console.log(c.repeat(66));

function block(title, text) {
  if (!text) return;
  console.log(`\n  ▸ ${title}`);
  for (const l of String(text).split("\n")) console.log(`    ${l}`);
}

async function main() {
  console.log(`\n[notion] 시작 · node ${process.version} · cwd=${process.cwd()}`);
  console.log(`[notion] 대상 서버 ${BASE}${FORCE ? " (--force)" : ""}`);

  const env = readEnv();
  console.log(
    `[notion] .env 읽음 · NOTION_TOKEN ${env.NOTION_TOKEN ? "있음" : "없음"}` +
      ` · NOTION_DATABASE_ID ${env.NOTION_DATABASE_ID ? "있음" : "없음"}` +
      ` · AI 키 ${env.OPENAI_API_KEY ? "OpenAI" : env.GEMINI_API_KEY ? "Gemini" : env.ANTHROPIC_API_KEY ? "Claude" : "없음"}`,
  );
  const token = env.NOTION_TOKEN;
  const databaseId = env.NOTION_DATABASE_ID;

  if (!token) fail(".env 에 NOTION_TOKEN 이 비어 있습니다.");
  if (!databaseId) fail(".env 에 NOTION_DATABASE_ID 가 비어 있습니다.");
  if (!env.OPENAI_API_KEY && !env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY) {
    console.log(
      "\n⚠ AI 키가 없습니다. 원문만 가져오고 요약은 건너뜁니다." +
        "\n  무료로 쓰려면 https://aistudio.google.com/apikey 에서 발급받아 .env 의 GEMINI_API_KEY 에 넣으세요.\n",
    );
  }

  // ── 워크스페이스 찾기 ──────────────────────────────
  const me = await api("GET", "/api/me");

  // 서버가 컴파일 에러로 죽으면 빈 응답이 온다. seed 문제로 오해하지 않도록 구분.
  if (me.json === null) {
    fail(
      `서버가 응답은 했지만 본문이 비어 있습니다 (HTTP ${me.status}).`,
      "→ dev 서버가 문법 오류로 죽었을 가능성이 큽니다.\n" +
        "   npm run dev 를 띄운 터미널의 마지막 몇 줄을 확인하고, 서버를 다시 시작하세요.",
    );
  }
  if (me.json.ok !== true) {
    fail(`/api/me 실패 [${me.json.error?.code}] ${me.json.error?.message ?? ""}`, JSON.stringify(me.json));
  }

  const ws = me.json.data?.workspaces?.[0];
  if (!ws) {
    fail(
      "페이팀 워크스페이스를 못 찾았습니다.",
      "→ npm run db:seed 를 돌린 뒤 다시 시도하세요.",
    );
  }
  console.log(`\n워크스페이스: ${ws.name} (${ws.id})`);

  // ── ① 연결 등록 ───────────────────────────────────
  console.log(`\n① Notion 연결 확인 중...  db=${databaseId.slice(0, 8)}…`);
  const conn = await api("POST", `/api/workspaces/${ws.id}/connections`, {
    body: { provider: "NOTION", token, databaseId },
  });

  if (conn.json?.ok !== true) {
    const code = conn.json?.error?.code;
    const hint =
      code === "NOTION_AUTH_FAILED"
        ? "→ Notion 페이지 우측 상단 ⋯ → 연결 → 만든 integration 을 추가했는지 확인하세요.\n" +
          "   토큰 오타도 흔합니다 (ntn_ 으로 시작)."
        : code === "NOTION_NOT_FOUND"
          ? "→ databaseId 가 틀렸습니다. 표(전체 페이지)의 링크에서 ? 앞 32자리여야 합니다.\n" +
            "   표 안의 '행' 링크를 복사하면 이 에러가 납니다."
          : code === "NOTION_NOT_A_DATABASE"
            ? "→ 만든 게 표가 아니라 일반 페이지입니다.\n" +
              "   Notion 에서 새 페이지 → /표 또는 /database → 'Table - Full page' 로 만드세요."
            : "";
    fail(`연결 실패 [${code}] ${conn.json?.error?.message ?? ""}`, hint);
  }

  console.log(`   ✅ 연결됨 — "${conn.json.data.displayName}" (Notion API ${conn.json.data.apiVersion})`);

  // ── ② 동기화 ──────────────────────────────────────
  console.log(`\n② 동기화 중... (건당 AI 호출이 들어가 10~30초 걸립니다)`);
  const sync = await api("POST", `/api/workspaces/${ws.id}/notion/sync`, {
    body: { limit: 6, target: "partner", force: FORCE },
  });

  if (sync.json?.ok !== true) {
    fail(`동기화 실패 [${sync.json?.error?.code}] ${sync.json?.error?.message ?? ""}`, sync.json);
  }

  const r = sync.json.data;
  console.log(
    `   스캔 ${r.scanned} · 생성 ${r.created} · 갱신 ${r.updated} · 건너뜀 ${r.skipped} · AI ${r.aiUsed ? "사용" : "미사용"}`,
  );
  for (const w of r.warnings ?? []) console.log(`   ⚠ ${w}`);

  if (r.scanned === 0) {
    fail(
      "Notion 에서 페이지를 0건 가져왔습니다.",
      "→ 데이터베이스가 비어 있거나, 표가 아니라 일반 페이지를 가리켰을 수 있습니다.\n" +
        "   표(Table - Full page)를 만들고 행을 몇 개 넣었는지 확인하세요.",
    );
  }

  // ── ③ AI 결과 출력 ────────────────────────────────
  console.log(`\n③ AI 결과\n`);

  for (const item of r.items) {
    const d = await api("GET", `/api/handovers/${item.id}`, { user: "jiwoo@baton.dev" });
    const h = d.json?.data;
    if (!h) continue;

    line("═");
    console.log(`  ${h.title}`);
    console.log(
      `  ${h.priority.label}  ←  원본 "${h.priority.raw ?? "없음"}"     작성자 ${h.author ?? "미상"}`,
    );
    console.log(`  판단 근거: ${h.priority.reason ?? "-"}`);
    line();

    block("요약", h.summary);

    if (h.changes?.length) {
      console.log(`\n  ▸ 변경사항 (${h.changes.length})`);
      for (const c of h.changes) {
        console.log(`    [${c.typeLabel}] ${c.text}`);
        console.log(`        영향: ${c.impact}`);
      }
    }

    block("업무맥락", h.workContext);

    if (h.openQuestions?.length) {
      console.log(`\n  ▸ 추가확인 (${h.openQuestions.length})`);
      for (const q of h.openQuestions) {
        console.log(`    Q. ${q.question}`);
        console.log(`       ${q.why}`);
      }
    }

    if (WITH_ACTIONS) {
      const gen = await api("POST", `/api/handovers/${item.id}/actions/generate`, {
        user: "jiwoo@baton.dev",
      });
      if (gen.json?.ok) {
        const actions = gen.json.data ?? [];
        console.log(`\n  ▸ 다음 업무 초안 (${actions.length})`);
        for (const a of actions) {
          const who = a.assignee ? ` · ${a.assignee}` : "";
          console.log(`    [${a.priority.label}]${who} ${a.title}`);
          if (a.description) {
            for (const l of a.description.split("\n")) console.log(`        ${l}`);
          }
        }
      } else {
        console.log(`\n  ▸ 다음 업무 생성 실패: ${gen.json?.error?.code} ${gen.json?.error?.message ?? ""}`);
      }
    }

    console.log(`\n  원문 ${h.rawContent.length}자 → 요약 ${(h.summary ?? "").length}자`);

    if (h.rawContent.length < 200) {
      console.log(`\n  ⚠ 원문이 너무 짧습니다. Notion 행의 "본문"이 비어 있을 가능성이 큽니다.`);
      console.log(`     실제로 가져온 내용 전체:`);
      for (const l of h.rawContent.split("\n")) console.log(`     │ ${l}`);
      console.log(`     → Notion 표에서 행 제목에 마우스를 올리면 나오는 [열기] 를 눌러`);
      console.log(`       페이지를 연 다음, 그 안에 본문을 붙여넣어야 합니다.`);
    }
    console.log("");
  }

  line("═");
  console.log(`
  결과가 마음에 안 들면 src/lib/claude.ts 의 SUMMARY_SYSTEM 을 고치고
  npm run notion:force  로 다시 돌리세요. (그냥 notion 은 안 바뀐 건 건너뜁니다)
`);
}

main().catch((e) => {
  console.error("\n스크립트가 터졌습니다:", e);
  process.exit(1);
});
