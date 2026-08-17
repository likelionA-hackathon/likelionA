# Baton API v1

담당: 백지우 · 최종 수정 2026-08-14

프론트는 이 문서와 `src/types/api.ts` 만 보면 됩니다.
엔드포인트 전체 레퍼런스는 [`API-SPEC.md`](API-SPEC.md) 를 보세요.
**둘이 어긋나면 `src/types/api.ts` 가 정답**입니다 (거기서 타입을 import 해서 쓰세요).

---

## 0. 공통 규칙

모든 응답은 두 모양 중 하나입니다.

```jsonc
// 성공
{ "ok": true, "data": ... }

// 실패
{ "ok": false, "error": { "code": "NOT_A_MEMBER", "message": "이 워크스페이스의 멤버가 아닙니다." } }
```

### fetch 를 직접 쓰지 마세요

`src/lib/api-client.ts` 에 다 만들어뒀습니다. 타입까지 붙어 있습니다.

```ts
import { api, ApiError } from "@/lib/api-client";

// 대시보드
const { workspaces } = await api.me();
const dash = await api.dashboard(workspaces[0].id);
dash.stats.newHandovers;              // number
dash.recentHandovers[0].priority.label; // "긴급"

// 인수인계 상세 + 확인 버튼
const detail = await api.handover(handoverId);
const updated = await api.acknowledge(handoverId);  // 응답 모양이 같아서 그대로 교체

// 다음 업무 상태 토글
await api.updateAction(actionId, { status: "DONE" });

// 공유보드: 미리보기 → 전달
const [draft] = await api.createBoardItems(wsId, { nextActionIds: [id] });
draft.targetPayload;                  // Jira 미리보기 JSON
await api.updateBoardStatus(draft.id, "SHARED");
```

에러는 `throw` 됩니다. 코드로 분기하세요.

```ts
try {
  await api.notionSync(wsId);
} catch (e) {
  if (e instanceof ApiError && e.code === "NOTION_NOT_CONNECTED") {
    setMessage("Notion 연결이 먼저 필요합니다");
  } else if (e instanceof ApiError) {
    setMessage(e.message);   // 사람이 읽을 한국어 메시지가 들어 있습니다
  }
}
```

다른 팀 시점으로 보고 싶으면 (로그인 붙기 전까지만):

```ts
import { setDevUser } from "@/lib/api-client";
setDevUser("cheolwoo@baton.dev");   // 페이팀 시점
```

### 로그인 전에 개발하는 법 (중요)

`.env` 에 `DEV_AUTH_BYPASS="true"` 가 켜져 있으면 로그인 없이 API 를 부를 수 있습니다.
누구로 부를지는 헤더로 정합니다.

```
x-baton-user: jiwoo@baton.dev      → 정산팀 (인수인계 받는 쪽. 화면 대부분 이쪽)
x-baton-user: cheolwoo@baton.dev   → 페이팀 (넘기는 쪽)
```

헤더를 안 주면 `.env` 의 `DEV_USER_EMAIL` 사용자로 동작합니다.
NextAuth 로그인이 붙은 뒤에는 세션이 우선이라, 이 헤더는 무시됩니다.

### 우선순위 배지

우선순위는 어디서 오든 항상 이 모양으로 내려갑니다. 프론트에서 매핑 테이블 만들지 마세요.

```jsonc
{
  "code": "URGENT",            // URGENT | HIGH | NORMAL | LOW
  "label": "긴급",              // 그대로 배지에 찍으면 됨
  "tone": "red",               // red | orange | slate | gray
  "rank": 0,                   // 정렬용. 0 이 가장 급함
  "raw": "Critical",           // 원본 표기. 툴팁에
  "reason": "원본 표기 \"Critical\" → 긴급"  // 왜 이 등급인지. 툴팁에
}
```

상태값도 마찬가지로 `status`(코드) + `statusLabel`(한글) 이 같이 옵니다.

---

## 1. 온보딩 · 인증 — 전철우

### `GET /api/me`

로그인 직후 어디로 보낼지 판단용.

```jsonc
{
  "user": { "id": "...", "email": "jiwoo@baton.dev", "name": "백지우", "image": null },
  "workspaces": [
    { "id": "...", "name": "정산팀", "slug": "settle-team", "tagline": "정산 · 운영 대응",
      "role": "OWNER", "memberCount": 2 }
  ]
}
```

