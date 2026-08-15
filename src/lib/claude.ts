import { Priority } from "@prisma/client";
import { askJson } from "@/lib/llm";
import { normalizePriority } from "@/lib/priority";

export { isAiEnabled, currentModel, getProvider } from "@/lib/llm";

/**
 * AI 로직 3종 (백지우)
 *  1) summarizeHandover     : Notion 원문 → 요약 / 변경사항 / 업무맥락 / 추가확인 / 우선순위 제안
 *  2) resolvePriorityWithAI : 규칙으로 못 맞춘 우선순위 표기를 4단계로 정규화
 *  3) generateNextActions   : 인수인계 내용에서 우리 팀이 할 일 초안 뽑기
 *
 * 어느 모델로 보낼지는 lib/llm.ts 가 정한다 (Gemini 무료 티어 / Claude).
 * 이 파일은 "무엇을 시킬지"만 담당한다 — 프롬프트를 고칠 곳은 여기다.
 */

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

앞 팀이 급하게 쓴 문서를 받아, 뒤를 이어받는 팀이 "읽자마자 뭘 해야 할지 아는" 상태로 만듭니다.

## 절대 규칙
- 원문에 없는 사실을 지어내지 마세요.
- 모든 출력은 한국어. 개조식(~함, ~임)으로 간결하게.

## summary (요약)
- 4~5줄. 각 줄 40~70자. 줄바꿈은 \n.
- 순서: (1) 끝난 것 → (2) 안 끝난 것 → (3) 받는 쪽이 조심할 것
- **할 일 목록을 쓰지 마세요.** "~필요", "~해야 함" 을 나열하지 마세요.
  액션 아이템은 별도 기능이 담당합니다. 여기는 "지금 상태"만 씁니다.
- **한 줄에 한 가지만.** 여러 항목을 쉼표나 가운뎃점으로 묶지 마세요.
  줄이 모자라면 덜 중요한 것을 버리세요. 압축해서 다 넣지 마세요.
- 원문이 길수록 요약도 길어져야 합니다. 중요한 문서일수록 짧아지면 안 됩니다.

## changes (변경사항)
- **받는 쪽의 전제가 달라지는 것만.** 최대 5개.
- 아래는 changes 가 아닙니다. 넣지 마세요.
  · 단순 진행 보고 ("배포 완료", "작업 진행 중")
  · 배경 사실 ("약관 발효일이 9/1로 정해짐" — 이건 workContext 입니다)
  · 앞으로 할 일 ("~를 수정해야 함")
- impact 는 "그래서 받는 쪽이 뭘 다시 확인해야 하는지" 를 구체적으로.
  text 를 말만 바꿔 되풀이하면 안 됩니다.

## workContext (업무맥락)
- 2~3줄. 이 일이 왜 생겼는지의 배경. 무엇을 했는지가 아니라 왜 하게 됐는지.

## openQuestions (추가확인)
받는 팀이 **앞 팀에게 되물어야 할 것**입니다. 아래 셋을 모두 만족하는 것만 넣으세요.

1. **원문을 읽어도 답을 알 수 없어야 합니다.**
   원문에 이미 적혀 있으면 절대 넣지 마세요. (예: 원문에 "아직 안 봤음" 이라고 있으면
   "그건 어떻게 됐나요?" 는 질문이 아닙니다. 이미 답이 나와 있습니다.)

2. **두 팀 사이에 아직 안 정해진 것이어야 합니다.**
   넣어야 하는 것:
   · 앞 팀이 "안 정했음", "정해주면 좋겠음", "논의 필요" 라고 명시적으로 남긴 것
     → **이건 최우선입니다. 원문에 이런 문장이 있으면 반드시 질문으로 만드세요.**
   · 기준·소유 팀·작업 순서가 정해지지 않아 시작을 못 하는 것
   · 원문의 서술이 서로 어긋나 어느 쪽이 맞는지 확인해야 하는 것

   빼야 하는 것:
   · **받는 팀이 혼자 결정하고 실행하면 끝나는 일.** 이건 질문이 아니라 할 일입니다.
     (예: "알림 수신자에 우리 팀을 추가할지", "운영팀에 언제 공지할지",
      "정규식을 수정할지" — 전부 물어볼 필요 없이 그냥 하면 되는 것들)
     판단 기준: 앞 팀의 답을 못 받아도 우리가 진행할 수 있으면 질문이 아닙니다.
   · 원문에 이미 상태가 적힌 것 ("~결정되었는가?" 형태가 나오면 대개 여기 해당)

3. **진행 상태를 되묻지 마세요.**
   "~완료되었는가?", "~상태는 무엇인가?" 형태는 쓰지 마세요.
   원문에 안 적혔으면 안 된 것으로 보면 됩니다.

좋은 질문은 대개 이런 것입니다:
- 앞 팀이 명시적으로 "이건 정해줘야 한다" 고 남긴 판단
- 두 팀 사이에 기준·소유·순서가 안 정해진 것
- 원문의 서술이 서로 어긋나서 어느 쪽이 맞는지 물어야 하는 것

최대 3개. 조건에 맞는 게 없으면 **빈 배열**로 두세요. 억지로 채우지 마세요.
why 에는 질문을 되풀이하지 말고, **답을 못 받으면 무엇이 막히는지** 를 쓰세요.

