import { db, schema } from "@/db";
import type { Conn } from "@/db";

export async function audit(
  entry: { actorId?: string | null; action: string; entity: string; entityId?: string | null; details?: unknown },
  tx?: Conn,
) {
  await (tx ?? db).insert(schema.auditLog).values({
    actorId: entry.actorId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    details: entry.details ?? null,
  });
}

export async function logActivity(
  a: typeof schema.activities.$inferInsert,
  tx?: Conn,
) {
  const [row] = await (tx ?? db).insert(schema.activities).values(a).returning({ id: schema.activities.id });
  return row.id;
}

export async function notify(
  n: { userId?: string | null; title: string; body?: string; link?: string; level?: "info" | "success" | "warning" | "error" },
  tx?: Conn,
) {
  await (tx ?? db).insert(schema.notifications).values({
    userId: n.userId ?? null,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
    level: n.level ?? "info",
  });
}
