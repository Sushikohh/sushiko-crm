import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/services/settings";
import { unsubscribeByToken } from "@/lib/services/email";

/**
 * Abmeldung von Werbe-E-Mails ohne Login.
 * GET: Bestätigungsseite (kein automatisches Abmelden durch Link-Scanner).
 * POST: Abmeldung – auch als One-Click nach RFC 8058 (List-Unsubscribe-Post).
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function page(title: string, body: string) {
  const id = await getSetting("sender_identity").catch(() => null);
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#111827;margin:0;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px;max-width:440px;width:calc(100% - 32px);box-shadow:0 1px 2px rgba(0,0,0,.04)}
h1{font-size:20px;margin:0 0 8px}p{color:#4b5563;line-height:1.5;font-size:14px}button{background:#111827;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer}
small{display:block;margin-top:24px;color:#9ca3af;font-size:12px}
@media (prefers-color-scheme:dark){body{background:#0f1115;color:#f3f4f6}main{background:#171a21;border-color:#262a33}p{color:#9ca3af}button{background:#f3f4f6;color:#111827}}</style></head>
<body><main><h1>${esc(title)}</h1>${body}${id ? `<small>${esc(id.companyName)} · ${esc(id.street)}, ${esc(id.postalCode)} ${esc(id.city)}</small>` : ""}</main></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [msg] = await db.select({ to: schema.emailMessages.toEmails }).from(schema.emailMessages).where(eq(schema.emailMessages.unsubscribeToken, token)).limit(1);
  if (!msg) return page("Link ungültig", "<p>Dieser Abmeldelink ist ungültig oder abgelaufen. Antworten Sie alternativ einfach auf unsere E-Mail mit „Abmelden“.</p>");
  return page(
    "Abmelden",
    `<p>Möchten Sie für <b>${esc(msg.to[0] ?? "")}</b> keine weiteren E-Mails dieser Art von uns erhalten?</p><form method="post"><button type="submit">Jetzt abmelden</button></form>`,
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const body = await req.text().catch(() => "");
  const oneClick = body.includes("List-Unsubscribe=One-Click");
  const r = await unsubscribeByToken(token, { ip, method: oneClick ? "One-Click" : "Webseite" });
  if (!r) return page("Link ungültig", "<p>Dieser Abmeldelink ist ungültig.</p>");
  if (oneClick) return new NextResponse(null, { status: 200 });
  return page("Abmeldung bestätigt", `<p>Sie erhalten an <b>${esc(r.email)}</b> keine weiteren Werbe-E-Mails von uns. Ihr Widerspruch wurde dokumentiert.</p>`);
}
