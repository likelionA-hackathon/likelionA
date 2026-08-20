/**
 * 프론트에서 백엔드를 부를 때 쓰는 클라이언트. (전철우 · 김건희용)
 *
 * 왜 있냐면: 각자 fetch 를 감싸면 에러 처리가 제각각이 되고 합칠 때 어긋납니다.
 * 여기 하나로 통일하고, 화면에서는 결과만 받아 쓰세요.
 *
 * 쓰는 법
 * ────────────────────────────────────────────────
 *   import { api, ApiError } from "@/lib/api-client";
 *
 *   const { workspaces } = await api.me();
 *   const dash = await api.dashboard(workspaces[0].id);
 *   dash.stats.newHandovers   // 타입 다 붙어 있습니다
 *
 * 에러는 throw 됩니다. try/catch 로 잡으세요.
 *
 *   try {
 *     await api.notionSync(wsId);
 *   } catch (e) {
 *     if (e instanceof ApiError && e.code === "NOTION_NOT_CONNECTED") {
 *       setMessage("Notion 연결이 먼저 필요합니다");
 *     }
 *   }
 *
 * 다른 팀 시점으로 보고 싶을 때 (로그인 붙기 전까지만 동작):
 *   setDevUser("cheolwoo@baton.dev");
 */

import type {
  ApiResponse,
  BoardItemDTO,
  ConnectionDTO,
  DashboardDTO,
  HandoverDetailDTO,
  HandoverListItemDTO,
  NextActionDTO,
  PartnerDTO,
  PlanCode,
  RequestDTO,
  ShareScopes,
  SyncResultDTO,
  WorkspaceDTO,
} from "@/types/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * 서버 컴포넌트에서 부를 땐 절대 경로가 필요합니다.
 * 브라우저에서는 상대 경로로 충분합니다.
 *
 * Vercel 에 올리면 VERCEL_URL 이 자동으로 들어옵니다.
 * 이게 없으면 배포 후 서버 컴포넌트가 localhost:3000 을 부르다 전부 실패합니다.
 */
function resolveBase() {
  if (typeof window !== "undefined") return "";
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const BASE = resolveBase();

let devUser: string | null = null;
/** 로그인 붙기 전, 다른 팀 시점으로 API 를 보고 싶을 때. */
export function setDevUser(email: string | null) {
  devUser = email;
}

function qs(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(devUser ? { "x-baton-user": devUser } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "서버에 연결할 수 없습니다. npm run dev 가 켜져 있는지 확인하세요.");
  }

  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(res.status, "BAD_RESPONSE", "서버 응답을 읽을 수 없습니다.");
  }

  if (!json || json.ok !== true) {
    const err = json && json.ok === false ? json.error : undefined;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? "알 수 없는 오류가 발생했습니다.",
      err?.details,
    );
  }
  return json.data;
}

const get = <T>(p: string) => request<T>("GET", p);
const post = <T>(p: string, b?: unknown) => request<T>("POST", p, b);
const patch = <T>(p: string, b?: unknown) => request<T>("PATCH", p, b);
const del = <T>(p: string) => request<T>("DELETE", p);

type Priority = "URGENT" | "HIGH" | "NORMAL" | "LOW";

