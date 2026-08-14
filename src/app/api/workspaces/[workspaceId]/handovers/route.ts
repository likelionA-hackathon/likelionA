import { prisma } from "@/lib/prisma";
import { handler, ok } from "@/lib/http";
import { scope } from "@/lib/workspace";
import { toHandoverListDTO } from "@/lib/serialize";
import type { HandoverStatus, Priority } from "@prisma/client";

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/:workspaceId/handovers
 * query:
 *   status=NEW|ACKNOWLEDGED|ARCHIVED   (여러 개면 콤마)
 *   priority=URGENT|HIGH|NORMAL|LOW    (여러 개면 콤마)
 *   q=검색어                            (제목/요약 부분일치)
 *   take=20
 *
 * 기본 정렬: 확인 전 → 우선순위 높은 순 → 최신순
 */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { workspaceId } = await ctx.params;
  await scope(req, workspaceId);

  const url = new URL(req.url);
  const statuses = url.searchParams.get("status")?.split(",").filter(Boolean) as
    | HandoverStatus[]
    | undefined;
  const priorities = url.searchParams.get("priority")?.split(",").filter(Boolean) as
    | Priority[]
    | undefined;
  const q = url.searchParams.get("q")?.trim();
  const take = Math.min(Number(url.searchParams.get("take") ?? 50), 100);

  const items = await prisma.handoverItem.findMany({
    where: {
      workspaceId,
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(priorities?.length ? { priority: { in: priorities } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { summary: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      link: { include: { workspaceA: true, workspaceB: true } },
      _count: { select: { nextActions: true } },
    },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { occurredAt: "desc" }],
    take,
  });

  return ok(items.map((h) => toHandoverListDTO(h, workspaceId)));
});
