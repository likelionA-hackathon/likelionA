import type {
  BoardItem,
  Connection,
  HandoverItem,
  Link,
  NextAction,
  Priority,
  Request as RequestModel,
  Workspace,
} from "@prisma/client";
import { PRIORITY_LABEL_KO, PRIORITY_RANK, PRIORITY_TONE } from "@/lib/priority";
import type {
  BoardItemDTO,
  ConnectionDTO,
  HandoverChangeDTO,
  HandoverDetailDTO,
  HandoverListItemDTO,
  JiraPreviewPayload,
  NextActionDTO,
  PriorityBadge,
  RequestDTO,
} from "@/types/api";

/**
 * Prisma 모델 → 프론트가 바로 그릴 수 있는 DTO.
 * 라벨/색/정렬키까지 서버에서 붙여 보낸다. 화면 3개에서 각자 매핑 테이블 만들다 어긋나는 걸 막으려고.
 */

const PROVIDER_LABEL: Record<string, string> = {
  NOTION: "Notion",
  JIRA: "Jira",
  SLACK: "Slack",
};

const CONNECTION_STATUS_LABEL: Record<string, string> = {
  CONNECTED: "연결됨",
  DISCONNECTED: "연결 안 됨",
  ERROR: "오류",
  MOCK: "데모 데이터",
};

const HANDOVER_STATUS_LABEL: Record<string, string> = {
  NEW: "확인 전",
  ACKNOWLEDGED: "확인함",
  ARCHIVED: "보관됨",
};

const ACTION_STATUS_LABEL: Record<string, string> = {
  TODO: "예정",
  DOING: "진행중",
  DONE: "완료",
};

const BOARD_STATUS_LABEL: Record<string, string> = {
  DRAFT: "미리보기",
  SHARED: "전달함",
  ACCEPTED: "수락됨",
  DECLINED: "반려됨",
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  OPEN: "답변 대기",
  ANSWERED: "답변 완료",
  CLOSED: "종료",
};

const CHANGE_TYPE_LABEL: Record<string, string> = {
  added: "추가됨",
  changed: "변경됨",
  removed: "제거됨",
};