export const api = {
  //온보딩
  /** 로그인 직후 호출. workspaces 가 비면 팀 생성 화면으로 보내세요. */
  me: () => get<{ user: { id: string; email: string; name: string | null; image: string | null }; workspaces: WorkspaceDTO[] }>("/api/me"),

  createWorkspace: (body: { name: string; tagline?: string; timezone?: string; plan?: PlanCode }) =>
    post<WorkspaceDTO>("/api/workspaces", body),

  /** 팀 설정 한 건 (타임존·요금제·공유 범위 포함) */
  workspace: (workspaceId: string) => get<WorkspaceDTO>(`/api/workspaces/${workspaceId}`),

  /** 팀 설정 변경. 보낸 필드만 바뀝니다. */
  updateWorkspace: (
    workspaceId: string,
    body: {
      name?: string;
      tagline?: string | null;
      timezone?: string;
      plan?: PlanCode;
      shareScopes?: ShareScopes;
    },
  ) => patch<WorkspaceDTO>(`/api/workspaces/${workspaceId}`, body),

  //파트너 연결
  getLink: (workspaceId: string) => get<PartnerDTO | null>(`/api/workspaces/${workspaceId}/link`),
  /** 초대 코드 발급. 링크는 `${location.origin}/invite/${inviteCode}` 로 조립하세요. */
  createInvite: (workspaceId: string) => post<PartnerDTO>(`/api/workspaces/${workspaceId}/link`),
  acceptInvite: (body: { inviteCode: string; workspaceId: string }) =>
    post<PartnerDTO>("/api/links/accept", body),

  // 대시보드
  dashboard: (workspaceId: string) => get<DashboardDTO>(`/api/workspaces/${workspaceId}/dashboard`),

  //연결 관리
  connections: (workspaceId: string) => get<ConnectionDTO[]>(`/api/workspaces/${workspaceId}/connections`),
  saveConnection: (
    workspaceId: string,
    body:
      | { provider: "NOTION"; token: string; databaseId: string }
      | { provider: "JIRA"; site: string; projectKey: string },
  ) => post<ConnectionDTO>(`/api/workspaces/${workspaceId}/connections`, body),
  /** 로딩 표시 필요 */
  notionSync: (workspaceId: string, body?: { limit?: number; target?: "partner" | "self"; force?: boolean }) =>
    post<SyncResultDTO>(`/api/workspaces/${workspaceId}/notion/sync`, body ?? {}),

  //인수인계
  handovers: (
    workspaceId: string,
    query?: { status?: string; priority?: string; q?: string; take?: number },
  ) => get<HandoverListItemDTO[]>(`/api/workspaces/${workspaceId}/handovers${qs(query)}`),

  /** 상세 화면은 이 호출 하나면 끝납니다. */
  handover: (handoverId: string) => get<HandoverDetailDTO>(`/api/handovers/${handoverId}`),

  /** "확인" 버튼. 응답이 상세와 같은 모양이라 그대로 상태에 넣으면 됩니다. */
  acknowledge: (handoverId: string) => post<HandoverDetailDTO>(`/api/handovers/${handoverId}/acknowledge`),

  /** AI 로 다음 업무 초안 생성. aiDraft=true 인 항목엔 "AI 초안" 뱃지를. */
  generateActions: (handoverId: string) =>
    post<NextActionDTO[]>(`/api/handovers/${handoverId}/actions/generate`),

  // 다음 업무
  actions: (
    workspaceId: string,
    query?: { status?: string; priority?: string; assignee?: string; handoverId?: string; q?: string },
  ) => get<NextActionDTO[]>(`/api/workspaces/${workspaceId}/next-actions${qs(query)}`),

  createAction: (
    workspaceId: string,
    body: {
      title: string;
      description?: string;
      assignee?: string;
      priority?: Priority;
      status?: "TODO" | "DOING" | "DONE";
      dueDate?: string;
      handoverItemId?: string;
    },
  ) => post<NextActionDTO>(`/api/workspaces/${workspaceId}/next-actions`, body),

  /** 상태 토글·담당자 변경·제목 수정 전부 여기로. 보낸 필드만 바뀝니다. */
  updateAction: (
    actionId: string,
    body: Partial<{
      title: string;
      description: string | null;
      assignee: string | null;
      priority: Priority;
      status: "TODO" | "DOING" | "DONE";
      dueDate: string | null;
    }>,
  ) => patch<NextActionDTO>(`/api/next-actions/${actionId}`, body),

  deleteAction: (actionId: string) => del<{ deleted: boolean }>(`/api/next-actions/${actionId}`),

  // 공유보드
  board: (workspaceId: string, query?: { direction?: "OUTGOING" | "INCOMING" }) =>
    get<BoardItemDTO[]>(`/api/workspaces/${workspaceId}/board${qs(query)}`),

  /**
   * 1) 업무 선택 → share:false 로 DRAFT 생성 → targetPayload 를 미리보기 패널에 렌더
   * 2) "전달" 클릭 → updateBoardStatus(id, "SHARED")
   */
  createBoardItems: (
    workspaceId: string,
    body:
      | { nextActionIds: string[]; share?: boolean }
      | { title: string; body?: string; priority?: Priority; share?: boolean },
  ) => post<BoardItemDTO[]>(`/api/workspaces/${workspaceId}/board`, body),

  updateBoardStatus: (boardItemId: string, status: "DRAFT" | "SHARED" | "ACCEPTED" | "DECLINED") =>
    patch<{ item: BoardItemDTO; copiedAction: NextActionDTO | null }>(`/api/board/${boardItemId}`, { status }),

  // 정보요청
  requests: (
    workspaceId: string,
    query?: { direction?: "OUTGOING" | "INCOMING"; status?: string },
  ) => get<RequestDTO[]>(`/api/workspaces/${workspaceId}/requests${qs(query)}`),

  /** 인수인계 상세의 "추가확인" 옆 [요청] 버튼. 같은 질문 재전송은 중복을 안 만듭니다. */
  createRequest: (workspaceId: string, body: { question: string; handoverItemId?: string; boardItemId?: string }) =>
    post<RequestDTO>(`/api/workspaces/${workspaceId}/requests`, body),

  answerRequest: (requestId: string, answer: string) =>
    post<RequestDTO>(`/api/requests/${requestId}/answer`, { answer }),
};
