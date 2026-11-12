import Link from "next/link";
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { companyOptions } from "@/lib/services/details";
import { listOwners } from "@/lib/services/queries";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/primitives";
import { AppointmentDialog, TaskDialog } from "@/components/forms/sales-dialogs";
import { TaskList } from "./task-list";
import { AppointmentList } from "./appointment-list";

export const metadata = { title: "Aufgaben & Termine" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string; who?: string }> }) {
  const me = await requireUser();
  const { tab = "aufgaben", view = "offen", who = "ich" } = await searchParams;
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const t = schema.tasks;
  const mine = who === "ich" ? or(eq(t.assigneeId, me.id), isNull(t.assigneeId)) : undefined;
  const viewWhere =
    view === "heute"
      ? and(isNull(t.completedAt), lte(t.dueAt, endToday))
      : view === "ueberfaellig"
        ? and(isNull(t.completedAt), lt(t.dueAt, startToday))
        : view === "erledigt"
          ? isNotNull(t.completedAt)
          : isNull(t.completedAt);

  const [tasks, appts, owners, companies, counts] = await Promise.all([
    db
      .select({ t, assignee: schema.profiles.fullName, companyName: schema.companies.name })
      .from(t)
      .leftJoin(schema.profiles, eq(schema.profiles.id, t.assigneeId))
      .leftJoin(schema.companies, eq(schema.companies.id, t.companyId))
      .where(and(mine, viewWhere))
      .orderBy(view === "erledigt" ? desc(t.completedAt) : sql`${t.dueAt} asc nulls last`)
      .limit(300),
    db
      .select({ a: schema.appointments, companyName: schema.companies.name, cf: schema.contacts.firstName, cl: schema.contacts.lastName })
      .from(schema.appointments)
      .leftJoin(schema.companies, eq(schema.companies.id, schema.appointments.companyId))
      .leftJoin(schema.contacts, eq(schema.contacts.id, schema.appointments.contactId))
      .where(view === "vergangen" ? lt(schema.appointments.startsAt, startToday) : gte(schema.appointments.startsAt, startToday))
      .orderBy(view === "vergangen" ? desc(schema.appointments.startsAt) : asc(schema.appointments.startsAt))
      .limit(200),
    listOwners(),
    companyOptions(),
    db.execute<{ open: number; today: number; overdue: number }>(sql`
      select count(*) filter (where completed_at is null)::int as open,
             count(*) filter (where completed_at is null and due_at <= ${endToday.toISOString()})::int as today,
             count(*) filter (where completed_at is null and due_at < ${startToday.toISOString()})::int as overdue
      from tasks where ${who === "ich" ? sql`(assignee_id = ${me.id} or assignee_id is null)` : sql`true`}`),
  ]);
  const c = counts[0];
  const tabLink = (params: Record<string, string>) => `/aufgaben?${new URLSearchParams({ tab, view, who, ...params }).toString()}`;
  const pill = (active: boolean) => cn("rounded-md border px-2.5 py-1 text-xs", active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted");

  return (
    <>
      <PageHeader
        title="Aufgaben & Termine"
        description="Wiedervorlagen, Rückrufe, Verkostungen und Event-Lieferungen."
        actions={
          <>
            <AppointmentDialog companies={companies} />
            <TaskDialog companies={companies} owners={owners} />
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/aufgaben?tab=aufgaben`} className={pill(tab === "aufgaben")}>
          Aufgaben ({c?.open ?? 0})
        </Link>
        <Link href={`/aufgaben?tab=termine`} className={pill(tab === "termine")}>
          Termine
        </Link>
        <span className="mx-2 h-4 w-px bg-border" />
        {tab === "aufgaben" ? (
          <>
            <Link href={tabLink({ view: "offen" })} className={pill(view === "offen")}>
              Offen
            </Link>
            <Link href={tabLink({ view: "heute" })} className={pill(view === "heute")}>
              Heute fällig ({c?.today ?? 0})
            </Link>
            <Link href={tabLink({ view: "ueberfaellig" })} className={pill(view === "ueberfaellig")}>
              Überfällig ({c?.overdue ?? 0})
            </Link>
            <Link href={tabLink({ view: "erledigt" })} className={pill(view === "erledigt")}>
              Erledigt
            </Link>
            <span className="mx-2 h-4 w-px bg-border" />
            <Link href={tabLink({ who: "ich" })} className={pill(who === "ich")}>
              Meine
            </Link>
            <Link href={tabLink({ who: "alle" })} className={pill(who === "alle")}>
              Alle
            </Link>
          </>
        ) : (
          <>
            <Link href={`/aufgaben?tab=termine&view=kommend`} className={pill(view !== "vergangen")}>
              Kommend
            </Link>
            <Link href={`/aufgaben?tab=termine&view=vergangen`} className={pill(view === "vergangen")}>
              Vergangen
            </Link>
          </>
        )}
      </div>
      {tab === "aufgaben" ? (
        <TaskList
          empty="Keine Aufgaben in dieser Ansicht."
          tasks={tasks.map(({ t: x, assignee, companyName }) => ({
            id: x.id,
            title: x.title,
            type: x.type,
            priority: x.priority,
            dueAt: x.dueAt?.toISOString() ?? null,
            completedAt: x.completedAt?.toISOString() ?? null,
            assignee,
            companyName,
            companyId: x.companyId,
            description: x.description,
          }))}
        />
      ) : (
        <AppointmentList
          items={appts.map(({ a, companyName, cf, cl }) => ({
            id: a.id,
            title: a.title,
            type: a.type,
            startsAt: a.startsAt.toISOString(),
            endsAt: a.endsAt?.toISOString() ?? null,
            location: a.location,
            status: a.status,
            companyId: a.companyId,
            companyName,
            contactName: cf || cl ? `${cf ?? ""} ${cl ?? ""}`.trim() : null,
            notes: a.notes,
          }))}
        />
      )}
    </>
  );
}
