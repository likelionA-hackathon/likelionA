import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handler, ok, readJson } from "@/lib/http";
import { scope } from "@/lib/workspace";
import { toNextActionDTO } from "@/lib/serialize";
import type { ActionStatus, Priority } from "@prisma/client";

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/:workspaceId/next-actions
 * query: status=TODO|DOING|DONE (콤마 다중), priority=..., assignee=..., q=..., handoverId=...
 *
 * 김건희: 다음 업무 화면의 상태 탭은 status 쿼리로, 필터는 priority/assignee 로 붙이면 됩니다.
 * 탭 카운트가 필요하면 status 없이 한 번 받아서 프론트에서 세는 게 호출 수가 적습니다.
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  await scope(req, workspaceId);

  const url = new URL(req.url);
  const statuses = url.searchParams.get("status")?.split(",").filter(Boolean) as
    | ActionStatus[]
    | undefined;
  const priorities = url.searchParams.get("priority")?.split(",").filter(Boolean) as
    | Priority[]
    | undefined;
  const assignee = url.searchParams.get("assignee")?.trim();
  const handoverId = url.searchParams.get("handoverId")?.trim();
  const q = url.searchParams.get("q")?.trim();

  const items = await prisma.nextAction.findMany({
    where: {
      workspaceId,
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(priorities?.length ? { priority: { in: priorities } } : {}),
      ...(assignee ? { assignee: { contains: assignee, mode: "insensitive" as const } } : {}),
      ...(handoverId ? { handoverItemId: handoverId } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    include: { handoverItem: { select: { id: true, title: true } } },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
  });

  return ok(items.map(toNextActionDTO));
});

const CreateBody = z.object({
  title: z.string().min(1, "업무 제목을 입력하세요.").max(200),
  description: z.string().max(4000).optional(),
  assignee: z.string().max(50).optional(),
  priority: z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]).default("NORMAL"),
  status: z.enum(["TODO", "DOING", "DONE"]).default("TODO"),
  /** ISO 8601 문자열 (예: "2026-08-20T00:00:00.000Z") */
  dueDate: z.string().optional(),
  handoverItemId: z.string().optional(),
});

/** POST /api/workspaces/:workspaceId/next-actions — "업무 추가" 버튼 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  await scope(req, workspaceId);
  const body = CreateBody.parse(await readJson(req));

  const created = await prisma.nextAction.create({
    data: {
      workspaceId,
      title: body.title,
      description: body.description ?? null,
      assignee: body.assignee ?? null,
      priority: body.priority,
      status: body.status,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      handoverItemId: body.handoverItemId ?? null,
      origin: "MANUAL",
      aiDraft: false,
    },
    include: { handoverItem: { select: { id: true, title: true } } },
  });

  return ok(toNextActionDTO(created), 201);
});
