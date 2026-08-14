import { ApiError } from "@/lib/http";

/**
 * Notion 연동 — Internal Integration Token 방식.
 *
 * SDK 대신 REST 를 직접 호출한다. 이유:
 *  - Notion 이 2025-09-03 버전에서 "data source" 개념을 넣으면서 DB 조회 경로가 바뀌었다.
 *    (databases/{id}/query  →  data_sources/{id}/query)
 *  - 두 버전을 모두 감당해야 해서, 우리가 직접 폴백을 제어하는 편이 안전하다.
 *
 * 준비 순서 (README 에도 적어둠):
 *  1. https://www.notion.so/my-integrations 에서 Internal Integration 생성 → 토큰 복사
 *  2. 인수인계용 Notion 데이터베이스 페이지 우상단 ⋯ → 연결 → 방금 만든 integration 초대
 *  3. 데이터베이스 URL 의 32자리 해시가 databaseId
 */

const NOTION_API = "https://api.notion.com/v1";
const NEW_VERSION = "2025-09-03";
const LEGACY_VERSION = "2022-06-28";

type NotionRichText = { plain_text?: string };
type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
};

export type NotionPageSummary = {
  pageId: string;
  title: string;
  url: string;
  lastEditedTime: string;
  /** 페이지 property 에서 긁어온 우선순위 표기 (있으면) */
  rawPriority: string | null;
  author: string | null;
  properties: Record<string, string>;
};

export type NotionPageContent = NotionPageSummary & {
  /** 블록을 마크다운 비슷하게 펼친 원문 */
  text: string;
};