export function priorityBadge(
  code: Priority,
  raw?: string | null,
  reason?: string | null,
): PriorityBadge {
  return {
    code,
    label: PRIORITY_LABEL_KO[code],
    tone: PRIORITY_TONE[code],
    rank: PRIORITY_RANK[code],
    raw: raw ?? null,
    reason: reason ?? null,
  };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toConnectionDTO(c: Connection): ConnectionDTO {
  return {
    id: c.id,
    provider: c.provider,
    providerLabel: PROVIDER_LABEL[c.provider] ?? c.provider,
    status: c.status,
    statusLabel: CONNECTION_STATUS_LABEL[c.status] ?? c.status,
    displayName: c.displayName,
    lastSyncedAt: iso(c.lastSyncedAt),
    lastError: c.lastError,
    isMock: c.status === "MOCK",
  };
}

type HandoverWithRelations = HandoverItem & {
  link?: (Link & { workspaceA?: Workspace | null; workspaceB?: Workspace | null }) | null;
  _count?: { nextActions?: number };
};

/** 인수인계가 "어느 팀에서 왔는지" — 우리 워크스페이스 기준 반대편. */
function resolveFrom(item: HandoverWithRelations, myWorkspaceId: string) {
  const link = item.link;
  if (!link) return null;
  const other =
    link.workspaceAId === myWorkspaceId ? link.workspaceB : link.workspaceA;
  return other ? { id: other.id, name: other.name } : null;
}

function parseChanges(value: unknown): HandoverChangeDTO[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .map((c) => {
      const type = String(c.type ?? "changed") as HandoverChangeDTO["type"];
      return {
        type,
        typeLabel: CHANGE_TYPE_LABEL[type] ?? "변경됨",
        text: String(c.text ?? ""),
        impact: String(c.impact ?? ""),
      };
    })
    .filter((c) => c.text);
}

function parseQuestions(value: unknown): Array<{ question: string; why: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((q): q is Record<string, unknown> => Boolean(q) && typeof q === "object")
    .map((q) => ({ question: String(q.question ?? ""), why: String(q.why ?? "") }))
    .filter((q) => q.question);
}

export function toHandoverListDTO(
  item: HandoverWithRelations,
  myWorkspaceId: string,
): HandoverListItemDTO {
  return {
    id: item.id,
    title: item.title,
    author: item.author,
    summary: item.summary,
    priority: priorityBadge(item.priority, item.rawPriority, item.priorityReason),
    status: item.status,
    statusLabel: HANDOVER_STATUS_LABEL[item.status] ?? item.status,
    source: {
      provider: PROVIDER_LABEL[item.sourceProvider] ?? item.sourceProvider,
      url: item.sourceUrl,
    },
    from: resolveFrom(item, myWorkspaceId),
    changeCount: parseChanges(item.changes).length,
    openQuestionCount: parseQuestions(item.openQuestions).length,
    nextActionCount: item._count?.nextActions ?? 0,
    occurredAt: item.occurredAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toHandoverDetailDTO(
  item: HandoverWithRelations & {
    nextActions?: NextAction[];
    acknowledgedBy?: { id: string; name: string | null } | null;
    requests?: RequestModel[];
  },
  myWorkspaceId: string,
): HandoverDetailDTO {
  const questions = parseQuestions(item.openQuestions);
  const requests = item.requests ?? [];

  return {
    ...toHandoverListDTO(item, myWorkspaceId),
    nextActionCount: item.nextActions?.length ?? item._count?.nextActions ?? 0,
    workContext: item.workContext,
    changes: parseChanges(item.changes),
    openQuestions: questions.map((q) => {
      const matched = requests.find((r) => r.question.trim() === q.question.trim());
      return {
        ...q,
        requested: Boolean(matched),
        requestId: matched?.id ?? null,
      };
    }),
    rawContent: item.rawContent,
    ai: item.aiModel ? { model: item.aiModel, generatedAt: iso(item.aiGeneratedAt) } : null,
    acknowledgedAt: iso(item.acknowledgedAt),
    acknowledgedBy: item.acknowledgedBy ?? null,
    nextActions: (item.nextActions ?? []).map((a) => toNextActionDTO(a)),
  };
}

export function toNextActionDTO(
  action: NextAction & { handoverItem?: { id: string; title: string } | null },
): NextActionDTO {
  return {
    id: action.id,
    title: action.title,
    description: action.description,
    assignee: action.assignee,
    status: action.status,
    statusLabel: ACTION_STATUS_LABEL[action.status] ?? action.status,
    priority: priorityBadge(action.priority),
    dueDate: iso(action.dueDate),
    origin: action.origin,
    aiDraft: action.aiDraft,
    handover: action.handoverItem
      ? { id: action.handoverItem.id, title: action.handoverItem.title }
      : null,
    createdAt: action.createdAt.toISOString(),
  };
}

export function toBoardItemDTO(
  item: BoardItem & { fromWorkspace: Workspace; toWorkspace: Workspace },
  myWorkspaceId: string,
): BoardItemDTO {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    priority: priorityBadge(item.priority),
    status: item.status,
    statusLabel: BOARD_STATUS_LABEL[item.status] ?? item.status,
    direction: item.fromWorkspaceId === myWorkspaceId ? "OUTGOING" : "INCOMING",
    from: { id: item.fromWorkspace.id, name: item.fromWorkspace.name },
    to: { id: item.toWorkspace.id, name: item.toWorkspace.name },
    targetSystem: PROVIDER_LABEL[item.targetSystem] ?? item.targetSystem,
    targetPayload: (item.targetPayload as JiraPreviewPayload | null) ?? null,
    sharedAt: iso(item.sharedAt),
    createdAt: item.createdAt.toISOString(),
  };
}

export function toRequestDTO(
  item: RequestModel & {
    fromWorkspace: Workspace;
    toWorkspace: Workspace;
    handoverItem?: { id: string; title: string } | null;
  },
  myWorkspaceId: string,
): RequestDTO {
  return {
    id: item.id,
    question: item.question,
    answer: item.answer,
    status: item.status,
    statusLabel: REQUEST_STATUS_LABEL[item.status] ?? item.status,
    direction: item.fromWorkspaceId === myWorkspaceId ? "OUTGOING" : "INCOMING",
    from: { id: item.fromWorkspace.id, name: item.fromWorkspace.name },
    to: { id: item.toWorkspace.id, name: item.toWorkspace.name },
    handover: item.handoverItem
      ? { id: item.handoverItem.id, title: item.handoverItem.title }
      : null,
    boardItemId: item.boardItemId,
    createdAt: item.createdAt.toISOString(),
    answeredAt: iso(item.answeredAt),
  };
}

/** NextAction → Jira 이슈 미리보기 payload (실제 write 없음). */
export function buildJiraPreview(input: {
  projectKey: string;
  title: string;
  body?: string | null;
  priority: Priority;
  assignee?: string | null;
  handoverTitle?: string | null;
}): JiraPreviewPayload {
  const JIRA_PRIORITY: Record<Priority, string> = {
    URGENT: "Highest",
    HIGH: "High",
    NORMAL: "Medium",
    LOW: "Low",
  };

  const description = [
    input.body ?? "",
    input.handoverTitle ? `\n---\n출처 인수인계: ${input.handoverTitle}` : "",
    "\n(Baton 에서 전달됨)",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    project: input.projectKey,
    issueType: "Task",
    summary: input.title,
    description,
    priority: JIRA_PRIORITY[input.priority],
    labels: ["baton", "handover"],
    assignee: input.assignee ?? null,
  };
}
