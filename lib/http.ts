import { NextResponse } from "next/server";

export const ok = (data: Record<string, unknown> = {}, status = 200) =>
  NextResponse.json({ ok: true, ...data }, { status });

export const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error: { code, message }, ...extra }, { status });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
  return parsed as Record<string, unknown>;
}

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";
export const RECEIPT_RE = /^ORD\w{6,40}$/;