## suggestedPriority
받는 쪽 기준의 시급도. URGENT(지금 안 하면 손해) / HIGH(이번 스프린트 필수) /
NORMAL(계획된 일반 업무) / LOW(나중에 해도 됨).

반드시 아래 JSON 스키마만 출력하세요. 설명 문장 금지.
{
  "summary": "3~4줄. 줄바꿈은 \n",
  "changes": [{"type":"added|changed|removed","text":"바뀐 것","impact":"받는 쪽에 미치는 영향"}],
  "workContext": "2~3줄 배경",
  "openQuestions": [{"question":"앞 팀에게 되물을 것","why":"답을 못 받으면 뭐가 막히는지"}],
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

const ACTION_SYSTEM = `당신은 인수인계 문서를 읽고, 그 일을 **이어받는 팀**의 할 일을 뽑는 시니어 PM 입니다.

가장 중요한 전제: 이 문서를 쓴 사람은 일을 **넘기는 쪽**입니다.
당신이 만드는 목록은 **받는 쪽**이 앞으로 할 일입니다. 두 팀을 헷갈리지 마세요.

## 개수
- 3~6개. 억지로 늘리지 마세요. 정말 없으면 2개여도 됩니다.
- 앞 팀이 이미 끝낸 일은 넣지 마세요. 받는 팀이 실제로 손대야 하는 것만.

## title
- **반드시 "~하기" 로 끝내세요.** 다른 어미를 쓰지 마세요.
  · 맞음: "부분취소 잔액 검증 로직 수정하기", "운영팀에 지연 공지하기"
  · 틀림: "잔액 검증 로직 수정" (명사형), "운영팀에 공지한다" (평서형)
- 목록으로 나란히 놓이므로 어미가 하나라도 다르면 눈에 띕니다.

## description
- 1~2줄. **왜 필요한지**와 **안 하면 뭐가 깨지는지**.
- 문체는 "~한다" 평서체로 통일하세요. 존댓말(~합니다)을 섞지 마세요.

## assignee — 주의해서 읽으세요
- **문서 작성자를 담당자로 넣지 마세요.** 작성자는 이 일을 넘긴 사람이지 할 사람이 아닙니다.
- 원문에 "이건 OO가 한다", "OO한테 넘김" 처럼 **그 일을 맡을 사람이 명시된 경우에만** 이름을 넣으세요.
- 애매하면 반드시 null. **대부분의 경우 null 이 정답입니다.**
- 부서명("법무팀", "프론트팀")을 담당자로 넣지 마세요.

## priority — 액션마다 다르게 매기세요
- 인수인계 문서의 우선순위를 그대로 복사하지 마세요. **액션 하나하나를 따로 판단합니다.**
- URGENT: 지금 안 하면 데이터가 깨지거나 장애가 남
- HIGH  : 다른 작업이 이걸 기다리고 있음
- NORMAL: 계획대로 하면 되는 일
- LOW   : 나중에 해도 되는 정리 작업
- **전부 같은 등급이 나오면 잘못 매긴 것입니다.** 반드시 차등을 두세요.
  긴급한 인수인계라도 그 안의 모든 액션이 긴급하지는 않습니다.
- 다만 **인수인계 자체의 등급이 상한입니다.** 문서가 LOW 인데 그 안의 액션이
  HIGH 로 나오면 모순입니다. 문서가 NORMAL 이면 액션은 NORMAL 이하가 기본입니다.
  (문서 등급을 넘어서야 할 근거가 원문에 명확히 있을 때만 예외)

## dueHint
- 원문에 기한 단서가 있을 때만. ("9월 첫째주", "8/28 배포 전")
- 없으면 null. 지어내지 마세요.

## 이미 질문으로 뺀 것은 넣지 마세요
프롬프트에 "[이미 앞 팀에 질문한 항목]" 이 주어지면, 그와 같은 내용의 액션은 만들지 마세요.
사용자는 그걸 이미 '추가확인' 영역에서 보고 있습니다. 두 번 보여주면 안 됩니다.
단, 질문의 답을 받은 뒤에 해야 하는 **후속 작업**은 액션으로 넣어도 됩니다.
(질문: "대사 기준을 뭘로 할까요?" → 액션: "기준 확정 후 혼재 구간 대사 스크립트 실행하기" 는 가능)

JSON 만 출력하세요. 설명 문장 금지.
{"actions":[{"title":"...","description":"...","assignee":null,"priority":"URGENT|HIGH|NORMAL|LOW","dueHint":null}]}`;

export async function generateNextActions(input: {
  title: string;
  summary?: string | null;
  workContext?: string | null;
  rawContent: string;
  /** 이미 '추가확인'으로 뽑아둔 질문들. 액션과 중복되지 않게 하려고 넘긴다. */
  openQuestions?: Array<{ question: string }> | null;
}): Promise<DraftAction[]> {
  const asked = (input.openQuestions ?? [])
    .map((q) => q?.question)
    .filter(Boolean)
    .map((q) => `- ${q}`)
    .join("\n");

  const prompt = [
    `제목: ${input.title}`,
    input.summary ? `요약:\n${input.summary}` : "",
    input.workContext ? `배경:\n${input.workContext}` : "",
    asked ? `[이미 앞 팀에 질문한 항목 — 액션으로 중복 생성 금지]\n${asked}` : "",
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
