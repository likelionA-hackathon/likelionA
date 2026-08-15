/**
 * LLM 전송 계층 — 공급자를 갈아끼울 수 있게 한 겹 뺐다.
 *
 * 프롬프트와 파싱 로직은 전부 lib/claude.ts 에 있고, 여기는 "어디로 보낼지"만 담당한다.
 * 그래서 무료 티어를 쓰다가 품질이 아쉬우면 .env 한 줄로 바꿔 끼울 수 있다.
 *
 *   OPENAI_API_KEY   → OpenAI 호환 엔드포인트 (BASE_URL 만 바꾸면 어디든)
 *   GEMINI_API_KEY   → Gemini (무료 티어, 카드 등록 불필요)
 *   ANTHROPIC_API_KEY→ Claude
 *   여러 개 있으면 LLM_PROVIDER 로 선택 (openai | gemini | anthropic)
 *
 * SDK 없이 REST 로 직접 부른다. 의존성이 줄고 두 공급자 코드가 대칭이 된다.
 */

export type Provider = "gemini" | "anthropic" | "openai";

const GEMINI_DEFAULT = "gemini-3.5-flash";
const ANTHROPIC_DEFAULT = "claude-haiku-4-5-20251001";
const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-5.6-luna";

export function getProvider(): Provider | null {
  const forced = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

  if (forced === "gemini") return hasGemini ? "gemini" : null;
  if (forced === "anthropic") return hasAnthropic ? "anthropic" : null;
  if (forced === "openai") return hasOpenAI ? "openai" : null;

  if (hasOpenAI) return "openai";
  if (hasGemini) return "gemini";
  if (hasAnthropic) return "anthropic";
  return null;
}

export function isAiEnabled() {
  return getProvider() !== null;
}

/** 인수인계에 기록할 모델 이름. 화면에 "무엇이 요약했는지" 표시용. */
export function currentModel(): string {
  const provider = getProvider();
  if (provider === "gemini") return process.env.GEMINI_MODEL || GEMINI_DEFAULT;
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT;
  if (provider === "openai") return process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
  return "none";
}

// ─────────────────────────────────────────────────────────────
// Gemini
// ─────────────────────────────────────────────────────────────

async function askGemini(system: string, prompt: string, maxTokens: number): Promise<string> {
  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY as string,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // Gemini 는 JSON 모드를 지원한다. Claude 처럼 프리필 트릭을 쓸 필요가 없다.
        responseMimeType: "application/json",
        temperature: 0.2,
        // 3.x 계열은 내부 추론에도 출력 토큰을 쓴다. 넉넉히 준다.
        maxOutputTokens: Math.max(maxTokens * 3, 4096),
      },
    }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const message =
      ((body.error as { message?: string } | undefined)?.message) ?? `Gemini 오류 (${res.status})`;
    throw new Error(`[gemini ${res.status}] ${message}`);
  }

  const blocked = (body.promptFeedback as { blockReason?: string } | undefined)?.blockReason;
  if (blocked) throw new Error(`[gemini] 요청이 차단됨: ${blocked}`);

  const candidate = (body.candidates as Array<Record<string, unknown>> | undefined)?.[0];
  const parts = (candidate?.content as { parts?: Array<{ text?: string }> } | undefined)?.parts;
  const text = parts?.map((p) => p.text ?? "").join("") ?? "";

  if (!text) {
    const finish = candidate?.finishReason ?? "unknown";
    throw new Error(
      `[gemini] 빈 응답 (finishReason=${finish}). MAX_TOKENS 면 maxOutputTokens 를 늘리세요.`,
    );
  }
  return text;
}

// ─────────────────────────────────────────────────────────────
// Anthropic
// ─────────────────────────────────────────────────────────────

async function askAnthropic(system: string, prompt: string, maxTokens: number): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [
        { role: "user", content: prompt },
        // assistant 턴을 "{" 로 프리필하면 모델이 서두를 붙이지 못한다.
        { role: "assistant", content: "{" },
      ],
    }),
    cache: "no-store",
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const message =
      ((body.error as { message?: string } | undefined)?.message) ?? `Claude 오류 (${res.status})`;
    throw new Error(`[anthropic ${res.status}] ${message}`);
  }

  const content = body.content as Array<{ type: string; text?: string }> | undefined;
  const text = content?.find((c) => c.type === "text")?.text ?? "";
  // 프리필한 "{" 를 다시 붙여서 완전한 JSON 으로 만든다.
  return "{" + text;
}

