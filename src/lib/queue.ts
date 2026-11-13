import { PgBoss, type SendOptions } from "pg-boss";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Persistente Job-Warteschlange auf Basis von pg-boss (PostgreSQL).
 * - Retry mit exponentiellem Backoff
 * - Singleton-Keys für Idempotenz (gleicher Job wird nicht doppelt eingereiht)
 * - Cron-Zeitpläne (nur im Worker aktiv)
 */
export const QUEUES = {
  sendEmail: "email.send",
  syncMailbox: "mailbox.sync",
  syncAllMailboxes: "mailbox.sync-all",
  analyzeReply: "ai.analyze-reply",
  campaignTick: "campaign.tick",
  automationEvent: "automation.event",
  dailyMaintenance: "maintenance.daily",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type JobPayloads = {
  "email.send": { messageId: string };
  "mailbox.sync": { mailboxId: string };
  "mailbox.sync-all": Record<string, never>;
  "ai.analyze-reply": { messageId: string };
  "campaign.tick": Record<string, never>;
  "automation.event": AutomationEventPayload;
  "maintenance.daily": Record<string, never>;
};

export type AutomationEventPayload = {
  event: AutomationTrigger;
  eventKey: string;
  companyId?: string | null;
  contactId?: string | null;
  messageId?: string | null;
  dealId?: string | null;
  data?: Record<string, unknown>;
};

export type AutomationTrigger =
  | "reply.received"
  | "reply.classified"
  | "email.bounced"
  | "contact.status_changed"
  | "deal.stage_changed"
  | "offer.accepted"
  | "campaign.no_response";

const QUEUE_OPTIONS: Record<QueueName, { retryLimit: number; retryDelay: number; retryBackoff: boolean; expireInSeconds?: number }> = {
  "email.send": { retryLimit: 4, retryDelay: 60, retryBackoff: true, expireInSeconds: 300 },
  "mailbox.sync": { retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 600 },
  "mailbox.sync-all": { retryLimit: 0, retryDelay: 0, retryBackoff: false },
  "ai.analyze-reply": { retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 300 },
  "campaign.tick": { retryLimit: 0, retryDelay: 0, retryBackoff: false, expireInSeconds: 300 },
  "automation.event": { retryLimit: 3, retryDelay: 15, retryBackoff: true },
  "maintenance.daily": { retryLimit: 1, retryDelay: 300, retryBackoff: false },
};

declare global {
  // eslint-disable-next-line no-var
  var __boss: Promise<PgBoss> | undefined;
}

/** Startet pg-boss. `worker=true` aktiviert Wartung und Zeitpläne (nur im Worker-Prozess). */
export function getBoss(opts: { worker?: boolean } = {}): Promise<PgBoss> {
  if (!globalThis.__boss) {
    globalThis.__boss = (async () => {
      const boss = new PgBoss({
        connectionString: env.DATABASE_URL,
        schema: "pgboss",
        max: env.PGBOSS_POOL_SIZE ?? (opts.worker ? 3 : 2),
        supervise: !!opts.worker,
        schedule: !!opts.worker,
        migrate: true,
      });
      boss.on("error", (err) => logger.error("pg-boss Fehler", { err }));
      await boss.start();
      for (const name of Object.values(QUEUES)) {
        const existing = await boss.getQueue(name);
        if (!existing) await boss.createQueue(name, QUEUE_OPTIONS[name]);
      }
      return boss;
    })().catch((err) => {
      globalThis.__boss = undefined;
      throw err;
    });
  }
  return globalThis.__boss;
}

export async function enqueue<Q extends QueueName>(name: Q, data: JobPayloads[Q], options: SendOptions = {}) {
  const boss = await getBoss();
  return boss.send(name, data as object, options);
}

export async function stopBoss() {
  if (globalThis.__boss) {
    const b = await globalThis.__boss;
    await b.stop({ graceful: true });
    globalThis.__boss = undefined;
  }
}
