# 배포 (Vercel)

담당: 백지우

**마지막 날에 하지 마세요.** 배포는 항상 처음에 한 번 사고가 납니다.
미리 뚫어두면 그다음부터는 `git push` 만으로 자동 배포됩니다.
두 분이 만든 화면도 푸시할 때마다 올라가서 서로 진행 상황을 눈으로 볼 수 있습니다.

---

## 1. 프로젝트 연결 (5분)

1. <https://vercel.com> → **Continue with GitHub** 로 로그인
2. **Add New… → Project**
3. `likelionA-hackathon/likelionA` 선택 → **Import**
   - 조직 레포가 안 보이면 "Adjust GitHub App Permissions" 에서 Org 접근을 허용해야 합니다
4. Framework 는 **Next.js** 로 자동 인식됩니다. Build 설정은 건드리지 마세요.
   - `package.json` 의 `build` 가 이미 `prisma generate && next build` 입니다

**아직 Deploy 누르지 마세요.** 환경변수부터 넣어야 합니다.

---

## 2. 환경변수 (중요)

Import 화면의 **Environment Variables** 를 펼치고 아래를 넣습니다.
`.env` 에 있는 값을 그대로 복사하면 됩니다.

| 이름 | 값 | 없으면 |
|---|---|---|
| `DATABASE_URL` | `.env` 와 동일 (`-pooler` 붙은 것) | 500 에러 |
| `DIRECT_URL` | `.env` 와 동일 (`-pooler` 없는 것) | 빌드 실패 |
| `DEV_AUTH_BYPASS` | `true` | 로그인 전까지 API 가 전부 401 |
| `DEV_USER_EMAIL` | `jiwoo@baton.dev` | 위와 동일 |
| `OPENAI_API_KEY` | `.env` 와 동일 | Notion 동기화·액션 생성만 안 됨 |
| `OPENAI_MODEL` | `gpt-5.6-luna` | 기본값으로 동작 |
| `NOTION_TOKEN` | `.env` 와 동일 | Notion 동기화만 안 됨 |
| `NOTION_DATABASE_ID` | `.env` 와 동일 | 위와 동일 |
| `AUTH_SECRET` | `npx auth secret` 결과 | 로그인 붙일 때 필요 |
| `AUTH_URL` | 배포 후 받은 주소 | 로그인 붙일 때 필요 |
| `DEMO_AUTO_JOIN` | `true` | **없으면 심사위원이 로그인해도 빈 화면만 봅니다** |
| `DEMO_WORKSPACE_SLUG` | `settle-team` | 데모 데이터가 있는 팀 |

> `NEXT_PUBLIC_BASE_URL` 은 **넣지 않아도 됩니다.**
> Vercel 이 주는 `VERCEL_URL` 을 코드가 알아서 씁니다.

넣고 **Deploy** 를 누르면 2~3분 뒤 주소가 나옵니다.

---

## 3. 배포 확인

```
https://<프로젝트명>.vercel.app/api/me
```

JSON 이 나오면 성공입니다. 안 나오면 Vercel 대시보드의
**Deployments → 해당 배포 → Runtime Logs** 에서 원인을 보세요.

### 흔한 실패

| 증상 | 원인 |
|---|---|
| 빌드 중 `Environment variable not found: DIRECT_URL` | `DIRECT_URL` 을 안 넣음 |
| 500 + `Can't reach database server` | `DATABASE_URL` 에 `-pooler` 가 없음. 서버리스에서는 풀러가 필수 |
| 401 `UNAUTHENTICATED` | `DEV_AUTH_BYPASS` 를 `true` 로 안 넣음 |
| 첫 요청만 5초 이상 | Neon 이 자다 깨는 중 + 콜드 스타트. 두 번째부터 정상 |

---

## 4. 이후

`main` 에 푸시하면 자동 배포됩니다. 브랜치를 푸시하면 미리보기 주소가 따로 생겨서,
두 분이 각자 화면을 확인하고 링크로 공유할 수 있습니다.

---

## 5. 제출 전 체크리스트

- [ ] `DEV_AUTH_BYPASS` 를 `false` 로 바꾸고 Google 로그인으로 한 번 완주
      (지금은 주소만 알면 누구나 API 를 부를 수 있는 상태입니다. 데이터가 전부
       가짜라 데모 기간엔 문제없지만, 제출 전에는 꺼야 합니다)
- [ ] `AUTH_URL` 을 실제 배포 주소로 설정
- [ ] Google OAuth 승인된 리디렉션 URI 에
      `https://<주소>/api/auth/callback/google` 추가
- [ ] 데모 직전 아무 API 나 한 번 호출해 Neon 을 깨워두기
- [ ] `DEMO_AUTO_JOIN` 이 켜져 있는지 확인 (심사위원 로그인 시 데모 데이터가 보여야 함)
