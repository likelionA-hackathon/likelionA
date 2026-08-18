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
  label: string;
  tone: "red" | "orange" | "slate" | "gray";
  /** 정렬용. 0 이 가장 급함 */
  rank: number;
  raw: string | null;
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

//이미 요청 보낸 건지
export type HandoverQuestionDTO = {
  question: string;
  why: string;
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

/**
 * "Jira 로 보낸다면 이렇게 보낸다" 미리보기.
 * 실제 write 는 하지 않지만, **Jira Cloud REST API v3 가 그대로 받는 형식**입니다.
 * (description 이 ADF(Atlassian Document Format) 중첩 JSON 인 것까지 실제와 동일)
 *
 * 김건희: 미리보기 패널을 이렇게 그리면 설득력이 큽니다.
 *   상단  → `${method} ${url}`  을 모노스페이스로
 *   좌측  → display 를 표로 (사람이 읽는 요약)
 *   우측  → body 를 JSON.stringify(body, null, 2) 로 코드블록
 */
export type JiraPreviewPayload = {
  method: "POST";
  /** 예: https://pmconnector.atlassian.net/rest/api/3/issue */
  url: string;
  /** 실제 요청 본문. 그대로 복사해서 curl 로 쏘면 이슈가 생성됩니다. */
  body: {
    fields: {
      project: { key: string };
      issuetype: { name: string };
      summary: string;
      description: AdfDocument;
      priority: { name: string };
      labels: string[];
      assignee: { accountId: string } | null;
    };
  };
  /** 표로 뿌릴 때 쓰는 사람용 요약. ADF 를 파싱할 필요가 없게 하려고 같이 내려줍니다. */
  display: {
    project: string;
    issueType: string;
    summary: string;
    description: string;
    priority: string;
    labels: string[];
    assignee: string | null;
  };
};

/** Atlassian Document Format. Jira v3 는 description 을 평문으로 안 받습니다. */
export type AdfDocument = {
  type: "doc";
  version: 1;
  content: Array<{
    type: "paragraph";
    content: Array<{ type: "text"; text: string }>;
  }>;
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
