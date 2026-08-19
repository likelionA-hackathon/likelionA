/**
 * 세팅 진단 — 뭐가 빠졌는지 알려준다.
 *
 *   npm run doctor
 *
 * "안 돼요" 라고만 말하면 서로 시간이 갑니다.
 * 이걸 돌리고 결과를 그대로 팀방에 붙이면 원인이 바로 보입니다.
 */

import { readFileSync, existsSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const results = [];

function ok(label, detail = "") {
  results.push({ state: "ok", label, detail });
}
function warn(label, detail) {
  results.push({ state: "warn", label, detail });
}
function bad(label, detail) {
  results.push({ state: "bad", label, detail });
}

function readEnv() {
  if (!existsSync(".env")) return null;
  const env = {};
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  console.log("\n  PM Connector 세팅 진단\n" + "─".repeat(62));

  // ── 1. Node ──────────────────────────────────────
  const major = Number(process.version.slice(1).split(".")[0]);
  if (major >= 20) ok(`Node ${process.version}`);
  else bad(`Node ${process.version}`, "Node 20 이상이 필요합니다. https://nodejs.org 에서 LTS 설치");

  // ── 2. 의존성 ────────────────────────────────────
  if (!existsSync("node_modules")) {
    bad("의존성 설치 안 됨", "npm install 을 실행하세요.");
  } else if (!existsSync("node_modules/.prisma/client") && !existsSync("node_modules/@prisma/client")) {
    bad("Prisma Client 없음", "npx prisma generate 를 실행하세요.");
  } else {
    ok("의존성 설치됨");
  }

  // ── 3. .env ──────────────────────────────────────
  const env = readEnv();
  if (!env) {
    bad(".env 파일 없음", "copy .env.example .env   (맥이면 cp .env.example .env)");
  } else {
    ok(".env 파일 있음");

    if (!env.DATABASE_URL) {
      bad("DATABASE_URL 비어 있음", "팀방에 공유된 값을 .env 에 넣으세요.");
    } else if (!env.DATABASE_URL.includes("-pooler")) {
      warn("DATABASE_URL 에 -pooler 가 없음", "DATABASE_URL 은 pooler 붙은 쪽이어야 합니다. DIRECT_URL 과 바꿔 넣지 않았는지 확인하세요.");
    } else ok("DATABASE_URL 설정됨");

    if (!env.DIRECT_URL) {
      bad("DIRECT_URL 비어 있음", "DATABASE_URL 과 별개로 하나 더 필요합니다. 팀방 값 확인.");
    } else if (env.DIRECT_URL.includes("-pooler")) {
      warn("DIRECT_URL 에 -pooler 가 붙어 있음", "DIRECT_URL 은 pooler 없는 쪽이어야 합니다.");
    } else ok("DIRECT_URL 설정됨");

    if (env.DEV_AUTH_BYPASS !== "true") {
      bad("DEV_AUTH_BYPASS 가 true 가 아님", '로그인 없이 개발하려면 DEV_AUTH_BYPASS="true" 여야 합니다.');
    } else ok("개발용 인증 우회 켜짐");

    if (!env.DEV_USER_EMAIL) {
      warn("DEV_USER_EMAIL 비어 있음", 'DEV_USER_EMAIL="jiwoo@baton.dev" 를 넣으면 스크립트가 이 계정으로 API 를 부릅니다.');
    }

    const aiKey = env.OPENAI_API_KEY || env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY;
    if (!aiKey) {
      warn("AI 키 없음 (화면 작업에는 지장 없음)", "Notion 동기화와 다음 업무 생성만 안 됩니다. 백지우가 담당합니다.");
    } else ok("AI 키 있음");
  }

  // ── 4. 서버 ──────────────────────────────────────
  let serverUp = false;
  try {
    const res = await fetch(`${BASE}/api/me`, {
      headers: { "x-baton-user": env?.DEV_USER_EMAIL || "jiwoo@baton.dev" },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => null);
    serverUp = true;

    if (json === null) {
      bad("서버가 빈 응답을 줌", "npm run dev 터미널에 컴파일 에러가 있는지 보세요.");
    } else if (json.ok !== true) {
      bad(`API 오류: ${json.error?.code}`, json.error?.message ?? "");
    } else {
      ok("서버 응답 정상");
      const ws = json.data?.workspaces ?? [];
      if (ws.length === 0) {
        bad("워크스페이스가 하나도 없음", "DB 가 비었습니다. 백지우에게 알려주세요 (본인이 db:seed 를 돌리면 안 됩니다).");
      } else {
        ok(`워크스페이스 ${ws.length}개`, ws.map((w) => `${w.name} (${w.id})`).join(" · "));
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timeout|abort/i.test(msg)) {
      bad("서버 응답 없음 (타임아웃)", "DB 가 자다 깨는 중일 수 있습니다. 한 번 더 돌려보세요.");
    } else {
      bad(`서버가 안 떠 있음 (${BASE})`, "다른 터미널에서 npm run dev 를 실행하세요.");
    }
  }

  // ── 5. 데이터 ────────────────────────────────────
  if (serverUp) {
    try {
      const res = await fetch(`${BASE}/api/me`, {
        headers: { "x-baton-user": "jiwoo@baton.dev" },
        signal: AbortSignal.timeout(8000),
      });
      const json = await res.json();
      const wsId = json?.data?.workspaces?.[0]?.id;
      if (wsId) {
        const d = await fetch(`${BASE}/api/workspaces/${wsId}/dashboard`, {
          headers: { "x-baton-user": "jiwoo@baton.dev" },
          signal: AbortSignal.timeout(8000),
        }).then((r) => r.json());
        const n = d?.data?.recentHandovers?.length ?? 0;
        if (n > 0) ok(`데모 데이터 있음`, `인수인계 ${n}건, 다음 업무 ${d.data.todayActions?.length ?? 0}건`);
        else warn("인수인계 데이터가 비었음", "백지우에게 알려주세요.");
      }
    } catch {
      /* 위에서 이미 보고됨 */
    }
  }

  // ── 출력 ─────────────────────────────────────────
  console.log("");
  const icon = { ok: "  ✅", warn: "  ⚠️ ", bad: "  ❌" };
  for (const r of results) {
    console.log(`${icon[r.state]} ${r.label}`);
    if (r.detail) console.log(`      ${r.detail}`);
  }

  const bads = results.filter((r) => r.state === "bad").length;
  console.log("\n" + "─".repeat(62));
  if (bads === 0) {
    console.log("  준비 완료! docs/API.md 에서 본인 담당 부분 보시면 됩니다.\n");
  } else {
    console.log(`  ❌ ${bads}개 문제. 위 안내대로 해보시고, 그래도 안 되면`);
    console.log("     이 화면을 통째로 캡처해서 팀방에 올려주세요.\n");
  }
  process.exit(bads === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\n진단 스크립트가 터졌습니다:", e);
  process.exit(1);
});
