import Anthropic from "@anthropic-ai/sdk";
import { Priority } from "@prisma/client";
import { normalizePriority } from "@/lib/priority";

/**
 * AI 로직 3종 (백지우)
 *  1) summarizeHandover     : Notion 원문 → 요약 / 변경사항 / 업무맥락 / 추가확인 / 우선순위 제안
 *  2) resolvePriorityWithAI : 규칙으로 못 맞춘 우선순위 표기를 4단계로 정규화
 *  3) generateNextActions   : 인수인계 내용에서 우리 팀이 할 일 초안 뽑기
 *
 * 구조화 출력은 tool-use 대신 "JSON 만 뱉게 시키고 assistant 턴을 '{' 로 프리필" 하는 방식.
 * 모델이 서두를 붙이는 사고를 원천 차단해서 파싱이 안정적이다.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export function isAiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function askJson<T>(system: string, userPrompt: string, maxTokens = 2000): Promise<T | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [
      { role: "user", content: userPrompt },
      { role: "assistant", content: "{" },
    ],
  });

  const block = res.content.find((c) => c.type === "text");
  const raw = block && block.type === "text" ? block.text : "";
  const jsonText = "{" + raw;

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    // 모델이 뒤에 사족을 붙인 경우: 마지막 '}' 까지만 잘라서 재시도
    const cut = jsonText.lastIndexOf("}");
    if (cut > 0) {
      try {
        return JSON.parse(jsonText.slice(0, cut + 1)) as T;
      } catch {
        /* fallthrough */
      }
    }
    console.error("[claude] JSON 파싱 실패:", jsonText.slice(0, 400));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 1) 인수인계 요약
// ─────────────────────────────────────────────────────────────

export type HandoverChange = {
  type: "added" | "changed" | "removed";
  text: string;
  impact: string;
};

export type HandoverQuestion = {
  question: string;
  why: string;
};

export type HandoverSummary = {
  summary: string;
  changes: HandoverChange[];
  workContext: string;
  openQuestions: HandoverQuestion[];
  suggestedPriority: Priority;
  priorityReason: string;
};

const SUMMARY_SYSTEM = `당신은 팀 간 업무 인수인계를 정리하는 시니어 PM 입니다.

앞 팀이 쓴 문서를 받아서, 뒤를 이어받는 팀이 "읽자마자 뭘 해야 할지 아는" 상태로 만드는 것이 목표입니다.

원칙:
- 원문에 없는 사실을 지어내지 마세요. 모르면 openQuestions 로 넘기세요.
- 요약은 "무엇이 끝났고 / 무엇이 남았고 / 무엇을 조심해야 하는지" 순서로.
- changes 는 앞 팀이 바꿔놓아서 뒤 팀의 전제가 달라지는 것만 담으세요.
  단순 진행 보고는 changes 가 아닙니다. impact 에는 "그래서 받는 쪽이 뭘 다시 확인해야 하는지"를 쓰세요.
- openQuestions 는 원문만 봐서는 판단할 수 없어 되물어야 하는 것. 최대 4개. 없으면 빈 배열.
- 모든 출력은 한국어. 존댓말 없이 간결한 개조식.

반드시 아래 JSON 스키마만 출력하세요. 설명 문장 금지.
{
  "summary": "3~5줄. 줄바꿈은 \\n",
  "changes": [{"type":"added|changed|removed","text":"바뀐 것","impact":"받는 쪽에 미치는 영향"}],
  "workContext": "이 업무가 왜 존재하는지 2~3줄 배경",
  "openQuestions": [{"question":"되물을 것","why":"왜 필요한지"}],
  "suggestedPriority": "URGENT|HIGH|NORMAL|LOW",
  "priorityReason": "왜 그 등급인지 한 줄"
}`;

