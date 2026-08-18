import { PrismaClient, Priority } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 뼈대 모드.
 *   npm run db:seed          → 데모 데이터까지 전부 (오프라인에서도 화면이 채워짐)
 *   npm run db:seed:clean    → 사용자·워크스페이스·파트너연결·커넥션만
 *
 * 뼈대 모드는 "화면에 보이는 인수인계가 전부 Notion→AI 를 실제로 통과한 것"
 * 이라고 말하기 위한 것입니다. 시연 직전에 이걸 돌리고 npm run notion:actions 를 이어서 돌리세요.
 */
const SKELETON =
  process.argv.includes("--skeleton") || process.env.SEED_SKELETON === "1";

/**
 * 데모 시나리오
 *
 *   페이팀(결제 백엔드)  ──Link──  정산팀(정산/운영)
 *
 *   페이팀이 PG 교체 작업을 하고 인수인계를 넘겼고, 정산팀이 그걸 받아
 *   다음 업무를 만들고, 일부를 다시 페이팀에 공유보드로 넘기고,
 *   모호한 부분은 정보요청으로 되묻는 상태.
 *
 * 로그인 없이 API 를 때릴 땐 헤더로 사람을 바꿉니다:
 *   x-baton-user: jiwoo@baton.dev     → 정산팀 (받는 쪽. 대부분의 화면은 이쪽)
 *   x-baton-user: cheolwoo@baton.dev  → 페이팀 (넘기는 쪽)
 */

const DEMO_USERS = [
  { email: "jiwoo@baton.dev", name: "백지우" },
  { email: "cheolwoo@baton.dev", name: "전철우" },
  { email: "geonhee@baton.dev", name: "김건희" },
];

