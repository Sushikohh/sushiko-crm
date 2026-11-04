import { and, count, desc, eq, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/services/settings";
import { Brand, SidebarNav } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const [notifications, [{ inbox }], [{ tasks }], identity] = await Promise.all([
    db
      .select()
      .from(schema.notifications)
      .where(or(eq(schema.notifications.userId, user.id), isNull(schema.notifications.userId)))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(30),
    db
      .select({ inbox: count() })
      .from(schema.emailMessages)
      .where(and(eq(schema.emailMessages.direction, "inbound"), eq(schema.emailMessages.isRead, false))),
    db
      .select({ tasks: count() })
      .from(schema.tasks)
      .where(and(isNull(schema.tasks.completedAt), lte(schema.tasks.dueAt, endOfToday), or(eq(schema.tasks.assigneeId, user.id), isNull(schema.tasks.assigneeId)))),
    getSetting("sender_identity"),
  ]);
  const badges = { inbox, tasks };
  const companyName = identity?.companyName || "Meine Reinigungsfirma";
  return (
    <div className="flex min-h-svh">
      <aside className="no-print sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-4 border-r bg-sidebar p-3 md:flex">
        <div className="py-2">
          <Brand companyName={companyName} />
        </div>
        <SidebarNav badges={badges} />
        <div className="mt-auto rounded-lg border bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
          Werbe-E-Mails werden nur an Kontakte mit nachgewiesener Einwilligung versendet (§ 7 UWG).
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{ fullName: user.fullName, email: user.email, role: user.role }}
          companyName={companyName}
          badges={badges}
          notifications={notifications.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            link: n.link,
            level: n.level,
            readAt: n.readAt?.toISOString() ?? null,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
