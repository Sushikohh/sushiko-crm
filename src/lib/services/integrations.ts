import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { aiStatus } from "@/lib/ai";
import { env } from "@/lib/env";
import { brevoConfigured } from "@/lib/mail/brevo";
import { listMailboxes, mailboxState } from "@/lib/mail/mailbox";
import { osmEnabled } from "@/lib/finder/osm";
import { isSenderIdentityComplete } from "@/lib/templates";
import { getSetting } from "./settings";

export type IntegrationStatus = { key: string; label: string; state: "connected" | "error" | "incomplete"; detail: string; href: string };

export async function workerHeartbeat(): Promise<Date | null> {
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "worker_heartbeat"));
  const at = (row?.value as { at?: string } | undefined)?.at;
  return at ? new Date(at) : null;
}

export async function integrationStatuses(): Promise<IntegrationStatus[]> {
  const [identity, mailboxes, heartbeat] = await Promise.all([getSetting("sender_identity"), listMailboxes(), workerHeartbeat()]);
  const ai = aiStatus();
  const mb = mailboxes[0];
  const mbState = mb ? mailboxState(mb) : null;
  const workerOk = !!heartbeat && Date.now() - heartbeat.getTime() < 3 * 60_000;
  return [
    {
      key: "identity",
      label: "Absenderangaben / Impressum",
      state: isSenderIdentityComplete(identity) ? "connected" : "incomplete",
      detail: isSenderIdentityComplete(identity) ? identity!.companyName : "Pflichtangaben für geschäftliche E-Mails fehlen",
      href: "/einstellungen?tab=unternehmen",
    },
    {
      key: "mailbox",
      label: "E-Mail-Postfach (IMAP/SMTP)",
      state: mbState?.state ?? "incomplete",
      detail: mb ? `${mb.email} – ${mbState?.label}${mb.lastSyncError ? `: ${mb.lastSyncError}` : ""}` : "Nicht verbunden",
      href: "/einstellungen?tab=email",
    },
    {
      key: "worker",
      label: "Hintergrunddienst (Worker)",
      state: workerOk ? "connected" : heartbeat ? "error" : "incomplete",
      detail: workerOk ? "Läuft" : heartbeat ? `Letztes Lebenszeichen ${heartbeat.toLocaleString("de-DE")}` : "Nicht gestartet – Versand, Postfach-Sync und Automatisierungen pausieren",
      href: "/einstellungen?tab=system",
    },
    { key: "ai", label: "KI-Analyse", state: ai.connected ? "connected" : "incomplete", detail: ai.connected ? `${ai.provider} · ${ai.model}` : "Nicht verbunden", href: "/einstellungen?tab=integrationen" },
    { key: "brevo", label: "Brevo (Marketing-Versand)", state: brevoConfigured() ? "connected" : "incomplete", detail: brevoConfigured() ? "API-Schlüssel hinterlegt" : "Nicht verbunden (optional)", href: "/einstellungen?tab=integrationen" },
    {
      key: "osm",
      label: "Firmenfinder: OpenStreetMap",
      state: osmEnabled() ? "connected" : "incomplete",
      detail: osmEnabled() ? `Overpass: ${new URL(env.FINDER_OVERPASS_URL).host}` : "Nicht verbunden (FINDER_OSM_ENABLED)",
      href: "/einstellungen?tab=integrationen",
    },
  ];
}