export async function summarizeHandover(input: {
  title: string;
  rawContent: string;
  rawPriority?: string | null;
  author?: string | null;
}): Promise<HandoverSummary | null> {
  const prompt = [
    `제목: ${input.title}`,
    input.author ? `작성자: ${input.author}` : "",
    input.rawPriority ? `원본 우선순위 표기: ${input.rawPriority}` : "",
    "",
    "--- 원문 시작 ---",
    input.rawContent.slice(0, 40000),
    "--- 원문 끝 ---",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await askJson<HandoverSummary>(SUMMARY_SYSTEM, prompt, 3000);
  if (!result) return null;

  return {
    summary: result.summary ?? "",
    changes: Array.isArray(result.changes) ? result.changes : [],
    workContext: result.workContext ?? "",
    openQuestions: Array.isArray(result.openQuestions) ? result.openQuestions : [],
    suggestedPriority: coercePriority(result.suggestedPriority),
    priorityReason: result.priorityReason ?? "",
  };
}

// ─────────────────────────────────────────────────────────────
// 2) 우선순위 정규화 (규칙 실패시에만)
// ─────────────────────────────────────────────────────────────

function coercePriority(value: unknown): Priority {
  const v = String(value ?? "").toUpperCase();
  if (v === "URGENT" || v === "HIGH" || v === "NORMAL" || v === "LOW") {
    return v as Priority;
  }
  return Priority.NORMAL;
}

const PRIORITY_SYSTEM = `팀마다 우선순위를 부르는 말이 다릅니다.
주어진 표기와 업무 내용을 보고 아래 4단계 중 하나로 정규화하세요.

URGENT(긴급): 지금 안 하면 서비스/고객/일정에 즉시 손해. 장애, 블로커, 마감 임박.
HIGH(높음)  : 이번 스프린트 안에 반드시. 다른 사람이 이걸 기다리고 있음.
NORMAL(보통): 계획된 일반 업무.
LOW(낮음)   : 있으면 좋은 것, 나중에 해도 되는 것.

JSON 만 출력: {"priority":"URGENT|HIGH|NORMAL|LOW","reason":"한 줄 근거"}`;

export async function resolvePriorityWithAI(input: {
  rawPriority?: string | null;
  title: string;
  summary?: string | null;
}): Promise<{ priority: Priority; reason: string }> {
  // 먼저 규칙. 맞으면 AI 안 부른다.
  const ruled = normalizePriority(input.rawPriority);
  if (ruled.matched) return { priority: ruled.priority, reason: ruled.reason };

  const result = await askJson<{ priority: string; reason: string }>(
    PRIORITY_SYSTEM,
    [
      `원본 표기: ${input.rawPriority || "(없음)"}`,
      `제목: ${input.title}`,
      input.summary ? `내용: ${input.summary.slice(0, 2000)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    300,
  );

  if (!result) return { priority: ruled.priority, reason: ruled.reason };
  return { priority: coercePriority(result.priority), reason: result.reason ?? ruled.reason };
}

// ─────────────────────────────────────────────────────────────
// 3) Next Action 초안 생성
// ─────────────────────────────────────────────────────────────

export type DraftAction = {
  title: string;
  description: string;
  assignee: string | null;
  priority: Priority;
  dueHint: string | null;
};

const ACTION_SYSTEM = `당신은 인수인계 문서를 읽고, 이어받는 팀의 할 일 목록을 뽑는 시니어 PM 입니다.

원칙:
- 3~6개. 억지로 늘리지 마세요.
- title 은 동사로 끝나는 한 문장. ("결제 실패 로그 스키마 확인하기")
- 앞 팀이 이미 끝낸 일은 넣지 마세요. 이어받는 팀이 실제로 손을 대야 하는 것만.
- 원문에서 담당자가 특정되면 assignee 에 이름을, 아니면 null.
- dueHint 는 원문에 기한 단서가 있을 때만 ("다음 주 화요일 배포 전"), 없으면 null.
- 한국어, 개조식.

JSON 만 출력:
{"actions":[{"title":"...","description":"왜 필요한지 1~2줄","assignee":null,"priority":"URGENT|HIGH|NORMAL|LOW","dueHint":null}]}`;

export async function generateNextActions(input: {
  title: string;
  summary?: string | null;
  workContext?: string | null;
  rawContent: string;
}): Promise<DraftAction[]> {
  const prompt = [
    `제목: ${input.title}`,
    input.summary ? `요약:\n${input.summary}` : "",
    input.workContext ? `배경:\n${input.workContext}` : "",
    "",
    "--- 원문 ---",
    input.rawContent.slice(0, 20000),
  ]
    .filter(Boolean)
    .join("\n");

  const result = await askJson<{ actions: DraftAction[] }>(ACTION_SYSTEM, prompt, 2000);
  if (!result?.actions || !Array.isArray(result.actions)) return [];

  return result.actions
    .filter((a) => a && typeof a.title === "string" && a.title.trim())
    .slice(0, 8)
    .map((a) => ({
      title: a.title.trim(),
      description: a.description ?? "",
      assignee: a.assignee ?? null,
      priority: coercePriority(a.priority),
      dueHint: a.dueHint ?? null,
    }));
}
