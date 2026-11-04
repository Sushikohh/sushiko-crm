import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { processBrevoEvent } from "@/lib/services/email";

/** Brevo Transactional Webhook. Absicherung über geheimes Token (Query oder Bearer). Idempotent. */
const eventSchema = z.object({
  event: z.string(),
  email: z.string(),
  id: z.union([z.number(), z.string()]).optional(),
  "message-id": z.string().optional(),
  date: z.string().optional(),
  ts_event: z.number().optional(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!env.BREVO_WEBHOOK_SECRET) return NextResponse.json({ error: "Webhook nicht konfiguriert" }, { status: 503 });
  const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(token, env.BREVO_WEBHOOK_SECRET)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const json = await req.json().catch(() => null);
  const list = Array.isArray(json) ? json : [json];
  let processed = 0;
  for (const raw of list) {
    const parsed = eventSchema.safeParse(raw);
    if (!parsed.success) continue;
    try {
      await processBrevoEvent(parsed.data);
      processed++;
    } catch (err) {
      logger.error("Brevo-Ereignis fehlgeschlagen", { err });
      return NextResponse.json({ error: "Verarbeitung fehlgeschlagen" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, processed });
}
