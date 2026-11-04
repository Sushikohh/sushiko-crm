"use server";

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";

export async function markNotificationsRead(ids?: string[]) {
  const me = await requireUser();
  const mine = or(eq(schema.notifications.userId, me.id), isNull(schema.notifications.userId));
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(mine, isNull(schema.notifications.readAt), ids?.length ? inArray(schema.notifications.id, ids) : undefined));
  revalidatePath("/", "layout");
}
