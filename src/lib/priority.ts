import { Priority } from "@prisma/client";

/**
 * 우선순위 정규화.
 *
 * 팀마다 우선순위를 부르는 말이 다르다. Jira 는 Critical/Blocker, Notion 은 P0/높음,
 * 슬랙에선 그냥 "asap 🔥". 화면에서는 이걸 4단계 배지 하나로 통일해서 보여준다.
 *
 * 규칙 기반으로 먼저 때리고(빠르고 공짜), 못 맞추면 AI 로 넘긴다(lib/claude.ts).
 */

export const PRIORITY_LABEL_KO: Record<Priority, string> = {
  URGENT: "긴급",
  HIGH: "높음",
  NORMAL: "보통",
  LOW: "낮음",
};

/** 화면 배지용 색상 토큰. 프론트에서 그대로 클래스에 매핑해서 쓰세요. */
export const PRIORITY_TONE: Record<Priority, "red" | "orange" | "slate" | "gray"> = {
  URGENT: "red",
  HIGH: "orange",
  NORMAL: "slate",
  LOW: "gray",
};

export const PRIORITY_RANK: Record<Priority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

const RULES: Array<{ priority: Priority; patterns: RegExp[] }> = [
  {
    priority: Priority.URGENT,
    patterns: [
      /\bp0\b/i,
      /\bsev-?[01]\b/i,
      /critical/i,
      /blocker/i,
      /urgent/i,
      /highest/i,
      /immediate/i,
      /asap/i,
      /긴급/,
      /최우선/,
      /즉시/,
      /장애/,
      /🔥|🚨/u,
    ],
  },
  {
    priority: Priority.HIGH,
    patterns: [/\bp1\b/i, /\bsev-?2\b/i, /\bhigh\b/i, /major/i, /important/i, /높음/, /중요/, /우선/, /⚠️/u],
  },
  {
    priority: Priority.NORMAL,
    patterns: [/\bp2\b/i, /medium/i, /\bnormal\b/i, /moderate/i, /보통/, /중간/, /일반/],
  },
  {
    priority: Priority.LOW,
    patterns: [/\bp3\b/i, /\bp4\b/i, /\blow\b/i, /lowest/i, /minor/i, /trivial/i, /nice.?to.?have/i, /backlog/i, /낮음/, /나중/, /여유/],
  },
];

export type PriorityResolution = {
  priority: Priority;
  reason: string;
  /** 규칙으로 맞췄는지, AI 가 필요한지 */
  matched: boolean;
};

/** 규칙 기반 1차 정규화. 못 맞추면 matched:false 로 돌려준다. */
export function normalizePriority(raw: string | null | undefined): PriorityResolution {
  const text = (raw ?? "").trim();
  if (!text) {
    return { priority: Priority.NORMAL, reason: "우선순위 표기가 없어 기본값(보통)", matched: false };
  }

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        return {
          priority: rule.priority,
          reason: `원본 표기 "${text}" → ${PRIORITY_LABEL_KO[rule.priority]}`,
          matched: true,
        };
      }
    }
  }

  return {
    priority: Priority.NORMAL,
    reason: `"${text}" 는 알려진 표기가 아니어서 AI 판단 필요`,
    matched: false,
  };
}

export function sortByPriority<T extends { priority: Priority }>(items: T[]): T[] {
  return [...items].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}
