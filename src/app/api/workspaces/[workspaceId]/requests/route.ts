import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, readJson } from "@/lib/http";
import { scope } from "@/lib/workspace";
import { toRequestDTO } from "@/lib/serialize";
import type { RequestStatus } from "@prisma/client";

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/:workspaceId/requests
 * query: direction=INCOMING|OUTGOING, status=OPEN|ANSWERED|CLOSED
 *
 * 대시보드 빨간 배지 = direction=INCOMING & status=OPEN 의 개수.
 * (대시보드 API 의 badges.incomingRequests 로도 이미 내려갑니다)
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  await scope(req, workspaceId);

  const url = new URL(req.url);
  const direction = url.searchParams.get("direction");
  const statuses = url.searchParams.get("status")?.split(",").filter(Boolean) as
    | RequestStatus[]
    | undefined;

  const scopeWhere =
    direction === "OUTGOING"
      ? { fromWorkspaceId: workspaceId }
      : direction === "INCOMING"
        ? { toWorkspaceId: workspaceId }
        : { OR: [{ fromWorkspaceId: workspaceId }, { toWorkspaceId: workspaceId }] };

  const items = await prisma.request.findMany({
    where: {
      ...scopeWhere,
      ...(statuses?.length ? { status: { in: statuses } } : {}),
    },
    include: {
      fromWorkspace: true,
      toWorkspace: true,
      handoverItem: { select: { id: true, title: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return ok(items.map((r) => toRequestDTO(r, workspaceId)));
});

const CreateBody = z.object({
  question: z.string().min(1, "질문을 입력하세요.").max(2000),
  handoverItemId: z.string().optional(),
  boardItemId: z.string().optional(),
});

/**
 * POST /api/workspaces/:workspaceId/requests — 정보요청 보내기
 *
 * 김건희: 인수인계 상세의 "추가확인" 항목 옆 [요청] 버튼이 이걸 부릅니다.
 *   body: { question: 그 항목의 question 문자열, handoverItemId }
 * 같은 question 으로 다시 보내면 기존 요청을 돌려줍니다(중복 방지).
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  const { user, link, partner } = await scope(req, workspaceId);
  const body = CreateBody.parse(await readJson(req));

  if (!link || !partner) {
    throw new ApiError(409, "NO_PARTNER", "연결된 파트너 팀이 없습니다.");
  }

  const existing = await prisma.request.findFirst({
    where: {
      fromWorkspaceId: workspaceId,
      toWorkspaceId: partner.id,
      question: body.question,
      status: { not: "CLOSED" },
    },
    include: {
      fromWorkspace: true,
      toWorkspace: true,
      handoverItem: { select: { id: true, title: true } },
    },
  });
  if (existing) return ok(toRequestDTO(existing, workspaceId));

  const created = await prisma.request.create({
    data: {
      linkId: link.id,
      fromWorkspaceId: workspaceId,
      toWorkspaceId: partner.id,
      handoverItemId: body.handoverItemId ?? null,
      boardItemId: body.boardItemId ?? null,
      question: body.question,
      createdBy: user.name ?? user.email,
    },
    include: {
      fromWorkspace: true,
      toWorkspace: true,
      handoverItem: { select: { id: true, title: true } },
    },
  });

  return ok(toRequestDTO(created, workspaceId), 201);
});