`workspaces` 가 빈 배열이면 → 팀 생성/참여 화면으로.

### `POST /api/workspaces` — 팀 생성

```jsonc
// body
{ "name": "정산팀", "tagline": "정산 · 운영 대응" }
// → 201, WorkspaceDTO. 만든 사람은 자동 OWNER. Jira 목 연결도 자동 생성됨.
```

### `GET /api/workspaces/:workspaceId/link` — 파트너 연결 상태

연결이 없으면 `data: null`.

```jsonc
{
  "linkId": "...",
  "status": "ACTIVE",          // PENDING | ACTIVE | REVOKED
  "inviteCode": null,          // PENDING 일 때만 값이 있음
  "partner": { "id": "...", "name": "페이팀", "slug": "pay-team", "tagline": "결제 백엔드 · PG 연동" }
}
```

### `POST /api/workspaces/:workspaceId/link` — 초대 코드 발급

body 없음. 이미 발급된 PENDING 초대가 있으면 그 코드를 그대로 돌려줍니다.
초대 링크는 프론트에서 조립하세요: `${location.origin}/invite/${inviteCode}`

### `POST /api/links/accept` — 초대 수락

```jsonc
// body
{ "inviteCode": "BATON123", "workspaceId": "내 워크스페이스 id" }
// → PartnerDTO
```

에러 코드: `INVITE_NOT_FOUND`(404) · `INVITE_REVOKED`(410) · `SELF_LINK`(400) · `ALREADY_LINKED`(409)

---

## 2. 대시보드 — 전철우

### `GET /api/workspaces/:workspaceId/dashboard`

**대시보드 화면은 이 호출 하나로 끝납니다.**

```jsonc
{
  "workspace": { "id": "...", "name": "정산팀", "role": "OWNER", "memberCount": 2, ... },
  "partner": { "linkId": "...", "status": "ACTIVE", "inviteCode": null, "partner": {...} },

  "stats": {                      // 상단 통계 카드 4개
    "newHandovers": 2,            // 확인 전 인수인계
    "urgentHandovers": 1,         // 긴급
    "openActions": 6,             // 안 끝난 다음 업무
    "openRequests": 1             // 우리가 답해야 할 정보요청
  },

  "badges": {                     // 0 이면 배지 그리지 마세요
    "incomingRequests": 1,
    "unreadHandovers": 2,
    "incomingBoardItems": 1
  },

  "recentHandovers": [ HandoverListItemDTO x 5 ],
  "todayActions":    [ NextActionDTO x 5 ],
  "connections":     [ ConnectionDTO ]
}
```

---

## 3. 연결 관리 — 전철우

### `GET /api/workspaces/:workspaceId/connections`

```jsonc
[
  { "id": "...", "provider": "NOTION", "providerLabel": "Notion",
    "status": "CONNECTED", "statusLabel": "연결됨",
    "displayName": "인수인계 DB", "lastSyncedAt": "2026-08-14T01:00:00.000Z",
    "lastError": null, "isMock": false },
  { "id": "...", "provider": "JIRA", "providerLabel": "Jira",
    "status": "MOCK", "statusLabel": "데모 데이터",
    "displayName": "baton.atlassian.net · STL", "isMock": true }
]
```

`isMock: true` 인 항목엔 "데모" 뱃지를 붙여주세요. Jira 는 실연동이 없습니다.

### `POST /api/workspaces/:workspaceId/connections`

```jsonc
// Notion — 저장 전에 실제로 Notion 을 찔러봅니다. 실패하면 4xx 로 이유가 옵니다.
{ "provider": "NOTION", "token": "ntn_xxx", "databaseId": "32자리해시" }

// Jira — 검증 없이 목데이터로 저장
{ "provider": "JIRA", "site": "baton.atlassian.net", "projectKey": "STL" }
```

Notion 실패 시 자주 보는 메시지:
`Could not find database` → integration 을 그 Notion DB 페이지에 초대하지 않은 것.

### `POST /api/workspaces/:workspaceId/notion/sync`

Notion → 인수인계 카드 생성 (AI 요약 포함). 시간이 걸립니다(건당 1~3초). 로딩 표시 필요.