async function main() {
  console.log("🌱 seed 시작");

  // 멱등하게: 데모 데이터 전부 지우고 다시 만든다.
  await prisma.request.deleteMany();
  await prisma.boardItem.deleteMany();
  await prisma.nextAction.deleteMany();
  await prisma.handoverItem.deleteMany();
  await prisma.link.deleteMany();
  await prisma.connection.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany({ where: { email: { in: DEMO_USERS.map((u) => u.email) } } });

  const users = await Promise.all(
    DEMO_USERS.map((u) =>
      prisma.user.create({ data: { email: u.email, name: u.name } }),
    ),
  );
  const [jiwoo, cheolwoo, geonhee] = users;

  // ── 워크스페이스 두 개 ────────────────────────────────
  const payTeam = await prisma.workspace.create({
    data: {
      name: "페이팀",
      slug: "pay-team",
      tagline: "결제 백엔드 · PG 연동",
      members: {
        create: [
          { userId: cheolwoo.id, role: "OWNER" },
          { userId: geonhee.id, role: "MEMBER" },
        ],
      },
      connections: {
        create: [
          {
            provider: "NOTION",
            status: "DISCONNECTED",
            displayName: "인수인계 DB",
            config: {},
          },
          {
            provider: "JIRA",
            status: "MOCK",
            displayName: "pmconnector.atlassian.net · PAY",
            config: { site: "pmconnector.atlassian.net", projectKey: "PAY" },
          },
        ],
      },
    },
  });

  const settleTeam = await prisma.workspace.create({
    data: {
      name: "정산팀",
      slug: "settle-team",
      tagline: "정산 · 운영 대응",
      members: {
        create: [
          { userId: jiwoo.id, role: "OWNER" },
          { userId: geonhee.id, role: "MEMBER" },
        ],
      },
      connections: {
        create: [
          {
            provider: "NOTION",
            status: "DISCONNECTED",
            displayName: "인수인계 DB",
            config: {},
          },
          {
            provider: "JIRA",
            status: "MOCK",
            displayName: "pmconnector.atlassian.net · STL",
            config: { site: "pmconnector.atlassian.net", projectKey: "STL" },
          },
        ],
      },
    },
  });

  // ── 파트너 연결 ──────────────────────────────────────
  const link = await prisma.link.create({
    data: {
      workspaceAId: payTeam.id,
      workspaceBId: settleTeam.id,
      status: "ACTIVE",
      inviteCode: "BATON123",
      createdById: cheolwoo.id,
      acceptedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    },
  });

  // 아직 수락 안 된 초대 하나 (초대 링크 화면 테스트용)
  await prisma.link.create({
    data: {
      workspaceAId: settleTeam.id,
      status: "PENDING",
      inviteCode: "NEWTEAM7",
      createdById: jiwoo.id,
    },
  });

  const daysAgo = (n: number) => new Date(Date.now() - 1000 * 60 * 60 * 24 * n);

  if (!SKELETON) {
    // ── 인수인계 4건 (페이팀 → 정산팀) ────────────────────
    const handovers = [
      {
        title: "PG 교체 (토스페이먼츠 → 나이스페이) 1차 이관 완료",
        author: "전철우",
        rawPriority: "Critical",
        priority: Priority.URGENT,
        priorityReason: '원본 표기 "Critical" → 긴급',
        status: "NEW" as const,
        occurredAt: daysAgo(1),
        summary: [
          "결제 승인/취소 경로는 나이스페이로 전량 이관 완료. 8/12 02:00 부터 신규 결제는 전부 나이스페이로 나간다.",
          "정기결제(빌링)는 아직 토스 잔존. 기존 빌링키 마이그레이션이 안 끝나서 9월 첫 주까지 이중 운영.",
          "취소 API 응답 스펙이 달라짐 — 부분취소 시 나이스는 잔액을 안 내려준다. 정산 배치에서 잔액을 직접 계산해야 함.",
          "8/12~8/13 사이 결제건은 두 PG 에 섞여 있음. 이 구간 정산은 수기 대사 필요.",
        ].join("\n"),
        workContext: [
          "토스페이먼츠 수수료 재계약이 결렬돼 7월 말에 PG 교체가 확정됐다.",
          "결제 경로 이관이 먼저였고, 정산/대사 로직은 정산팀이 이어받는 것으로 역할을 나눴다.",
        ].join("\n"),
        changes: [
          {
            type: "changed",
            text: "취소 API 응답에서 remainingAmount 필드가 사라짐",
            impact: "정산 배치의 잔액 검증 로직이 그대로면 부분취소 건에서 전부 실패한다. 계산식으로 대체 필요.",
          },
          {
            type: "changed",
            text: "결제 고유번호 포맷 변경 (tosspay_xxx → np_xxxxxxxx)",
            impact: "고객센터 조회 화면과 대사 스크립트의 정규식이 안 먹는다.",
          },
          {
            type: "added",
            text: "나이스페이 웹훅 엔드포인트 신설 (/webhooks/nicepay)",
            impact: "웹훅 재시도 정책이 5회/지수백오프. 중복 수신 방어가 정산 쪽에도 필요하다.",
          },
          {
            type: "removed",
            text: "토스 정산 리포트 일배치 제거 예정 (9월 첫 주)",
            impact: "빌링 이관이 끝나기 전에 지우면 정기결제 정산이 비므로 순서를 지켜야 한다.",
          },
        ],
        openQuestions: [
          {
            question: "8/12~8/13 혼재 구간의 대사 기준일을 승인일로 볼지 매입일로 볼지?",
            why: "두 PG 의 매입 시각이 달라서 기준을 안 정하면 양쪽 리포트가 안 맞는다.",
          },
          {
            question: "부분취소 잔액을 우리가 계산한 값과 나이스 리포트 값이 다르면 뭘 정답으로 하나?",
            why: "차이가 났을 때 누가 판단하는지 정해두지 않으면 매일 막힌다.",
          },
          {
            question: "빌링 이중 운영 기간에 고객센터 조회는 어느 쪽 기준으로 안내하나?",
            why: "CS 스크립트를 미리 고쳐둬야 한다.",
          },
        ],
      },
      {
        title: "정산 배치 스케줄 변경 (03:00 → 05:30)",
        author: "전철우",
        rawPriority: "P1",
        priority: Priority.HIGH,
        priorityReason: '원본 표기 "P1" → 높음',
        status: "NEW" as const,
        occurredAt: daysAgo(2),
        summary: [
          "나이스페이 매입 확정이 새벽 4시 이후라 기존 03:00 배치로는 전날 건이 안 잡힌다.",
          "배치 시작을 05:30 으로 미뤘고, 리포트 생성은 06:30 완료 목표.",
          "이에 따라 오전 회의용 정산 대시보드 갱신 시각도 07:00 로 밀린다.",
        ].join("\n"),
        workContext:
          "PG 교체로 매입 확정 시각이 바뀌면서 기존 배치 시각이 의미가 없어졌다. 운영팀 아침 리포트 시간과 충돌하지 않는 선에서 가장 이른 시각으로 잡았다.",
        changes: [
          {
            type: "changed",
            text: "정산 배치 cron 03:00 → 05:30 (KST)",
            impact: "07:00 이전에 리포트를 보는 사람이 있으면 빈 화면을 본다. 운영팀에 공지 필요.",
          },
          {
            type: "added",
            text: "배치 실패시 슬랙 #settle-alert 알림 추가",
            impact: "알림 수신자에 정산팀 온콜을 넣어야 한다.",
          },
        ],
        openQuestions: [
          {
            question: "05:30 배치가 실패하면 재시도를 자동으로 돌릴지, 사람이 판단할지?",
            why: "매입 데이터가 덜 들어온 상태에서 재시도하면 같은 실패가 반복된다.",
          },
        ],
      },
      {
        title: "환불 정책 문구 업데이트 (약관 개정 반영)",
        author: "김건희",
        rawPriority: "보통",
        priority: Priority.NORMAL,
        priorityReason: '원본 표기 "보통" → 보통',
        status: "ACKNOWLEDGED" as const,
        occurredAt: daysAgo(6),
        summary: [
          "9/1 약관 개정에 맞춰 환불 안내 문구를 결제/마이페이지/이메일 3곳에서 교체했다.",
          "정산 로직에는 영향 없음. 문구만 바뀌었고 계산식은 그대로다.",
          "이메일 템플릿은 스테이징까지만 반영, 운영 배포는 8/28 예정.",
        ].join("\n"),
        workContext:
          "법무 검토를 거친 약관 개정본이 9/1 발효라, 그 전에 사용자 노출 문구를 전부 맞춰두는 작업이었다.",
        changes: [
          {
            type: "changed",
            text: "환불 처리 기간 안내: '영업일 3~5일' → '영업일 5~7일'",
            impact: "CS 응대 스크립트도 같은 문구로 맞춰야 한다.",
          },
        ],
        openQuestions: [],
      },
      {
        title: "결제 실패 로그 스키마 정리 (nice to have)",
        author: "전철우",
        rawPriority: "backlog",
        priority: Priority.LOW,
        priorityReason: '원본 표기 "backlog" → 낮음',
        status: "ACKNOWLEDGED" as const,
        occurredAt: daysAgo(9),
        summary: [
          "PG 별로 실패 사유 코드 체계가 달라서 로그가 파편화되어 있다.",
          "공통 failureReason enum 을 제안만 해둔 상태. 구현은 안 됐다.",
          "급하지 않지만, 나중에 실패율 대시보드를 만들 거면 먼저 정리하는 게 싸다.",
        ].join("\n"),
        workContext:
          "장애 분석 때마다 PG 별 코드표를 따로 찾아보느라 시간이 걸려서, 정리 필요성만 기록해둔 항목.",
        changes: [],
        openQuestions: [
          {
            question: "실패 사유 통합 enum 을 정산팀이 가져갈지, 결제팀이 계속 들고 갈지?",
            why: "소유 팀이 정해져야 스키마 변경 PR 을 어디로 올릴지 정해진다.",
          },
        ],
      },
    ];

    const createdHandovers = [];
    // 주의: sourceRef 를 createdHandovers.length 로 만들면 타입이 순환 참조가 되어
    // (배열 타입 ← row ← 배열 길이) 빌드 시 TS7022 가 납니다. 인덱스를 따로 셉니다.
    let handoverIndex = 0;
    for (const h of handovers) {
      handoverIndex += 1;
      const row = await prisma.handoverItem.create({
        data: {
          workspaceId: settleTeam.id, // 받는 쪽 = 정산팀
          linkId: link.id,
          sourceProvider: "NOTION",
          sourceRef: `demo-${handoverIndex}`,
          sourceUrl: "https://www.notion.so/demo-handover",
          sourceEditedAt: h.occurredAt,
          title: h.title,
          author: h.author,
          rawContent: [
            `# ${h.title}`,
            `- 작성자: ${h.author}`,
            `- 우선순위: ${h.rawPriority}`,
            "",
            "## 진행 상황",
            h.summary,
            "",
            "## 배경",
            h.workContext,
          ].join("\n"),
          summary: h.summary,
          changes: h.changes as never,
          workContext: h.workContext,
          openQuestions: h.openQuestions as never,
          aiModel: "claude-haiku-4-5-20251001",
          aiGeneratedAt: h.occurredAt,
          rawPriority: h.rawPriority,
          priority: h.priority,
          priorityReason: h.priorityReason,
          status: h.status,
          acknowledgedAt: h.status === "ACKNOWLEDGED" ? h.occurredAt : null,
          acknowledgedById: h.status === "ACKNOWLEDGED" ? jiwoo.id : null,
          occurredAt: h.occurredAt,
        },
      });
      createdHandovers.push(row);
    }

    const [pgHandover, batchHandover, refundHandover] = createdHandovers;

    // ── 다음 업무 ────────────────────────────────────────
    const actions = [
      {
        handoverItemId: pgHandover.id,
        title: "정산 배치의 잔액 검증 로직을 계산식으로 교체하기",
        description:
          "나이스페이 취소 응답에 remainingAmount 가 없어서 현재 로직은 부분취소 건에서 전부 실패한다. 승인금액 - 누적취소금액으로 계산하도록 바꾼다.",
        assignee: "백지우",
        priority: Priority.URGENT,
        status: "DOING" as const,
        origin: "AI" as const,
        aiDraft: false,
      },
      {
        handoverItemId: pgHandover.id,
        title: "8/12~8/13 혼재 구간 수기 대사 스크립트 만들기",
        description: "두 PG 에 결제건이 섞여 있는 이틀치. 기준일 정의가 확정되면 바로 돌릴 수 있게 준비.",
        assignee: "백지우",
        priority: Priority.URGENT,
        status: "TODO" as const,
        origin: "AI" as const,
        aiDraft: true,
      },
      {
        handoverItemId: pgHandover.id,
        title: "고객센터 조회 화면의 결제번호 정규식 수정하기",
        description: "tosspay_ 접두사 가정이 하드코딩되어 있음. np_ 도 받도록.",
        assignee: null,
        priority: Priority.HIGH,
        status: "TODO" as const,
        origin: "AI" as const,
        aiDraft: true,
      },
      {
        handoverItemId: batchHandover.id,
        title: "정산 대시보드 갱신 시각 07:00 로 공지하기",
        description: "운영팀 아침 회의 전에 빈 화면을 보지 않도록 사전 공지.",
        assignee: "김건희",
        priority: Priority.HIGH,
        status: "TODO" as const,
        origin: "AI" as const,
        aiDraft: true,
      },
      {
        handoverItemId: batchHandover.id,
        title: "#settle-alert 채널에 정산팀 온콜 추가하기",
        description: null,
        assignee: "김건희",
        priority: Priority.NORMAL,
        status: "DONE" as const,
        origin: "MANUAL" as const,
        aiDraft: false,
      },
      {
        handoverItemId: refundHandover.id,
        title: "CS 응대 스크립트 환불 기간 문구 맞추기",
        description: "영업일 3~5일 → 5~7일.",
        assignee: null,
        priority: Priority.NORMAL,
        status: "TODO" as const,
        origin: "AI" as const,
        aiDraft: true,
      },
      {
        handoverItemId: null,
        title: "9월 정산 마감 일정 확정하기",
        description: "PG 이중 운영 종료 시점과 맞물려서 미리 정해야 함.",
        assignee: "백지우",
        priority: Priority.NORMAL,
        status: "TODO" as const,
        origin: "MANUAL" as const,
        aiDraft: false,
      },
    ];

    const createdActions = [];
    for (const a of actions) {
      createdActions.push(
        await prisma.nextAction.create({
          data: { workspaceId: settleTeam.id, ...a },
        }),
      );
    }

    // ── 공유보드 (정산팀 → 페이팀) ────────────────────────
    // 실제 Jira Cloud REST API v3 가 받는 형식 그대로. (description 은 ADF)
  const jiraPreview = (
    site: string,
    project: string,
    summary: string,
    description: string,
    priority: string,
  ) => ({
    method: "POST",
    url: `https://${site}/rest/api/3/issue`,
    body: {
      fields: {
        project: { key: project },
        issuetype: { name: "Task" },
        summary,
        description: {
          type: "doc",
          version: 1,
          content: [`${description}`, "PM Connector 에서 전달됨"].map((t) => ({
            type: "paragraph",
            content: [{ type: "text", text: t }],
          })),
        },
        priority: { name: priority },
        labels: ["PM Connector", "handover"],
        assignee: null,
      },
    },
    display: {
      project,
      issueType: "Task",
      summary,
      description,
      priority,
      labels: ["PM Connector", "handover"],
      assignee: null,
    },
  });

  await prisma.boardItem.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: settleTeam.id,
        toWorkspaceId: payTeam.id,
        nextActionId: createdActions[2].id,
        title: "고객센터 조회 화면의 결제번호 정규식 수정",
        body: "결제번호 포맷을 바꾼 쪽이 결제팀이라 화면 수정도 같이 가져가는 게 맞을 것 같습니다.",
        priority: Priority.HIGH,
        status: "SHARED",
        sharedAt: daysAgo(1),
        targetSystem: "JIRA",
        targetPayload: jiraPreview(
          "pmconnector.atlassian.net",
          "PAY",
          "고객센터 조회 화면의 결제번호 정규식 수정",
          "tosspay_ 접두사 가정이 하드코딩되어 있음. np_ 도 받도록.",
          "High",
        ),
      },
    });

    await prisma.boardItem.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: settleTeam.id,
        toWorkspaceId: payTeam.id,
        title: "나이스페이 웹훅 중복 수신 방어 로직 확인 요청",
        body: "재시도 5회 정책이면 정산 쪽에서도 중복이 들어옵니다. 결제 쪽에서 dedupe 키를 내려줄 수 있는지 확인 부탁드립니다.",
        priority: Priority.URGENT,
        status: "DRAFT",
        targetSystem: "JIRA",
        targetPayload: jiraPreview(
          "pmconnector.atlassian.net",
          "PAY",
          "나이스페이 웹훅 중복 수신 방어 로직 확인",
          "재시도 5회/지수백오프 정책. dedupe 키 제공 가능 여부 확인 필요.",
          "Highest",
        ),
      },
    });

    // 페이팀이 정산팀에 넘긴 것 (INCOMING 방향 테스트용)
    await prisma.boardItem.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: payTeam.id,
        toWorkspaceId: settleTeam.id,
        title: "토스 정산 리포트 배치 제거 시점 확인",
        body: "9월 첫 주에 지울 예정인데, 빌링 이관 끝나는 시점과 겹치지 않는지 확인 부탁드립니다.",
        priority: Priority.HIGH,
        status: "SHARED",
        sharedAt: daysAgo(2),
        targetSystem: "JIRA",
        targetPayload: jiraPreview(
          "pmconnector.atlassian.net",
          "STL",
          "토스 정산 리포트 배치 제거 시점 확인",
          "빌링 이관 완료 시점과의 순서 확인.",
          "High",
        ),
      },
    });

    // ── 정보요청 ─────────────────────────────────────────
    await prisma.request.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: settleTeam.id,
        toWorkspaceId: payTeam.id,
        handoverItemId: pgHandover.id,
        question: "8/12~8/13 혼재 구간의 대사 기준일을 승인일로 볼지 매입일로 볼지?",
        status: "OPEN",
        createdBy: "백지우",
        createdAt: daysAgo(1),
      },
    });

    await prisma.request.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: settleTeam.id,
        toWorkspaceId: payTeam.id,
        handoverItemId: pgHandover.id,
        question: "부분취소 잔액을 우리가 계산한 값과 나이스 리포트 값이 다르면 뭘 정답으로 하나?",
        answer:
          "나이스 리포트를 정답으로 봅니다. 차이가 나면 #settle-alert 에 올려주시면 결제팀에서 원장 확인하겠습니다.",
        status: "ANSWERED",
        createdBy: "백지우",
        createdAt: daysAgo(2),
        answeredAt: daysAgo(1),
      },
    });

    // 페이팀 → 정산팀 방향 요청 (페이팀 대시보드 배지 테스트용)
    await prisma.request.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: payTeam.id,
        toWorkspaceId: settleTeam.id,
        question: "정산 배치 05:30 으로 미뤄도 운영팀 아침 리포트에 문제 없나요?",
        status: "OPEN",
        createdBy: "전철우",
        createdAt: daysAgo(1),
      },
    });

  } else {
    // 뼈대 모드: 인수인계·업무는 만들지 않는다 (Notion 에서 받아올 것)
    // 다만 공유보드와 정보요청이 완전히 비면 화면이 허전하므로,
    // 인수인계에 묶이지 않는 최소한의 "주고받은 흔적"만 남긴다.
    await prisma.boardItem.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: payTeam.id,
        toWorkspaceId: settleTeam.id,
        title: "토스 정산 리포트 배치 제거 시점 확인",
        body: "9월 첫 주에 지울 예정인데, 빌링 이관 끝나는 시점과 겹치지 않는지 확인 부탁드립니다.",
        priority: Priority.HIGH,
        status: "SHARED",
        sharedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
        targetSystem: "JIRA",
        targetPayload: {
          method: "POST",
          url: "https://pmconnector.atlassian.net/rest/api/3/issue",
          body: {
            fields: {
              project: { key: "STL" },
              issuetype: { name: "Task" },
              summary: "토스 정산 리포트 배치 제거 시점 확인",
              description: {
                type: "doc",
                version: 1,
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "빌링 이관 완료 시점과의 순서 확인." }] },
                  { type: "paragraph", content: [{ type: "text", text: "PM Connector 에서 전달됨" }] },
                ],
              },
              priority: { name: "High" },
              labels: ["PM Connector", "handover"],
              assignee: null,
            },
          },
          display: {
            project: "STL",
            issueType: "Task",
            summary: "토스 정산 리포트 배치 제거 시점 확인",
            description: "빌링 이관 완료 시점과의 순서 확인.",
            priority: "High",
            labels: ["PM Connector", "handover"],
            assignee: null,
          },
        },
      },
    });

    await prisma.request.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: payTeam.id,
        toWorkspaceId: settleTeam.id,
        question: "정산 배치를 05:30 으로 미뤄도 운영팀 아침 리포트에 문제 없나요?",
        status: "OPEN",
        createdBy: "전철우",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      },
    });

    await prisma.request.create({
      data: {
        linkId: link.id,
        fromWorkspaceId: settleTeam.id,
        toWorkspaceId: payTeam.id,
        question: "부분취소 잔액이 우리 계산값과 나이스 리포트 값이 다르면 뭘 정답으로 하나요?",
        answer:
          "나이스 리포트를 정답으로 봅니다. 차이가 나면 #settle-alert 에 올려주시면 결제팀에서 원장 확인하겠습니다.",
        status: "ANSWERED",
        createdBy: "백지우",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
        answeredAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      },
    });
  }

  console.log(SKELETON ? "✅ seed 완료 (뼈대 모드 — 인수인계/업무 없음)" : "✅ seed 완료");
  console.log(`   페이팀   ${payTeam.id}   (x-baton-user: cheolwoo@baton.dev)`);
  console.log(`   정산팀   ${settleTeam.id}   (x-baton-user: jiwoo@baton.dev)  ← 화면 대부분 이쪽`);
  console.log(`   초대코드 BATON123 (사용됨) / NEWTEAM7 (미사용)`);
  if (SKELETON) {
    console.log("");
    console.log("   다음: npm run notion:actions  로 Notion 에서 인수인계를 받아오세요.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
