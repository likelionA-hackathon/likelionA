# Git 치트시트

레포: https://github.com/likelionA-hackathon/likelionA

**깃 처음이어도 괜찮습니다. 아래 두 줄만 지키면 복구 못 할 사고는 안 납니다.**

1. **작업 시작 전에 `git pull`** — 사고의 90%가 이걸 안 해서 납니다
2. **`git push -f` (force push) 절대 금지** — 남의 커밋이 사라집니다. 이건 되돌리기 어렵습니다

---

## 최초 1회 (10분)

```bash
git clone https://github.com/likelionA-hackathon/likelionA.git
cd likelionA

npm install

# .env 만들기 (Windows PowerShell 은 copy)
cp .env.example .env
# → DATABASE_URL 을 팀방에 공유된 값으로 채우세요. 각자 만들지 마세요.

npx prisma db push
npm run db:seed
npm run dev
```

`http://localhost:3000/api/me` 가 JSON 을 뱉으면 성공입니다.

> `.env` 는 `.gitignore` 에 들어 있어서 커밋되지 않습니다. **절대 강제로 커밋하지 마세요.**
> 여기엔 DB 비밀번호와 API 키가 들어갑니다. 한번 올라가면 히스토리에 영구히 남습니다.

---

## 담당 폴더

각자 자기 폴더만 만지면 충돌은 거의 안 납니다. 충돌은 **같은 파일의 같은 줄**을 동시에 고칠 때만 납니다.

| 담당 | 폴더 |
|---|---|
| 백지우 | `src/app/api/`, `src/lib/`, `src/types/`, `prisma/` |
| 전철우 | 로그인 · 팀생성 · 초대 · 대시보드 · 연결관리 화면 |
| 김건희 | 인수인계 상세 · 다음업무 · 공유보드 화면 |

**공용 파일**(`src/app/layout.tsx`, `globals.css`, `package.json`)을 고칠 땐 팀방에 한마디 남기고 고치세요.
`src/types/api.ts` 는 백지우만 수정합니다. 필요한 타입이 없으면 요청하세요.

---

## 매일 이 순서로

```bash
# ① 작업 시작 — 남이 올린 걸 먼저 받는다
git switch main
git pull

# ② 내 브랜치로 이동 (없으면 -c 로 만든다)
git switch -c feat/내이름       # 처음 한 번
git switch feat/내이름          # 그다음부터

# ③ 작업... 그리고 저장
git add .
git commit -m "feat: 대시보드 통계 카드 4개 붙임"
git push -u origin feat/내이름  # 처음 한 번
git push                        # 그다음부터
```

브랜치 이름은 `feat/jiwoo`, `feat/cheolwoo`, `feat/geonhee` 로 하겠습니다.

---

## main 에 합치기 (하루 2~3번)

**혼자 결정하지 말고 팀방에 "머지합니다" 한마디 남기고** 하세요.

```bash
git switch main
git pull                    # ← 반드시. 이거 없으면 충돌 확률이 올라갑니다
git merge feat/내이름
git push
git switch feat/내이름       # 다시 내 브랜치로 돌아오기
```

머지 후에는 **다른 사람들도 `git pull` 을 해야** 최신 코드를 받습니다. 팀방에 알려주세요.

---

## 커밋 메시지

형식만 맞추면 됩니다. 완벽하게 안 써도 돼요.

```
feat: 대시보드 통계 카드 붙임        새 기능
fix: 우선순위 배지 색 안 나오던 것 수정   버그 수정
style: 인수인계 카드 여백 조정        스타일만
refactor: 요약 블록 컴포넌트로 분리    동작 그대로, 구조만
docs: API 문서에 board 응답 예시 추가   문서
chore: 패키지 추가                   설정/잡일
```

`git commit -m "수정"` 같은 건 나중에 "언제 뭐가 됐지"를 못 찾게 됩니다. 한 문장이라도 뭘 했는지 쓰세요.

---

## 사고별 복구법

### 충돌(conflict)이 났다

당황할 일 아닙니다. git이 "여기 둘이 다르게 고쳤으니 정해줘"라고 묻는 겁니다.

```bash
git pull
# CONFLICT (content): Merge conflict in src/app/... 이라고 나옴
```

VSCode로 그 파일을 열면 이렇게 보입니다.

```
<<<<<<< HEAD
내가 쓴 코드
=======
남이 쓴 코드
>>>>>>> main
```

VSCode 우상단에 **Accept Current / Accept Incoming / Accept Both** 버튼이 뜹니다.
둘 다 필요하면 Accept Both, 하나만이면 해당 버튼. `<<<<<<<` `=======` `>>>>>>>` 줄은 **하나도 남기지 마세요.**

정리했으면:

```bash
git add .
git commit -m "merge: 충돌 해결"
git push
```

> 모르겠으면 **고치기 전에 팀방에 파일 이름과 충돌 부분을 캡처해서 올리세요.** 혼자 지우다 남의 코드를 날리는 게 최악입니다.

### 커밋 메시지를 잘못 썼다 (아직 push 안 함)

```bash
git commit --amend -m "제대로 쓴 메시지"
```

### 방금 커밋을 취소하고 싶다 (코드는 살리고)

```bash
git reset --soft HEAD~1
```

### 파일을 고쳤는데 그냥 원상복구하고 싶다

```bash
git restore src/app/어쩌고.tsx    # 이 파일만
git restore .                     # 전부 (주의: 저장 안 한 작업이 날아감)
```

### 커밋 안 한 작업이 있는데 급하게 main 을 받아야 한다

```bash
git stash          # 작업을 잠깐 치워둠
git pull
git stash pop      # 다시 꺼냄
```

### 뭔가 완전히 꼬였다

**절대 `push -f` 하지 마세요.** 대신:

```bash
git stash                     # 내 작업 보관
git log --oneline | head -10  # 지금 어디쯤인지 확인
```

하고 팀방에 `git log` 결과와 에러 메시지를 그대로 붙이세요. 커밋된 것은 거의 다 복구됩니다.

---

## 절대 하지 말 것

| | 왜 |
|---|---|
| `git push -f` / `--force` | 남의 커밋이 사라집니다. 복구가 제일 어렵습니다 |
| `.env` 커밋 | DB 비밀번호·API 키가 히스토리에 영구히 남습니다 |
| `node_modules` 커밋 | 수만 개 파일. `.gitignore` 에 있으니 그냥 두세요 |
| `git pull` 없이 작업 시작 | 충돌 원인 1위 |
| main 에서 바로 코딩 | 되돌리기가 어려워집니다. 브랜치에서 하세요 |
| 남의 폴더 파일 수정 | 꼭 필요하면 팀방에 먼저 말하세요 |

---

## 스키마를 고쳤다는 얘기가 들리면

백지우가 `prisma/schema.prisma` 를 고쳤다고 하면, `git pull` 후에 **반드시**:

```bash
npx prisma generate
npx prisma db push
```

안 하면 "타입은 맞는데 런타임에 컬럼이 없다"고 터집니다.