```jsonc
// body (전부 선택)
{ "limit": 5, "target": "partner", "force": false }
// target: "partner" = 파트너 팀 쪽에 인수인계로 꽂음(기본) / "self" = 우리 팀 안에서만

// → SyncResultDTO
{ "scanned": 5, "created": 3, "updated": 1, "skipped": 1,
  "aiUsed": true, "items": [HandoverListItemDTO], "warnings": [] }
```

`warnings` 는 있으면 화면에 그대로 보여주세요 (예: "ANTHROPIC_API_KEY 가 없어 AI 요약 없이 저장").

---

## 4. 인수인계 — 김건희

### `GET /api/workspaces/:workspaceId/handovers`

목록. query: `status`, `priority` (콤마 다중), `q` (제목/요약 검색), `take`
기본 정렬: 확인 전 → 우선순위 높은 순 → 최신순

```jsonc
[{
  "id": "...",
  "title": "PG 교체 (토스페이먼츠 → 나이스페이) 1차 이관 완료",
  "author": "전철우",
  "summary": "결제 승인/취소 경로는 ...",     // \n 으로 줄 나뉨
  "priority": { "code": "URGENT", "label": "긴급", "tone": "red", "rank": 0, ... },
  "status": "NEW", "statusLabel": "확인 전",
  "source": { "provider": "Notion", "url": "https://www.notion.so/..." },
  "from": { "id": "...", "name": "페이팀" },   // 어느 팀이 넘긴 건지. null 이면 우리 팀 내부
  "changeCount": 4, "openQuestionCount": 3, "nextActionCount": 3,
  "occurredAt": "...", "updatedAt": "..."
}]
```

### `GET /api/handovers/:handoverId`

**인수인계 상세 화면은 이 호출 하나로 끝납니다.** 위 목록 필드 + 아래가 더 옵니다.

```jsonc
{
  ...HandoverListItemDTO,

  "workContext": "토스페이먼츠 수수료 재계약이 결렬돼 ...",   // ← 업무맥락 블록

  "changes": [                                              // ← 변경사항 블록
    { "type": "changed", "typeLabel": "변경됨",
      "text": "취소 API 응답에서 remainingAmount 필드가 사라짐",
      "impact": "정산 배치의 잔액 검증 로직이 그대로면 부분취소 건에서 전부 실패한다." }
  ],

  "openQuestions": [                                        // ← 추가확인 블록
    { "question": "8/12~8/13 혼재 구간의 대사 기준일은?",
      "why": "두 PG 의 매입 시각이 달라서...",
      "requested": true,          // 이미 정보요청 보낸 항목이면 true → 버튼 비활성 + "요청함" 표시
      "requestId": "..." }
  ],

  "rawContent": "# PG 교체 ...",                             // Notion 원문. "원본 보기" 토글에
  "ai": { "model": "claude-haiku-4-5-20251001", "generatedAt": "..." },
  "acknowledgedAt": null,
  "acknowledgedBy": null,
  "nextActions": [ NextActionDTO ]                          // 이 인수인계에서 나온 업무들
}
```

### `POST /api/handovers/:handoverId/acknowledge`

"확인" 버튼. body 없음. 이미 확인한 건이어도 에러 없이 그대로 돌려줍니다.
**응답이 상세와 같은 모양**이라, 받은 걸 그대로 상태에 넣으면 버튼이 알아서 바뀝니다.

### `POST /api/handovers/:handoverId/actions/generate`

"이 인수인계로 다음 업무 만들기" 버튼. AI 가 3~6개 초안을 만들어 저장합니다.
다시 부르면 이전 AI 초안은 지우고 새로 만듭니다(사람이 손댄 건 안 건드림).

→ `NextActionDTO[]` (201). `aiDraft: true` 인 항목엔 **"AI 초안"** 뱃지를 붙여주세요.

에러: `AI_DISABLED`(503, 키 없음) · `NO_ACTIONS`(422, 뽑을 게 없음)

---

## 5. 다음 업무 — 김건희

### `GET /api/workspaces/:workspaceId/next-actions`

query: `status` (TODO/DOING/DONE, 콤마 다중) · `priority` · `assignee` · `handoverId` · `q`

> 탭 카운트가 필요하면 status 없이 한 번 받아서 프론트에서 세는 게 호출 수가 적습니다.

