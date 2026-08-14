/**
 * 프론트가 import 해서 쓰는 응답 타입.
 * 전철우/김건희: 화면에서 `import type { HandoverDetailDTO } from "@/types/api"` 하시면 됩니다.
 * 이 파일과 docs/API.md 가 서로 어긋나면 이 파일이 정답입니다.
 */

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export type PriorityCode = "URGENT" | "HIGH" | "NORMAL" | "LOW";

/** 배지 하나 그리는 데 필요한 것 전부. 프론트에서 매핑 테이블 만들 필요 없음. */
export type PriorityBadge = {
  code: PriorityCode;
  /** "긴급" | "높음" | "보통" | "낮음" */
  label: string;
  /** "red" | "orange" | "slate" | "gray" */
  tone: "red" | "orange" | "slate" | "gray";
  /** 정렬용. 0 이 가장 급함 */
  rank: number;
  /** 원본에 적혀 있던 표기 ("Critical", "P0") — 툴팁용 */
  raw: string | null;
  /** AI/규칙이 왜 이렇게 매겼는지 — 툴팁용 */
  reason: string | null;
};

export type WorkspaceDTO = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  role: "OWNER" | "MEMBER";
  memberCount: number;
};

export type PartnerDTO = {
  linkId: string;
  status: "PENDING" | "ACTIVE" | "REVOKED";
  inviteCode: string | null;
  partner: { id: string; name: string; slug: string; tagline: string | null } | null;
};

export type ConnectionDTO = {
  id: string;
  provider: "NOTION" | "JIRA" | "SLACK";
  /** "Notion" | "Jira" | "Slack" */
  providerLabel: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | "MOCK";
  statusLabel: string;
  displayName: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** true 면 화면에서 "데모" 뱃지 붙여주세요 (Jira) */
  isMock: boolean;
};

export type HandoverListItemDTO = {
  id: string;
  title: string;
  author: string | null;
  summary: string | null;
  priority: PriorityBadge;
  status: "NEW" | "ACKNOWLEDGED" | "ARCHIVED";
  statusLabel: string;
  source: { provider: string; url: string | null };
  from: { id: string; name: string } | null;
  changeCount: number;
  openQuestionCount: number;
  nextActionCount: number;
  occurredAt: string;
  updatedAt: string;
};

export type HandoverChangeDTO = {
  type: "added" | "changed" | "removed";
  typeLabel: string;
  text: string;
  impact: string;
};

export type HandoverQuestionDTO = {
  question: string;
  why: string;
  /** 이미 정보요청으로 보낸 질문인지 */
  requested: boolean;
  requestId: string | null;
};

export type HandoverDetailDTO = HandoverListItemDTO & {
  workContext: string | null;
  changes: HandoverChangeDTO[];
  openQuestions: HandoverQuestionDTO[];
  rawContent: string;
  ai: { model: string | null; generatedAt: string | null } | null;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string | null } | null;
  nextActions: NextActionDTO[];
};

export type NextActionDTO = {
  id: string;
  title: string;
  description: string | null;
  assignee: string | null;
  status: "TODO" | "DOING" | "DONE";
  statusLabel: string;
  priority: PriorityBadge;
  dueDate: string | null;
  origin: "AI" | "MANUAL";
  aiDraft: boolean;
  handover: { id: string; title: string } | null;
  createdAt: string;
};

export type BoardItemDTO = {
  id: string;
  title: string;
  body: string | null;
  priority: PriorityBadge;
  status: "DRAFT" | "SHARED" | "ACCEPTED" | "DECLINED";
  statusLabel: string;
  direction: "OUTGOING" | "INCOMING";
  from: { id: string; name: string };
  to: { id: string; name: string };
  targetSystem: string;
  targetPayload: JiraPreviewPayload | null;
  sharedAt: string | null;
  createdAt: string;
};

/** 실제 Jira write 는 안 합니다. 이 payload 를 미리보기 패널에 그대로 그리면 됩니다. */
export type JiraPreviewPayload = {
  project: string;
  issueType: string;
  summary: string;
  description: string;
  priority: string;
  labels: string[];
  assignee: string | null;
};

export type RequestDTO = {
  id: string;
  question: string;
  answer: string | null;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  statusLabel: string;
  direction: "OUTGOING" | "INCOMING";
  from: { id: string; name: string };
  to: { id: string; name: string };
  handover: { id: string; title: string } | null;
  boardItemId: string | null;
  createdAt: string;
  answeredAt: string | null;
};

export type DashboardDTO = {
  workspace: WorkspaceDTO;
  partner: PartnerDTO | null;
  /** 상단 4개 통계 카드 */
  stats: {
    newHandovers: number;
    urgentHandovers: number;
    openActions: number;
    openRequests: number;
  };
  /** 알림 배지 — 0 이면 안 그림 */
  badges: {
    incomingRequests: number;
    unreadHandovers: number;
    incomingBoardItems: number;
  };
  recentHandovers: HandoverListItemDTO[];
  todayActions: NextActionDTO[];
  connections: ConnectionDTO[];
};

export type SyncResultDTO = {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  aiUsed: boolean;
  items: HandoverListItemDTO[];
  warnings: string[];
};