async function notionFetch(
  path: string,
  token: string,
  init: RequestInit & { version?: string } = {},
) {
  const { version = NEW_VERSION, ...rest } = init;
  const res = await fetch(`${NOTION_API}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": version,
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (body as { message?: string }).message ?? `Notion API 오류 (${res.status})`;
    throw new ApiError(res.status === 401 ? 401 : 502, "NOTION_ERROR", message, body);
  }
  return body as Record<string, unknown>;
}

/** 데이터베이스의 data source id 를 찾는다. 구버전 DB 면 null (레거시 경로로 감). */
async function resolveDataSourceId(databaseId: string, token: string): Promise<string | null> {
  try {
    const db = await notionFetch(`/databases/${databaseId}`, token);
    const sources = db.data_sources as Array<{ id: string }> | undefined;
    if (Array.isArray(sources) && sources.length > 0) return sources[0].id;
  } catch {
    // 구버전 응답이면 여기로 떨어질 수 있다. 레거시 경로로 폴백.
  }
  return null;
}

function richTextToString(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return (value as NotionRichText[]).map((t) => t.plain_text ?? "").join("");
}

/** Notion property 하나를 사람이 읽을 문자열로. */
function propertyToString(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as Record<string, unknown>;
  switch (p.type) {
    case "title":
      return richTextToString(p.title);
    case "rich_text":
      return richTextToString(p.rich_text);
    case "select":
      return (p.select as { name?: string } | null)?.name ?? "";
    case "status":
      return (p.status as { name?: string } | null)?.name ?? "";
    case "multi_select":
      return ((p.multi_select as Array<{ name: string }>) ?? []).map((s) => s.name).join(", ");
    case "people":
      return ((p.people as Array<{ name?: string }>) ?? []).map((u) => u.name ?? "").filter(Boolean).join(", ");
    case "date":
      return (p.date as { start?: string } | null)?.start ?? "";
    case "number":
      return p.number == null ? "" : String(p.number);
    case "checkbox":
      return p.checkbox ? "true" : "false";
    case "url":
      return (p.url as string) ?? "";
    case "email":
      return (p.email as string) ?? "";
    case "formula": {
      const f = p.formula as Record<string, unknown> | null;
      if (!f) return "";
      return String(f.string ?? f.number ?? f.boolean ?? "");
    }
    default:
      return "";
  }
}

const PRIORITY_KEYS = ["우선순위", "priority", "중요도", "긴급도", "importance"];
const AUTHOR_KEYS = ["담당자", "작성자", "assignee", "owner", "person"];

function pickByKey(props: Record<string, string>, keys: string[]): string | null {
  for (const [name, value] of Object.entries(props)) {
    if (!value) continue;
    const lower = name.toLowerCase();
    if (keys.some((k) => lower === k.toLowerCase() || lower.includes(k.toLowerCase()))) {
      return value;
    }
  }
  return null;
}

function toPageSummary(page: Record<string, unknown>): NotionPageSummary {
  const rawProps = (page.properties ?? {}) as Record<string, unknown>;
  const properties: Record<string, string> = {};
  let title = "";

  for (const [name, prop] of Object.entries(rawProps)) {
    const value = propertyToString(prop);
    if (value) properties[name] = value;
    if ((prop as { type?: string })?.type === "title" && value) title = value;
  }

  return {
    pageId: page.id as string,
    title: title || "(제목 없음)",
    url: (page.url as string) ?? "",
    lastEditedTime: (page.last_edited_time as string) ?? new Date().toISOString(),
    rawPriority: pickByKey(properties, PRIORITY_KEYS),
    author: pickByKey(properties, AUTHOR_KEYS),
    properties,
  };
}

/** 데이터베이스에 있는 페이지 목록. 최근 수정순. */
export async function listDatabasePages(
  databaseId: string,
  token: string,
  limit = 20,
): Promise<NotionPageSummary[]> {
  const body = JSON.stringify({
    page_size: Math.min(limit, 100),
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });

  const dataSourceId = await resolveDataSourceId(databaseId, token);

  const result = dataSourceId
    ? await notionFetch(`/data_sources/${dataSourceId}/query`, token, {
        method: "POST",
        body,
      })
    : await notionFetch(`/databases/${databaseId}/query`, token, {
        method: "POST",
        body,
        version: LEGACY_VERSION,
      });

  const results = (result.results as Array<Record<string, unknown>>) ?? [];
  return results.filter((p) => p.object === "page").map(toPageSummary);
}

/** 블록 트리를 마크다운 비슷한 평문으로. 깊이는 2단계까지만 판다. */
async function blocksToText(
  blockId: string,
  token: string,
  depth = 0,
): Promise<string> {
  if (depth > 2) return "";

  const res = await notionFetch(`/blocks/${blockId}/children?page_size=100`, token).catch(
    () => null,
  );
  if (!res) return "";

  const blocks = (res.results as NotionBlock[]) ?? [];
  const lines: string[] = [];

  for (const block of blocks) {
    const payload = block[block.type] as Record<string, unknown> | undefined;
    const text = payload ? richTextToString(payload.rich_text) : "";
    const indent = "  ".repeat(depth);

    switch (block.type) {
      case "heading_1":
        lines.push(`\n# ${text}`);
        break;
      case "heading_2":
        lines.push(`\n## ${text}`);
        break;
      case "heading_3":
        lines.push(`\n### ${text}`);
        break;
      case "bulleted_list_item":
        lines.push(`${indent}- ${text}`);
        break;
      case "numbered_list_item":
        lines.push(`${indent}1. ${text}`);
        break;
      case "to_do": {
        const checked = payload?.checked ? "x" : " ";
        lines.push(`${indent}- [${checked}] ${text}`);
        break;
      }
      case "quote":
        lines.push(`> ${text}`);
        break;
      case "callout":
        lines.push(`> 💡 ${text}`);
        break;
      case "code":
        lines.push("```\n" + text + "\n```");
        break;
      case "toggle":
        lines.push(`${indent}▸ ${text}`);
        break;
      case "divider":
        lines.push("---");
        break;
      case "table_row": {
        const cells = (payload?.cells as unknown[]) ?? [];
        lines.push("| " + cells.map((c) => richTextToString(c)).join(" | ") + " |");
        break;
      }
      default:
        if (text) lines.push(`${indent}${text}`);
    }

    if (block.has_children && block.type !== "table_row") {
      const child = await blocksToText(block.id, token, depth + 1);
      if (child.trim()) lines.push(child);
    }
  }

  return lines.join("\n");
}

/** 페이지 1건의 원문 전체. */
export async function fetchPageContent(
  page: NotionPageSummary,
  token: string,
): Promise<NotionPageContent> {
  const bodyText = await blocksToText(page.pageId, token);

  const propLines = Object.entries(page.properties)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const text = [`# ${page.title}`, propLines, "", bodyText].filter(Boolean).join("\n");

  return { ...page, text: text.trim() };
}

/** 연결 테스트용. 성공하면 DB 제목을 돌려준다. */
export async function testNotionConnection(databaseId: string, token: string) {
  const db = await notionFetch(`/databases/${databaseId}`, token).catch(async () =>
    notionFetch(`/databases/${databaseId}`, token, { version: LEGACY_VERSION }),
  );
  const title = richTextToString(db.title) || "(제목 없음)";
  const dataSources = (db.data_sources as Array<{ id: string; name?: string }>) ?? [];
  return { title, apiVersion: dataSources.length ? NEW_VERSION : LEGACY_VERSION, dataSources };
}
