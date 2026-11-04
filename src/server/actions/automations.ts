"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { actionSchema, conditionsSchema, ensureDefaultAutomations, TRIGGERS } from "@/lib/services/automations";
import { run } from "@/server/action";

const automationSchema = z.object({
  name: z.string().trim().min(2, "Name fehlt"),
  description: z.string().trim().optional().nullable(),
  trigger: z.enum(Object.keys(TRIGGERS) as [string, ...string[]]),
  conditions: conditionsSchema,
  actions: z.array(actionSchema).min(1, "Mindestens eine Aktion"),
  enabled: z.boolean().default(true),
});

export async function saveAutomationAction(id: string | null, raw: z.input<typeof automationSchema>) {
  await requireAdmin();
  return run(async () => {
    const v = automationSchema.parse(raw);
    if (id) await db.update(schema.automations).set({ ...v, description: v.description ?? null }).where(eq(schema.automations.id, id));
    else await db.insert(schema.automations).values({ ...v, description: v.description ?? null });
    revalidatePath("/automatisierungen");
  }, "Automatisierung gespeichert");
}

export async function toggleAutomationAction(id: string, enabled: boolean) {
  await requireAdmin();
  return run(async () => {
    await db.update(schema.automations).set({ enabled }).where(eq(schema.automations.id, id));
    revalidatePath("/automatisierungen");
  });
}

export async function deleteAutomationAction(id: string) {
  await requireAdmin();
  return run(async () => {
    await db.delete(schema.automations).where(eq(schema.automations.id, id));
    revalidatePath("/automatisierungen");
  }, "Gelöscht");
}

export async function restoreDefaultsAction() {
  await requireAdmin();
  return run(async () => {
    const n = await ensureDefaultAutomations();
    revalidatePath("/automatisierungen");
    return n;
  });
}
