import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * 모든 API 응답은 아래 두 모양 중 하나입니다. 프론트는 이것만 믿으면 됩니다.
 *
 *   성공: { "ok": true,  "data": ... }
 *   실패: { "ok": false, "error": { "code": "...", "message": "사람이 읽을 메시지", "details"?: ... } }
 */
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, { status });
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json<ApiFailure>(
    { ok: false, error: { code, message, details } },
    { status },
  );
}

/** 라우트 핸들러를 감싸서 throw 된 에러를 일관된 JSON 으로 바꿔준다. */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) {
        return fail(e.status, e.code, e.message, e.details);
      }
      if (e instanceof ZodError) {
        return fail(400, "INVALID_BODY", "요청 형식이 올바르지 않습니다.", e.issues);
      }
      console.error("[api] unhandled", e);
      const message = e instanceof Error ? e.message : "알 수 없는 오류";
      return fail(500, "INTERNAL", message);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "JSON 본문을 읽을 수 없습니다.");
  }
}
