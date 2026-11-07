import { NextResponse } from "next/server";
import {
  translateBatchWithConfiguredProvider,
  translationBatchRequestSchema,
} from "@/features/report/translation.server";
import { apiHeaders, isTrustedSameOrigin, limitRequest } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isTrustedSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin translation requests are not allowed." },
      { status: 403, headers: apiHeaders() },
    );
  }
  // Production remains tightly throttled. Development gets enough room for
  // repeat QA runs without using the same small bucket as a real user.
  const rateLimit = limitRequest(
    request,
    "translate-batch",
    process.env.NODE_ENV === "development" ? 30 : 10,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many translation requests. Please try again shortly." },
      { status: 429, headers: apiHeaders(rateLimit) },
    );
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Expected a JSON request." },
      { status: 415, headers: apiHeaders(rateLimit) },
    );
  }
  const parsed = translationBatchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join(".") : "request";
    return NextResponse.json(
      { error: `Invalid translation batch at ${path}: ${issue?.message ?? "invalid input"}` },
      { status: 400, headers: apiHeaders(rateLimit) },
    );
  }
  return NextResponse.json(await translateBatchWithConfiguredProvider(parsed.data.requests), {
    headers: apiHeaders(rateLimit),
  });
}