// ─────────────────────────────────────────────────────────────
// OpenAI 호환 (/v1/chat/completions)
//
// 이 한 갈래로 대부분의 공급자를 커버한다:
//   OpenAI · Upstage Solar · Groq · Together · OpenRouter · FriendliAI
//   DeepSeek · xAI · Cerebras · Fireworks · 로컬 Ollama/vLLM
// OPENAI_BASE_URL 만 바꾸면 된다. 해커톤 크레딧을 받았다면 대개 여기에 붙는다.
// ─────────────────────────────────────────────────────────────

/**
 * 공급자마다 받는 파라미터가 다르다. 특히 OpenAI GPT-5 계열은
 *   - max_tokens 대신 max_completion_tokens 를 요구하고
 *   - temperature 를 기본값(1) 외로 주면 거부한다
 * 반면 Groq/Together 같은 곳은 예전 방식만 받는다.
 *
 * 그래서 처음 한 번은 거부당하면서 규칙을 학습하고, 그 뒤로는 그대로 쓴다.
 */
type Caps = {
  jsonMode: boolean;
  maxCompletionTokens: boolean;
  temperature: boolean;
};

const capsCache = new Map<string, Caps>();

async function askOpenAICompatible(
  system: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const base = (process.env.OPENAI_BASE_URL || OPENAI_DEFAULT_BASE).replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
  const cacheKey = `${base}::${model}`;

  const caps: Caps =
    capsCache.get(cacheKey) ??
    // GPT-5 계열은 새 규칙이 기본. 나머지는 예전 규칙으로 시작.
    (/^(gpt-5|o[1-9])/.test(model)
      ? { jsonMode: true, maxCompletionTokens: true, temperature: false }
      : { jsonMode: true, maxCompletionTokens: false, temperature: true });

  for (let attempt = 0; attempt < 4; attempt++) {
    const payload: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    };
    if (caps.maxCompletionTokens) payload.max_completion_tokens = Math.max(maxTokens * 3, 4096);
    else payload.max_tokens = maxTokens;
    if (caps.temperature) payload.temperature = 0.2;
    if (caps.jsonMode) payload.response_format = { type: "json_object" };

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.ok) {
      capsCache.set(cacheKey, caps);
      const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
      const text = choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("[openai-compat] 빈 응답");
      return text;
    }

    const message =
      ((body.error as { message?: string } | undefined)?.message) ?? `오류 ${res.status}`;

    // 거부 사유를 보고 규칙을 하나 고쳐서 재시도
    let adjusted = false;
    if (/max_completion_tokens/i.test(message) && !caps.maxCompletionTokens) {
      caps.maxCompletionTokens = true;
      adjusted = true;
    } else if (/max_tokens/i.test(message) && caps.maxCompletionTokens) {
      caps.maxCompletionTokens = false;
      adjusted = true;
    } else if (/temperature/i.test(message) && caps.temperature) {
      caps.temperature = false;
      adjusted = true;
    } else if (/response_format|json_object/i.test(message) && caps.jsonMode) {
      caps.jsonMode = false;
      adjusted = true;
    }

    if (!adjusted) throw new Error(`[openai-compat ${res.status}] ${message}`);
    console.warn(`[llm] 파라미터 조정 후 재시도: ${message.slice(0, 120)}`);
  }

  throw new Error("[openai-compat] 파라미터를 맞추지 못했습니다.");
}

// ─────────────────────────────────────────────────────────────
// 공통
// ─────────────────────────────────────────────────────────────

/** JSON 하나를 받아온다. 실패하면 null (호출부가 AI 없이도 굴러가게). */
export async function askJson<T>(
  system: string,
  prompt: string,
  maxTokens = 2000,
): Promise<T | null> {
  const provider = getProvider();
  if (!provider) return null;

  let raw: string;
  try {
    raw =
      provider === "gemini"
        ? await askGemini(system, prompt, maxTokens)
        : provider === "openai"
          ? await askOpenAICompatible(system, prompt, maxTokens)
          : await askAnthropic(system, prompt, maxTokens);
  } catch (e) {
    console.error("[llm] 호출 실패:", e instanceof Error ? e.message : e);
    return null;
  }

  const text = raw.trim();

  try {
    return JSON.parse(text) as T;
  } catch {
    // 모델이 앞뒤로 사족을 붙인 경우: 첫 { 부터 마지막 } 까지만 잘라 재시도
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        /* fallthrough */
      }
    }
    console.error("[llm] JSON 파싱 실패:", text.slice(0, 400));
    return null;
  }
}
