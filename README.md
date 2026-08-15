# Baton

> https://github.com/likelionA-hackathon/likelionA
> 처음 오셨으면 **[`docs/ONBOARDING.md`](docs/ONBOARDING.md)** 부터 읽으세요.
> 깃이 처음이면 **[`docs/GIT.md`](docs/GIT.md)** 도 같이.

팀 간 인수인계 허브. Notion 에 흩어진 인수인계 문서를 AI 가 정리하고,
파트너 팀과 다음 업무·공유보드로 이어줍니다.

- 프레임워크: Next.js 16 (App Router) · TypeScript
- DB: PostgreSQL (Neon/Supabase) + Prisma
- 인증: NextAuth v5 (Google OAuth)
- 연동: Notion REST (실연동) · Jira (목데이터)
- AI: Gemini(무료 티어) 또는 Claude — `.env` 로 전환

---

## 30초 셋업

```bash
npm install
cp .env.example .env      # Windows PowerShell: copy .env.example .env
# .env 에 DATABASE_URL 만 채우면 화면 개발은 바로 됩니다
npx prisma db push
npm run db:seed
npm run dev
```

`http://localhost:3000/api/me` 가 JSON 을 뱉으면 성공입니다.

### Neon DB 만들기 (3분) — 한 명만 하고 팀에 공유

1. https://console.neon.tech → GitHub 로그인
2. **Create project** → 리전은 `Asia Pacific (Singapore)` (한국에서 가장 가까움)
3. 프로젝트 화면에서 **Connect** 버튼 → 다이얼로그가 뜸
4. **문자열을 두 개** 복사합니다. 같은 다이얼로그에서 체크박스 하나만 바꾸면 됩니다.

   | .env 변수 | Connection pooling | 호스트 모양 | 누가 씀 |
   |---|---|---|---|
   | `DATABASE_URL` | **체크** | `ep-xxxx-`**`pooler`**`.…` | 앱 런타임 |
   | `DIRECT_URL` | 체크 해제 | `ep-xxxx.…` | `prisma db push`, seed |

5. 두 값을 `.env` 에 넣고, **팀방에 그대로 공유**합니다.
   각자 만들면 워크스페이스 id 가 달라져서 화면 붙일 때 데이터가 안 맞습니다.

```bash
npx prisma db push   # 스키마를 DB 에 생성
npm run db:seed      # 데모 데이터 심기
npm run dev
```

> **알아둘 것 — 5분 쉬면 DB 가 잠듭니다.**
> Neon 무료 플랜은 5분 유휴 후 컴퓨트를 0으로 내립니다(끌 수 없음).
> 그래서 한동안 안 쓰다가 첫 요청을 보내면 1초 정도 걸립니다. **버그가 아닙니다.**
> **데모 직전에 아무 API 나 한 번 찔러서 깨워두세요.** 무대에서 첫 클릭이 느리면 흐름이 끊깁니다.
>
> 무료 플랜: 프로젝트당 스토리지 0.5GB · 월 100 CU-hours. 우리 규모로는 남습니다.

## 팀원별 시작 지점

| | 담당 | 먼저 읽을 것 |
|---|---|---|
| 백지우 | AI · 백엔드 · 연동 | `src/lib/*`, `src/app/api/**` |
| 전철우 | 온보딩 · 대시보드 · 연결관리 | `docs/API.md` 1~3장 |
| 김건희 | 인수인계 상세 · 다음업무 · 공유보드 | `docs/API.md` 4~7장 |

**API 명세: [`docs/API.md`](docs/API.md)** · 타입: `src/types/api.ts`

---

## 로그인 없이 개발하기

`.env` 의 `DEV_AUTH_BYPASS="true"` 가 켜져 있으면 로그인 없이 API 가 열립니다.
누구로 부를지는 요청 헤더로:

```bash
curl -H "x-baton-user: jiwoo@baton.dev" http://localhost:3000/api/me
```

| 헤더 값 | 팀 | 성격 |
|---|---|---|
| `jiwoo@baton.dev` | 정산팀 | 인수인계 **받는** 쪽. 화면 대부분 이쪽 |
| `cheolwoo@baton.dev` | 페이팀 | **넘기는** 쪽 |

NextAuth 로그인이 붙은 뒤에는 세션이 우선이라 이 헤더는 무시됩니다.
**배포 전에 `DEV_AUTH_BYPASS` 를 반드시 끄세요.**

---

## Notion 붙이기 (백지우)

1. https://www.notion.so/my-integrations → **New integration** → Internal Integration Token 복사
2. 인수인계용 Notion **데이터베이스** 페이지 → 우상단 `⋯` → **연결** → 방금 만든 integration 초대
   - 이걸 빼먹으면 `Could not find database` 가 납니다. 제일 흔한 실수입니다.
3. 데이터베이스 URL 의 32자리 해시가 `databaseId`
   `https://notion.so/workspace/`**`a1b2c3...`**`?v=...`
4. 연결 등록:

```bash
curl -X POST http://localhost:3000/api/workspaces/<워크스페이스ID>/connections \
  -H "Content-Type: application/json" -H "x-baton-user: cheolwoo@baton.dev" \
  -d '{"provider":"NOTION","token":"ntn_...","databaseId":"a1b2c3..."}'
```

