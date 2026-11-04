/**
 * Hintergrund-Worker: Versand, Postfach-Synchronisierung, KI-Analyse, Kampagnen-Takt,
 * Automatisierungen und tägliche Wartung. Läuft als eigener Prozess (Docker-Dienst „worker“).
 *
 * Zuverlässigkeit:
 * - pg-boss (PostgreSQL) als persistente Queue mit Retry/Backoff
 * - Idempotente Handler (Statuswechsel mit Bedingung, Unique-Keys, Ereignis-Keys)
 * - Cron-Zeitpläne werden von genau einer Instanz ausgeführt (pg-boss-Leaderwahl)
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, closeDb, schema } from "@/db";
import { assertProductionSecrets } from "@/lib/env";
import { logger } from "@/lib/logger";
import { syncMailbox } from "@/lib/mail/imap";
import { bootstrapEnvMailbox, listMailboxes } from "@/lib/mail/mailbox";
import { getBoss, QUEUES, stopBoss, type JobPayloads } from "@/lib/queue";
import { detectNoResponse, ensureDefaultAutomations, runAutomationEvent } from "@/lib/services/automations";
import { campaignTick } from "@/lib/services/campaigns";
import { ingestInbound, processSendJob } from "@/lib/services/email";
import { analyzeMessageJob } from "@/lib/services/inbox";
import { notify } from "@/lib/services/audit";
import { getSetting } from "@/lib/services/settings";

const log = logger.child({ service: "worker" });

async function heartbeat() {
  await db
    .insert(schema.appSettings)
    .values({ key: "worker_heartbeat", value: { at: new Date().toISOString(), pid: process.pid } })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: { at: new Date().toISOString(), pid: process.pid }, updatedAt: new Date() } });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    const problems = assertProductionSecrets();
    if (problems.length) throw new Error(`Fehlende/ungültige Konfiguration: ${problems.join(", ")}`);
  }
  const boss = await getBoss({ worker: true });
  await bootstrapEnvMailbox().catch((err) => log.warn("Postfach aus .env konnte nicht angelegt werden", { err }));
  await ensureDefaultAutomations().catch(() => undefined);
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

  await boss.work<JobPayloads["email.send"]>(QUEUES.sendEmail, { batchSize: 1, localConcurrency: concurrency }, async ([job]) => {
    const r = await processSendJob(job.data.messageId);
    log.info("E-Mail verarbeitet", { messageId: job.data.messageId, status: r.status });
    return r;
  });

  await boss.work<JobPayloads["mailbox.sync"]>(QUEUES.syncMailbox, { batchSize: 1 }, async ([job]) => {
    const r = await syncMailbox(job.data.mailboxId, ingestInbound);
    if (r.fetched) log.info("Postfach synchronisiert", { mailboxId: job.data.mailboxId, ...r });
    return r;
  });

  await boss.work(QUEUES.syncAllMailboxes, async () => {
    const boxes = await listMailboxes();
    for (const b of boxes.filter((x) => x.active && x.imapHost)) {
      await boss.send(QUEUES.syncMailbox, { mailboxId: b.id }, { singletonKey: `sync:${b.id}`, singletonSeconds: 60 });
    }
  });

  await boss.work<JobPayloads["ai.analyze-reply"]>(QUEUES.analyzeReply, { batchSize: 1, localConcurrency: concurrency }, async ([job]) => analyzeMessageJob(job.data.messageId));

  await boss.work<JobPayloads["automation.event"]>(QUEUES.automationEvent, { batchSize: 1 }, async ([job]) => runAutomationEvent(job.data));

  await boss.work(QUEUES.campaignTick, async () => {
    await heartbeat();
    const r = await campaignTick();
    if (Object.keys(r).length) log.info("Kampagnen-Takt", { queued: r });
    return r;
  });

  await boss.work(QUEUES.dailyMaintenance, async () => {
    const sales = await getSetting("sales");
    const events = await detectNoResponse(sales?.noResponseAfterDays ?? 14);
    for (const e of events) await boss.send(QUEUES.automationEvent, e, { singletonKey: e.eventKey });
    // Hängengebliebene Versände (z. B. nach Absturz) wieder freigeben
    const stuck = await db.execute(sql`update email_messages set status = 'queued' where status = 'sending' and created_at < now() - interval '1 hour' returning id`);
    for (const row of stuck as unknown as { id: string }[]) await boss.send(QUEUES.sendEmail, { messageId: row.id }, { singletonKey: `send:${row.id}:retry` });
    // Überfällige Wiedervorlagen melden
    const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from tasks where completed_at is null and due_at < now() - interval '1 day'`);
    if (n > 0) await notify({ title: `${n} überfällige Aufgaben`, link: "/aufgaben?view=ueberfaellig&who=alle", level: "warning" });
    // Abgelaufene Angebote markieren
    await db.execute(sql`update offers set status = 'expired', updated_at = now() where status = 'sent' and valid_until < current_date`);
    return { noResponse: events.length, requeued: (stuck as unknown[]).length };
  });

  // Zeitpläne (UTC-Cron; pg-boss stellt sicher, dass nur eine Instanz auslöst)
  await boss.schedule(QUEUES.campaignTick, "* * * * *");
  await boss.schedule(QUEUES.syncAllMailboxes, "*/2 * * * *");
  await boss.schedule(QUEUES.dailyMaintenance, "15 5 * * *", {}, { tz: "Europe/Berlin" });

  await heartbeat();
  const hb = setInterval(() => void heartbeat().catch(() => undefined), 60_000);
  log.info("Worker gestartet", { concurrency });

  const shutdown = async (signal: string) => {
    log.info("Worker wird beendet", { signal });
    clearInterval(hb);
    await stopBoss();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (err) => {
  log.error("Worker konnte nicht gestartet werden", { err });
  await closeDb().catch(() => undefined);
  process.exit(1);
});