```jsonc
[{
  "id": "...",
  "title": "정산 배치의 잔액 검증 로직을 계산식으로 교체하기",
  "description": "나이스페이 취소 응답에 remainingAmount 가 없어서 ...",
  "assignee": "백지우",
  "status": "DOING", "statusLabel": "진행중",
  "priority": { "code": "URGENT", "label": "긴급", ... },
  "dueDate": null,
  "origin": "AI",          // AI | MANUAL
  "aiDraft": false,        // true 면 "AI 초안" 뱃지
  "handover": { "id": "...", "title": "PG 교체 ..." },   // 출처 인수인계. null 가능
  "createdAt": "..."
}]
```

### `POST /api/workspaces/:workspaceId/next-actions` — "업무 추가"

```jsonc
{ "title": "필수", "description": "", "assignee": "", 
  "priority": "NORMAL", "status": "TODO",
  "dueDate": "2026-08-20T00:00:00.000Z",   // ISO 8601, 선택
  "handoverItemId": "선택" }
```

### `PATCH /api/next-actions/:actionId`

상태 토글, 담당자 변경, 제목 수정 전부 여기로. 보내는 필드만 바뀝니다.

```jsonc
{ "status": "DONE" }
```

> 사람이 한 번이라도 수정하면 `aiDraft` 가 자동으로 false 가 됩니다 → "AI 초안" 뱃지가 사라짐.

### `DELETE /api/next-actions/:actionId`

---

## 6. 공유보드 — 김건희

### `GET /api/workspaces/:workspaceId/board`

우리가 보낸 것 + 받은 것을 한 번에. `direction` 으로 좌우/탭을 나누세요.
query 로 좁힐 수도 있습니다: `?direction=OUTGOING`

```jsonc
[{
  "id": "...",
  "title": "고객센터 조회 화면의 결제번호 정규식 수정",
  "body": "결제번호 포맷을 바꾼 쪽이 결제팀이라 ...",
  "priority": { "code": "HIGH", "label": "높음", ... },
  "status": "SHARED", "statusLabel": "전달함",
  "direction": "OUTGOING",                   // OUTGOING | INCOMING
  "from": { "id": "...", "name": "정산팀" },
  "to":   { "id": "...", "name": "페이팀" },
  "targetSystem": "Jira",

  // ← 전달 미리보기 패널. 실제 Jira Cloud REST API v3 가 그대로 받는 형식입니다.
  "targetPayload": {
    "method": "POST",
    "url": "https://baton.atlassian.net/rest/api/3/issue",

    // 사람이 읽는 요약 — 표로 뿌리세요
    "display": {
      "project": "PAY", "issueType": "Task",
      "summary": "고객센터 조회 화면의 결제번호 정규식 수정",
      "description": "tosspay_ 접두사 가정이 하드코딩되어 있음...",
      "priority": "High", "labels": ["baton","handover"], "assignee": null
    },

    // 실제 요청 본문 — JSON.stringify(body, null, 2) 로 코드블록에 뿌리세요
    "body": {
      "fields": {
        "project": { "key": "PAY" },
        "issuetype": { "name": "Task" },
        "summary": "고객센터 조회 화면의 결제번호 정규식 수정",
        "description": {            // ADF. Jira v3 는 평문을 안 받습니다
          "type": "doc", "version": 1,
          "content": [{ "type":"paragraph", "content":[{ "type":"text", "text":"..." }] }]
        },
        "priority": { "name": "High" },
        "labels": ["baton", "handover"],
        "assignee": null
      }
    }
  },

  "sharedAt": "...", "createdAt": "..."
}]
```

**실제 Jira write 는 없습니다.** 다만 `targetPayload.body` 는 진짜 스펙 그대로라,
그대로 복사해서 curl 로 쏘면 실제 이슈가 생성됩니다.

미리보기 패널은 이렇게 그리면 설득력이 큽니다.

```
┌──────────────────────────────────────────────────┐
│ POST https://baton.atlassian.net/rest/api/3/issue│  ← method + url
├────────────────────┬─────────────────────────────┤
│ 프로젝트   PAY      │ {                           │
│ 유형       Task     │   "fields": {               │  ← body 를
│ 우선순위   High     │     "project": {"key":"PAY"}│     JSON 그대로
│ 라벨       baton    │     ...                     │
│ (display 를 표로)   │   }                         │
│                    │ }                           │
└────────────────────┴─────────────────────────────┘
              [ Jira 로 전송 (데모) ]
```

