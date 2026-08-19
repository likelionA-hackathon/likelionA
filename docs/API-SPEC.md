# PM Connector API 명세서

작성 백지우 · 기준 커밋 `main` · 엔드포인트 18개

이 문서는 **레퍼런스**입니다. 화면별 사용 예시는 [`API.md`](API.md) 를 보세요.
타입 정의는 [`src/types/api.ts`](../src/types/api.ts) 이며, **문서와 다르면 타입이 정답**입니다.

---

## 목차

1. [공통 규칙](#1-공통-규칙)
2. [엔드포인트 요약](#2-엔드포인트-요약)
3. [인증 · 워크스페이스](#3-인증--워크스페이스)
4. [파트너 연결](#4-파트너-연결)
5. [대시보드](#5-대시보드)
6. [외부 연결](#6-외부-연결)
7. [인수인계](#7-인수인계)
8. [다음 업무](#8-다음-업무)
9. [공유보드](#9-공유보드)
10. [정보요청](#10-정보요청)
11. [공통 객체](#11-공통-객체)
12. [에러 코드](#12-에러-코드)

---

## 1. 공통 규칙

### 응답 봉투

모든 응답은 아래 두 모양 중 하나입니다. 예외 없습니다.

```jsonc
{ "ok": true,  "data": ... }
{ "ok": false, "error": { "code": "NOT_A_MEMBER", "message": "이 워크스페이스의 멤버가 아닙니다.", "details": null } }
```

`message` 는 **그대로 화면에 띄워도 되는 한국어**입니다. 분기는 `code` 로 하세요.

### 호출 방법

`fetch` 를 직접 쓰지 말고 [`src/lib/api-client.ts`](../src/lib/api-client.ts) 를 쓰세요.
봉투 해제와 에러 throw 가 되어 있고 반환 타입이 붙어 있습니다.

```ts
import { api, ApiError } from "@/lib/api-client";

const dash = await api.dashboard(workspaceId);   // DashboardDTO
```

### 인증

| 상황 | 동작 |
|---|---|
| NextAuth 세션 있음 | 세션의 사용자로 동작 |
| 세션 없고 `DEV_AUTH_BYPASS="true"` | 요청 헤더 `x-baton-user: <이메일>` 의 사용자로 동작 |
| 헤더도 없음 | 401. 브라우저 화면은 항상 실제 로그인 세션이 필요합니다 |
| 전부 없음 | `401 UNAUTHENTICATED` |

개발용 계정 (seed 로 생성됨)

| 이메일 | 소속 | 성격 |
|---|---|---|
| `jiwoo@baton.dev` | 정산팀 (OWNER) | 인수인계 **받는** 쪽. 화면 대부분 이쪽 |
| `cheolwoo@baton.dev` | 페이팀 (OWNER) | **넘기는** 쪽 |
| `geonhee@baton.dev` | 양쪽 (MEMBER) | 두 팀 다 접근 가능 |

> 배포 전 `DEV_AUTH_BYPASS` 를 `false` 로 바꿔야 합니다.

### 권한

- 워크스페이스 하위 엔드포인트는 **그 워크스페이스의 멤버**만 호출 가능 → 아니면 `403 NOT_A_MEMBER`
- 워크스페이스 ID 는 **하드코딩하지 마세요.** seed 를 다시 돌리면 바뀝니다. `GET /api/me` 로 받아 쓰세요

---

## 2. 엔드포인트 요약

| # | 메서드 | 경로 | 용도 | 담당 화면 |
|---|---|---|---|---|
| 1 | GET | `/api/me` | 내 정보 + 소속 워크스페이스 | 공통 |
| 2 | GET | `/api/workspaces` | 내 워크스페이스 목록 | 온보딩 |
| 3 | POST | `/api/workspaces` | 팀 생성 | 온보딩 |
| 4 | GET | `/api/workspaces/:wsId/link` | 파트너 연결 상태 | 초대 |
| 5 | POST | `/api/workspaces/:wsId/link` | 초대 코드 발급 | 초대 |
| 6 | POST | `/api/links/accept` | 초대 수락 | 초대 |
| 7 | GET | `/api/workspaces/:wsId/dashboard` | 대시보드 전체 | 대시보드 |
| 8 | GET | `/api/workspaces/:wsId/connections` | 연결 목록 | 연결관리 |
| 9 | POST | `/api/workspaces/:wsId/connections` | 연결 추가/수정 | 연결관리 |
| 10 | POST | `/api/workspaces/:wsId/notion/sync` | Notion 동기화 + AI | 연결관리 |
| 11 | GET | `/api/workspaces/:wsId/handovers` | 인수인계 목록 | 인수인계 |
| 12 | GET | `/api/handovers/:id` | 인수인계 상세 | 인수인계 |
| 13 | POST | `/api/handovers/:id/acknowledge` | 확인 처리 | 인수인계 |
| 14 | POST | `/api/handovers/:id/actions/generate` | AI 다음업무 생성 | 인수인계 |
| 15 | GET | `/api/workspaces/:wsId/next-actions` | 업무 목록 | 다음업무 |
| 16 | POST | `/api/workspaces/:wsId/next-actions` | 업무 추가 | 다음업무 |
| 17 | PATCH | `/api/next-actions/:id` | 업무 수정 | 다음업무 |
| 18 | DELETE | `/api/next-actions/:id` | 업무 삭제 | 다음업무 |
| 19 | GET | `/api/workspaces/:wsId/board` | 공유보드 목록 | 공유보드 |
| 20 | POST | `/api/workspaces/:wsId/board` | 보드 항목 생성 | 공유보드 |
| 21 | PATCH | `/api/board/:id` | 보드 상태 변경 | 공유보드 |
| 22 | GET | `/api/workspaces/:wsId/requests` | 정보요청 목록 | 공통 |
| 23 | POST | `/api/workspaces/:wsId/requests` | 정보요청 생성 | 인수인계 |
| 24 | POST | `/api/requests/:id/answer` | 요청 답변 | 공통 |

`:wsId` = 워크스페이스 ID

---

## 3. 인증 · 워크스페이스

### `GET /api/me`

로그인 직후 어디로 보낼지 판단용. `workspaces` 가 비면 팀 생성 화면으로.

```jsonc
// 200
{
  "user": { "id": "cmsu…", "email": "jiwoo@baton.dev", "name": "백지우", "image": null },
  "workspaces": [
    { "id": "cmsu…", "name": "정산팀", "slug": "settle-team",
      "tagline": "정산 · 운영 대응", "role": "OWNER", "memberCount": 2 }
  ]
}
```

에러: `401 UNAUTHENTICATED`

---

### `GET /api/workspaces`

→ `WorkspaceDTO[]` (`/api/me` 의 `workspaces` 와 동일)

---

### `POST /api/workspaces`

```jsonc
// 요청
{ "name": "정산팀", "tagline": "정산 · 운영 대응" }   // name 필수(1~50자), tagline 선택(~100자)
```

→ `201` `WorkspaceDTO`

만든 사람은 자동으로 `OWNER` 가 되고, **Jira 목 연결이 자동 생성**됩니다(연결관리 화면이 비지 않도록).

에러: `400 INVALID_BODY`

---

## 4. 파트너 연결

### `GET /api/workspaces/:wsId/link`

연결이 없으면 `data: null`.

```jsonc
{
  "linkId": "cmsu…",
  "status": "ACTIVE",          // PENDING | ACTIVE | REVOKED
  "inviteCode": null,          // PENDING 일 때만 값이 있음
  "partner": { "id": "cmsu…", "name": "페이팀", "slug": "pay-team", "tagline": "결제 백엔드 · PG 연동" }
}
```

---

### `POST /api/workspaces/:wsId/link`

body 없음. 이미 발급된 `PENDING` 초대가 있으면 **같은 코드**를 돌려줍니다.

→ `201`(신규) 또는 `200`(기존) `PartnerDTO`

초대 링크는 프론트에서 조립하세요: `` `${location.origin}/invite/${inviteCode}` ``

---

### `POST /api/links/accept`

```jsonc
{ "inviteCode": "BATON123", "workspaceId": "내 워크스페이스 id" }
```

→ `200` `PartnerDTO`

| 에러 | 상황 |
|---|---|
| `404 INVITE_NOT_FOUND` | 코드가 없음 |
| `410 INVITE_REVOKED` | 만료된 코드 |
| `400 SELF_LINK` | 자기 팀에 수락 시도 |
| `409 ALREADY_LINKED` | 이미 다른 팀과 연결된 초대 |

---

## 5. 대시보드

### `GET /api/workspaces/:wsId/dashboard`

**대시보드 화면은 이 호출 하나로 끝납니다.**

```jsonc
{
  "workspace": { "id":"…", "name":"정산팀", "slug":"settle-team",
                 "tagline":"…", "role":"OWNER", "memberCount":2 },
  "partner": { "linkId":"…", "status":"ACTIVE", "inviteCode":null, "partner":{…} },

  "stats": {                    // 상단 통계 카드 4개
    "newHandovers": 4,          // 확인 전 인수인계
    "urgentHandovers": 1,       // 긴급 등급
    "openActions": 16,          // 끝나지 않은 업무
    "openRequests": 1           // 우리가 답해야 할 요청
  },

  "badges": {                   // 0 이면 배지를 그리지 마세요
    "incomingRequests": 1,
    "unreadHandovers": 4,
    "incomingBoardItems": 1
  },

  "recentHandovers": [ /* HandoverListItemDTO × 최대 5 */ ],
  "todayActions":    [ /* NextActionDTO × 최대 5 */ ],
  "connections":     [ /* ConnectionDTO */ ]
}
```

---

## 6. 외부 연결

### `GET /api/workspaces/:wsId/connections`

```jsonc
[{
  "id": "cmsu…",
  "provider": "NOTION",          // NOTION | JIRA | SLACK
  "providerLabel": "Notion",
  "status": "CONNECTED",         // CONNECTED | DISCONNECTED | ERROR | MOCK
  "statusLabel": "연결됨",
  "displayName": "인수인계",
  "lastSyncedAt": "2026-08-16T07:12:00.000Z",
  "lastError": null,
  "isMock": false                // true 면 "데모" 뱃지를 붙이세요 (Jira)
}]
```

---

### `POST /api/workspaces/:wsId/connections`

`provider` 값에 따라 body 가 다릅니다.

```jsonc
// Notion — 저장 전에 실제로 Notion 을 찔러 검증합니다
{ "provider": "NOTION", "token": "ntn_…", "databaseId": "32자리해시" }

// Jira — 검증 없이 목데이터로 저장 (status=MOCK)
{ "provider": "JIRA", "site": "pmconnector.atlassian.net", "projectKey": "STL" }
```

→ `201` `ConnectionDTO` (Notion 은 `apiVersion` 이 추가로 붙음)

| 에러 | 뜻 |
|---|---|
| `400 NOTION_AUTH_FAILED` | 토큰이 틀렸거나 **integration 을 DB 페이지에 초대하지 않음** |
| `400 NOTION_NOT_FOUND` | `databaseId` 가 틀림 |
| `400 NOTION_NOT_A_DATABASE` | 일반 페이지를 가리킴 (인라인 표는 자동 탐색됨) |
| `502 NOTION_ERROR` | 그 외 Notion 장애 |

> **401 로 내려가지 않습니다.** 로그인 풀림과 헷갈리지 않게 일부러 400 으로 매핑했습니다.

---

### `POST /api/workspaces/:wsId/notion/sync`

Notion → 인수인계 카드 생성. **AI 호출이 포함되어 건당 1~3초** 걸립니다. 로딩 표시 필수.

```jsonc
// 요청 (전부 선택)
{
  "limit": 5,           // 1~20, 기본 5
  "target": "partner",  // "partner"(기본) = 파트너 팀에 꽂음 / "self" = 우리 팀 안에서만
  "force": false        // true 면 변경 없는 건도 AI 재생성
}
```

```jsonc
// 200
{
  "scanned": 4, "created": 4, "updated": 0, "skipped": 0,
  "aiUsed": true,
  "items": [ /* HandoverListItemDTO */ ],
  "warnings": []        // 있으면 화면에 그대로 보여주세요
}
```

에러: `409 NOTION_NOT_CONNECTED` · Notion 계열 에러(위 표와 동일)

---

## 7. 인수인계

### `GET /api/workspaces/:wsId/handovers`

| 쿼리 | 예 | 설명 |
|---|---|---|
| `status` | `NEW,ACKNOWLEDGED` | 콤마 다중. `NEW`/`ACKNOWLEDGED`/`ARCHIVED` |
| `priority` | `URGENT,HIGH` | 콤마 다중 |
| `q` | `PG` | 제목·요약 부분일치 |
| `take` | `20` | 기본 50, 최대 100 |

정렬: 확인 전 → 우선순위 높은 순 → 최신순

```jsonc
[{
  "id": "cmsu…",
  "title": "PG 교체 관련 인수인계",
  "author": "전철우",
  "summary": "…\n…",                       // 줄바꿈 \n 포함
  "priority": { /* PriorityBadge */ },
  "status": "NEW", "statusLabel": "확인 전",
  "source": { "provider": "Notion", "url": "https://notion.so/…" },
  "from": { "id": "cmsu…", "name": "페이팀" },   // null 이면 우리 팀 내부 문서
  "changeCount": 4, "openQuestionCount": 1, "nextActionCount": 6,
  "occurredAt": "…", "updatedAt": "…"
}]
```

---

### `GET /api/handovers/:id`

**인수인계 상세 화면은 이 호출 하나로 끝납니다.** 위 목록 필드 + 아래가 추가됩니다.

```jsonc
{
  /* …HandoverListItemDTO 전부… */

  "workContext": "…",                        // 업무맥락 블록

  "changes": [{                              // 변경사항 블록
    "type": "changed",                       // added | changed | removed
    "typeLabel": "변경됨",                    // ← 배지에 이걸 그대로 쓰세요
    "text": "취소 API 응답에서 remainingAmount 제거됨",
    "impact": "정산 배치의 잔액 검증이 부분취소 건에서 전부 실패한다"
  }],

  "openQuestions": [{                        // 추가확인 블록
    "question": "대사 기준을 승인일과 매입일 중 무엇으로?",
    "why": "기준이 없으면 리포트가 계속 불일치함",
    "requested": false,                      // true 면 이미 요청 보냄 → 버튼 비활성
    "requestId": null
  }],

  "rawContent": "# PG 교체 …",                // Notion 원문 전체. "원본 보기" 토글에
  "ai": { "model": "gpt-5.6-luna", "generatedAt": "…" },
  "acknowledgedAt": null,
  "acknowledgedBy": null,                    // { id, name }
  "nextActions": [ /* NextActionDTO */ ]
}
```

에러: `404 HANDOVER_NOT_FOUND` · `403 NOT_A_MEMBER`

---

### `POST /api/handovers/:id/acknowledge`

body 없음. 이미 확인한 건이어도 에러 없이 그대로 돌려줍니다.

→ `200` **상세와 동일한 모양**. 받은 걸 그대로 상태에 넣으면 버튼이 알아서 바뀝니다.

---

### `POST /api/handovers/:id/actions/generate`

AI 가 다음 업무 초안 3~6개를 만들어 저장합니다. 다시 부르면 **이전 AI 초안은 지우고 새로 생성**합니다(사람이 손댄 것은 보존).

→ `201` `NextActionDTO[]` — `aiDraft: true` 인 항목에 **"AI 초안"** 뱃지를 붙이세요.

| 에러 | 상황 |
|---|---|
| `503 AI_DISABLED` | `.env` 에 AI 키 없음 |
| `422 NO_ACTIONS` | 뽑아낼 액션을 못 찾음 |

---

## 8. 다음 업무

### `GET /api/workspaces/:wsId/next-actions`

쿼리: `status`(콤마 다중) · `priority`(콤마 다중) · `assignee`(부분일치) · `handoverId` · `q`

> 탭 카운트가 필요하면 `status` 없이 한 번 받아 프론트에서 세는 게 호출 수가 적습니다.

```jsonc
[{
  "id": "cmsu…",
  "title": "부분취소 잔액 검증 로직 수정하기",
  "description": "…",
  "assignee": null,                     // AI 는 대부분 null 로 줍니다 → "미지정" 표시
  "status": "TODO", "statusLabel": "예정",
  "priority": { /* PriorityBadge */ },
  "dueDate": null,
  "origin": "AI",                       // AI | MANUAL
  "aiDraft": true,                      // true 면 "AI 초안" 뱃지
  "handover": { "id": "cmsu…", "title": "PG 교체 관련 인수인계" },   // null 가능
  "createdAt": "…"
}]
```

---

### `POST /api/workspaces/:wsId/next-actions`

```jsonc
{
  "title": "필수 (1~200자)",
  "description": "선택 (~4000자)",
  "assignee": "선택 (~50자)",
  "priority": "NORMAL",                 // 기본 NORMAL
  "status": "TODO",                     // 기본 TODO
  "dueDate": "2026-08-20T00:00:00.000Z",// 선택, ISO 8601
  "handoverItemId": "선택"
}
```

→ `201` `NextActionDTO` (`origin: "MANUAL"`, `aiDraft: false`)

---

### `PATCH /api/next-actions/:id`

상태 토글·담당자 변경·제목 수정 전부 여기로. **보낸 필드만** 바뀝니다.

```jsonc
{ "status": "DONE" }
{ "assignee": null, "dueDate": null }    // null 로 해제 가능
```

→ `200` `NextActionDTO`

> 한 번이라도 수정하면 `aiDraft` 가 자동으로 `false` 가 됩니다 → "AI 초안" 뱃지가 사라짐

---

### `DELETE /api/next-actions/:id`

→ `200` `{ "deleted": true }`

---

## 9. 공유보드

### `GET /api/workspaces/:wsId/board`

쿼리: `direction=OUTGOING|INCOMING` (없으면 양방향 전부)

```jsonc
[{
  "id": "cmsu…",
  "title": "…", "body": "…",
  "priority": { /* PriorityBadge */ },
  "status": "SHARED", "statusLabel": "전달함",   // DRAFT | SHARED | ACCEPTED | DECLINED
  "direction": "OUTGOING",
  "from": { "id":"…", "name":"정산팀" },
  "to":   { "id":"…", "name":"페이팀" },
  "targetSystem": "Jira",
  "targetPayload": { /* JiraPreviewPayload — 아래 참고 */ },
  "sharedAt": "…", "createdAt": "…"
}]
```

---

### `POST /api/workspaces/:wsId/board`

화면 흐름:

1. 업무 선택 → `{ "nextActionIds": ["…"], "share": false }` → `DRAFT` 생성 + `targetPayload` 채워짐 → **미리보기 패널 렌더**
2. "전달" 클릭 → `PATCH /api/board/:id { "status": "SHARED" }`

한 번에 보내려면 처음부터 `"share": true`.
업무 없이 직접 쓰려면 `{ "title": "…", "body": "…", "priority": "HIGH" }`.

→ `201` `BoardItemDTO[]`

에러: `409 NO_PARTNER` (파트너 팀 미연결) · `404 ACTION_NOT_FOUND`

---

### `PATCH /api/board/:id`

```jsonc
{ "status": "SHARED" }    // 보낸 팀만
{ "status": "ACCEPTED" }  // 받는 팀만 → 받는 팀의 NextAction 으로 자동 복사
{ "status": "DECLINED" }  // 받는 팀만
```

→ `200` `{ "item": BoardItemDTO, "copiedAction": NextActionDTO | null }`

에러: `403 SENDER_ONLY` · `403 RECEIVER_ONLY`

---

### JiraPreviewPayload

**실제 Jira write 는 하지 않습니다.** 다만 `body` 는 Jira Cloud REST API v3 스펙 그대로라,
복사해서 curl 로 쏘면 실제 이슈가 생성됩니다.

```jsonc
{
  "method": "POST",
  "url": "https://pmconnector.atlassian.net/rest/api/3/issue",

  // 표로 뿌릴 사람용 요약 — ADF 를 파싱할 필요가 없게 같이 내려줍니다
  "display": {
    "project": "PAY", "issueType": "Task",
    "summary": "…", "description": "…",
    "priority": "High", "labels": ["PM Connector","handover"], "assignee": null
  },

  // 실제 요청 본문 — JSON.stringify(body, null, 2) 로 코드블록에
  "body": {
    "fields": {
      "project":   { "key": "PAY" },
      "issuetype": { "name": "Task" },
      "summary":   "…",
      "description": {           // ADF. v3 는 평문을 안 받습니다
        "type": "doc", "version": 1,
        "content": [{ "type":"paragraph", "content":[{ "type":"text", "text":"…" }] }]
      },
      "priority": { "name": "High" },
      "labels":   ["PM Connector", "handover"],
      "assignee": null           // Jira Cloud 는 accountId 로 지정
    }
  }
}
```

---

## 10. 정보요청

### `GET /api/workspaces/:wsId/requests`

쿼리: `direction=OUTGOING|INCOMING` · `status=OPEN|ANSWERED|CLOSED`(콤마 다중)

```jsonc
[{
  "id": "cmsu…",
  "question": "…", "answer": null,
  "status": "OPEN", "statusLabel": "답변 대기",
  "direction": "OUTGOING",
  "from": { "id":"…", "name":"정산팀" },
  "to":   { "id":"…", "name":"페이팀" },
  "handover": { "id":"…", "title":"…" },   // null 가능
  "boardItemId": null,
  "createdAt": "…", "answeredAt": null
}]
```

대시보드의 빨간 배지 = `direction=INCOMING & status=OPEN` 개수
(대시보드 API 의 `badges.incomingRequests` 로도 이미 내려갑니다)

---

### `POST /api/workspaces/:wsId/requests`

인수인계 상세의 "추가확인" 옆 **[요청]** 버튼이 부릅니다.

```jsonc
{
  "question": "그 항목의 question 문자열 그대로",   // 필수 (~2000자)
  "handoverItemId": "선택",
  "boardItemId": "선택"
}
```

→ `201` `RequestDTO`. **같은 질문으로 다시 보내면 기존 요청을 그대로 돌려줍니다**(중복 방지, `200`).

에러: `409 NO_PARTNER`

---

### `POST /api/requests/:id/answer`

```jsonc
{ "answer": "…" }   // 필수 (~4000자)
```

→ `200` `RequestDTO` (`status: "ANSWERED"`)

**받은 쪽(`to`)만** 답할 수 있습니다. 답하면 보낸 쪽 대시보드 배지가 내려갑니다.

에러: `403 NOT_A_MEMBER` · `404 REQUEST_NOT_FOUND`

---

## 11. 공통 객체

### PriorityBadge

우선순위는 어디서 오든 **항상 이 모양**입니다. 프론트에서 매핑 테이블을 만들지 마세요.

```jsonc
{
  "code": "URGENT",                          // URGENT | HIGH | NORMAL | LOW
  "label": "긴급",                            // 배지에 그대로
  "tone": "red",                             // red | orange | slate | gray
  "rank": 0,                                 // 정렬용. 0 이 가장 급함
  "raw": "Critical",                          // 원본 표기. 툴팁에
  "reason": "원본 표기 \"Critical\" → 긴급"    // 판단 근거. 툴팁에
}
```

| code | label | tone | rank |
|---|---|---|---|
| `URGENT` | 긴급 | `red` | 0 |
| `HIGH` | 높음 | `orange` | 1 |
| `NORMAL` | 보통 | `slate` | 2 |
| `LOW` | 낮음 | `gray` | 3 |

> `raw` 와 `reason` 을 툴팁으로 보여주면 **"Critical 이 왜 긴급인가"** 에 화면이 스스로 답합니다.
> 우선순위 정규화가 우리 핵심 기능이라 데모에서 중요한 지점입니다.

### 상태 라벨

모든 상태값은 `code` + `codeLabel` 이 쌍으로 옵니다. 한글은 서버가 붙여서 보냅니다.

| 필드 | 값 → 라벨 |
|---|---|
| 인수인계 `status` | `NEW`→확인 전 · `ACKNOWLEDGED`→확인함 · `ARCHIVED`→보관됨 |
| 업무 `status` | `TODO`→예정 · `DOING`→진행중 · `DONE`→완료 |
| 보드 `status` | `DRAFT`→미리보기 · `SHARED`→전달함 · `ACCEPTED`→수락됨 · `DECLINED`→반려됨 |
| 요청 `status` | `OPEN`→답변 대기 · `ANSWERED`→답변 완료 · `CLOSED`→종료 |
| 연결 `status` | `CONNECTED`→연결됨 · `DISCONNECTED`→연결 안 됨 · `ERROR`→오류 · `MOCK`→데모 데이터 |
| 변경 `type` | `added`→추가됨 · `changed`→변경됨 · `removed`→제거됨 |

---

## 12. 에러 코드

| code | status | 상황 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 로그인 안 됨 (`DEV_AUTH_BYPASS` 도 꺼짐) |
| `NOT_A_MEMBER` | 403 | 그 워크스페이스 멤버가 아님 |
| `SENDER_ONLY` | 403 | 보낸 팀만 가능한 보드 전이 |
| `RECEIVER_ONLY` | 403 | 받는 팀만 가능한 보드 전이 |
| `WORKSPACE_NOT_FOUND` | 404 | |
| `HANDOVER_NOT_FOUND` | 404 | |
| `ACTION_NOT_FOUND` | 404 | |
| `BOARD_ITEM_NOT_FOUND` | 404 | |
| `REQUEST_NOT_FOUND` | 404 | |
| `INVITE_NOT_FOUND` | 404 | |
| `INVITE_REVOKED` | 410 | |
| `SELF_LINK` | 400 | 자기 팀에 초대 수락 |
| `ALREADY_LINKED` | 409 | 이미 연결된 초대 |
| `INVALID_BODY` | 400 | zod 검증 실패. `details` 에 필드별 사유 |
| `INVALID_JSON` | 400 | JSON 파싱 실패 |
| `NO_PARTNER` | 409 | 파트너 팀 미연결인데 보드/요청 시도 |
| `NOTION_NOT_CONNECTED` | 409 | Notion 토큰/DB 미등록 |
| `NOTION_AUTH_FAILED` | 400 | 토큰 오류 또는 integration 미초대 |
| `NOTION_NOT_FOUND` | 400 | databaseId 오류 |
| `NOTION_NOT_A_DATABASE` | 400 | 데이터베이스가 아닌 페이지 |
| `NOTION_ERROR` | 502 | 그 외 Notion 장애 |
| `AI_DISABLED` | 503 | AI 키 없음 |
| `NO_ACTIONS` | 422 | AI 가 액션을 못 뽑음 |
| `INTERNAL` | 500 | 그 외. 서버 로그 확인 필요 |

---

## 아직 없는 것

필요해지면 말씀해 주세요. 대부분 30분이면 붙습니다.

- 워크스페이스 멤버 초대/목록 (지금은 seed 로만)
- 인수인계 아카이브(`ARCHIVED`) 전이
- 실시간 알림 (지금은 폴링 전제)
- 첨부파일
- Jira 실제 write (미리보기까지가 스코프)