5. 동기화 (AI 요약까지 한 번에):

```bash
curl -X POST http://localhost:3000/api/workspaces/<워크스페이스ID>/notion/sync \
  -H "Content-Type: application/json" -H "x-baton-user: cheolwoo@baton.dev" \
  -d '{"limit":3}'
```

### Notion DB 에 넣어두면 좋은 property

| 이름 | 타입 | 쓰임 |
|---|---|---|
| 제목 | Title | 인수인계 제목 |
| 우선순위 | Select | `Critical` / `P1` / `보통` / `backlog` 등 아무 표기나 — 4단계로 정규화됨 |
| 담당자 | Person 또는 Text | 작성자 표시 |

property 이름은 `우선순위/priority/중요도/긴급도`, `담당자/작성자/assignee/owner` 중 아무거나 인식합니다.

---

## AI 붙이기 (백지우) — 무료로

`GEMINI_API_KEY` 하나만 넣으면 됩니다. **카드 등록 불필요.**

1. https://aistudio.google.com/apikey → **Create API key**
2. `.env` 의 `GEMINI_API_KEY` 에 붙여넣기

```
GEMINI_API_KEY="AIza..."
GEMINI_MODEL="gemini-3.5-flash"
```

키가 둘 다 있으면 `LLM_PROVIDER="gemini"` 또는 `"anthropic"` 로 고릅니다.
비워두면 있는 키를 자동으로 씁니다.

> 무료 티어는 입력 내용이 Google 제품 개선에 사용됩니다.
> 우리 데모 데이터는 전부 가짜라 상관없지만, 실제 회사 문서로는 쓰지 마세요.

품질이 아쉬우면 `src/lib/claude.ts` 의 `SUMMARY_SYSTEM` 만 고치면 됩니다.
모델 전환은 `src/lib/llm.ts` 한 파일에 격리되어 있습니다.

## Google OAuth 붙이기 (전철우)

1. https://console.cloud.google.com → API 및 서비스 → 사용자 인증 정보
2. OAuth 클라이언트 ID 만들기 (웹 애플리케이션)
3. 승인된 리디렉션 URI: `http://localhost:3000/api/auth/callback/google`
4. `.env` 에 `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET` 채우기
   - `AUTH_SECRET` 은 `npx auth secret` 으로 생성

---

## 자주 쓰는 명령

```bash
npm run dev        # 개발 서버
npm run db:push    # 스키마 변경을 DB 에 반영 (마이그레이션 파일 없이)
npm run db:seed    # 데모 데이터 다시 심기
npm run db:reset   # DB 날리고 처음부터 (데이터 다 사라짐, 주의)
npm run db:studio  # Prisma Studio 로 데이터 눈으로 보기
```

스키마(`prisma/schema.prisma`)를 고쳤으면 **`npm run db:push` 를 꼭 돌리세요.**
안 그러면 타입은 맞는데 런타임에 컬럼이 없다고 터집니다.

---

## 데모 시나리오

```
페이팀(결제 백엔드)  ──파트너 연결──  정산팀(정산/운영)
```

1. 페이팀이 Notion 에 "PG 교체 1차 이관 완료" 인수인계를 씀
2. Baton 이 동기화 → AI 가 요약 / 변경사항 / 업무맥락 / 추가확인 으로 쪼갬
   - "Critical" 표기를 **긴급** 배지로 정규화
3. 정산팀 대시보드에 **확인 전 2건 · 긴급 1건** 배지
4. 상세에서 "확인" → AI 가 **다음 업무 초안 3~6개** 생성
5. 그중 결제팀이 해야 할 일을 **공유보드로 전달** (Jira 이슈 미리보기까지)
6. 애매한 부분은 **정보요청** → 페이팀 대시보드에 빨간 배지

---

## 트러블슈팅

| 증상 | 원인 |
|---|---|
| `PrismaClientInitializationError` | `DATABASE_URL` 없음 또는 `npx prisma db push` 안 함 |
| `prepared statement "s0" already exists` | 풀러 이슈. `DATABASE_URL` 뒤에 `&pgbouncer=true` 붙이기 |
| 첫 요청만 1초 넘게 걸림 | Neon 이 자다 깨는 중. 정상. 두 번째부터 빠릅니다 |
| `db push` 가 멈춘 채 안 끝남 | `DIRECT_URL` 에 `-pooler` 가 붙은 걸 넣었을 가능성. 빼야 합니다 |
| `Cannot find module '.prisma/client'` | `npx prisma generate` (또는 `npm install` 다시) |
| API 가 401 | `DEV_AUTH_BYPASS="true"` 인지, `x-baton-user` 이메일이 seed 에 있는 값인지 |
| API 가 403 `NOT_A_MEMBER` | 그 사용자가 그 워크스페이스 멤버가 아님. `/api/me` 로 내 워크스페이스 id 확인 |
| Notion `Could not find database` | integration 을 해당 DB 페이지에 초대 안 함 |
| `AI_DISABLED` | `.env` 에 `ANTHROPIC_API_KEY` 없음 |