### `POST /api/workspaces/:workspaceId/board`

화면 흐름:

1. 다음 업무에서 항목 선택 → `{ "nextActionIds": ["...", "..."], "share": false }`
   → `DRAFT` 로 만들어지고 `targetPayload` 가 채워집니다 → **미리보기 패널 렌더**
2. "전달" 클릭 → `PATCH /api/board/:id { "status": "SHARED" }`

한 번에 보내려면 처음부터 `"share": true`.
업무 없이 직접 쓰려면 `{ "title": "...", "body": "...", "priority": "HIGH" }`.

에러: `NO_PARTNER`(409, 파트너 팀 연결 안 됨)

### `PATCH /api/board/:boardItemId`

```jsonc
{ "status": "SHARED" }   // 보낸 팀만
{ "status": "ACCEPTED" } // 받는 팀만 → 받는 팀의 NextAction 으로 자동 복사됨
{ "status": "DECLINED" } // 받는 팀만
```

응답: `{ "item": BoardItemDTO, "copiedAction": NextActionDTO | null }`

---

## 7. 정보요청 (알림 배지)

### `GET /api/workspaces/:workspaceId/requests`

query: `direction=INCOMING|OUTGOING` · `status=OPEN|ANSWERED|CLOSED`

```jsonc
[{
  "id": "...",
  "question": "8/12~8/13 혼재 구간의 대사 기준일을 승인일로 볼지 매입일로 볼지?",
  "answer": null,
  "status": "OPEN", "statusLabel": "답변 대기",
  "direction": "OUTGOING",
  "from": { "id": "...", "name": "정산팀" },
  "to":   { "id": "...", "name": "페이팀" },
  "handover": { "id": "...", "title": "PG 교체 ..." },
  "boardItemId": null,
  "createdAt": "...", "answeredAt": null
}]
```

### `POST /api/workspaces/:workspaceId/requests`

인수인계 상세의 "추가확인" 항목 옆 **[요청] 버튼**이 이걸 부릅니다.

```jsonc
{ "question": "그 항목의 question 문자열 그대로", "handoverItemId": "..." }
```

같은 질문으로 다시 보내면 기존 요청을 그대로 돌려줍니다(중복 방지).

### `POST /api/requests/:requestId/answer`

```jsonc
{ "answer": "나이스 리포트를 정답으로 봅니다. ..." }
```

받은 쪽만 답할 수 있습니다. 답하면 상대 대시보드 배지가 내려갑니다.

---

## 8. 에러 코드 모음

| code | status | 언제 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 로그인 안 됨 (DEV_AUTH_BYPASS 도 꺼짐) |
| `NOT_A_MEMBER` | 403 | 그 워크스페이스 멤버가 아님 |
| `WORKSPACE_NOT_FOUND` | 404 | |
| `HANDOVER_NOT_FOUND` / `ACTION_NOT_FOUND` / `BOARD_ITEM_NOT_FOUND` / `REQUEST_NOT_FOUND` | 404 | |
| `INVALID_BODY` | 400 | zod 검증 실패. `details` 에 필드별 사유 |
| `NO_PARTNER` | 409 | 파트너 팀 연결 전인데 보드/요청을 시도 |
| `NOTION_NOT_CONNECTED` | 409 | Notion 토큰/DB 미등록 |
| `NOTION_AUTH_FAILED` | **400** | 토큰이 틀렸거나 integration 을 DB 에 초대 안 함. (401 로 안 내려갑니다 — 로그인 풀림과 헷갈리지 마세요) |
| `NOTION_NOT_FOUND` | **400** | databaseId 가 틀림 |
| `NOTION_ERROR` | 502 | 그 외 Notion 장애. 메시지가 `message` 에 그대로 |
| `AI_DISABLED` | 503 | ANTHROPIC_API_KEY 없음 |
| `NO_ACTIONS` | 422 | AI 가 뽑을 액션을 못 찾음 |
| `SENDER_ONLY` / `RECEIVER_ONLY` | 403 | 보드 상태 전이 권한 |

---

## 9. 아직 안 만든 것

필요해지면 말씀해 주세요. 30분이면 붙습니다.

- 워크스페이스 멤버 초대/목록 (지금은 seed 로만)
- 인수인계 아카이브 (`ARCHIVED` 전이)
- 실시간 알림 (지금은 폴링 전제)
- 첨부파일
