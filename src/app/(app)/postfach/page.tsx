import Link from "next/link";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { AlertTriangle, ArrowUpRight, Building2, Inbox, Mail, Reply, Send, ShieldOff, Sparkles, ThumbsUp, Unlink, User } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiStatus, type ReplyAnalysis } from "@/lib/ai";
import { listMailboxes, mailboxState } from "@/lib/mail/mailbox";
import { stripQuoted } from "@/lib/mail/classify";
import { MESSAGE_STATUS, REPLY_CATEGORIES, type ReplyCategory } from "@/lib/constants";
import { cn, fmt } from "@/lib/utils";
import { Badge, Callout, Card, PageHeader, StatusDot } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ComposeDialog } from "@/components/forms/compose-dialog";
import { contactOptions } from "@/lib/services/details";
import { AssignMessage, CancelQueued, MarkRead, Reanalyze, SyncButton } from "./inbox-actions";
import { SearchBox } from "./search-box";

export const metadata = { title: "E-Mail-Postfach" };

const FOLDERS = [
  { key: "inbox", label: "Posteingang", icon: Inbox },
  { key: "unread", label: "Ungelesen", icon: Mail },
  { key: "replies", label: "Antworten", icon: Reply },
  { key: "positive", label: "Positiv", icon: ThumbsUp },
  { key: "unassigned", label: "Nicht zugeordnet", icon: Unlink },
  { key: "optout", label: "Abmeldungen", icon: ShieldOff },
  { key: "bounces", label: "Unzustellbar", icon: AlertTriangle },
  { key: "sent", label: "Gesendet", icon: Send },
  { key: "queue", label: "Warteschlange & Fehler", icon: ArrowUpRight },
] as const;

function folderWhere(folder: string): SQL | undefined {
  const m = schema.emailMessages;
  switch (folder) {
    case "unread":
      return and(eq(m.direction, "inbound"), eq(m.isRead, false));
    case "replies":
      return and(eq(m.direction, "inbound"), eq(m.kind, "reply"));
    case "positive":
      return and(eq(m.direction, "inbound"), inArray(m.aiCategory, ["interested", "meeting_request"]));
    case "unassigned":
      return and(eq(m.direction, "inbound"), isNull(m.contactId), isNull(m.companyId), inArray(m.kind, ["reply", "inbound"]));
    case "optout":
      return and(eq(m.direction, "inbound"), eq(m.aiCategory, "unsubscribe"));
    case "bounces":
      return or(and(eq(m.direction, "inbound"), eq(m.kind, "bounce")), and(eq(m.direction, "outbound"), eq(m.status, "bounced")));
    case "sent":
      return and(eq(m.direction, "outbound"), inArray(m.status, ["accepted", "delivered"]));
    case "queue":
      return and(eq(m.direction, "outbound"), inArray(m.status, ["queued", "sending", "failed", "cancelled"]));
    default:
      return and(eq(m.direction, "inbound"), inArray(m.kind, ["reply", "inbound", "auto_reply"]));
  }
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string; m?: string; q?: string }> }) {
  const me = await requireUser();
  const { f = "inbox", m: selectedId, q } = await searchParams;
  const em = schema.emailMessages;
  const search = q?.trim() ? or(ilike(em.subject, `%${q}%`), ilike(em.fromEmail, `%${q}%`), ilike(em.fromName, `%${q}%`), sql`${q} = any(${em.toEmails})`) : undefined;
  const [list, counts, mailboxes] = await Promise.all([
    db
      .select({ m: em, company: schema.companies.name, contactFirst: schema.contacts.firstName, contactLast: schema.contacts.lastName })
      .from(em)
      .leftJoin(schema.companies, eq(schema.companies.id, em.companyId))
      .leftJoin(schema.contacts, eq(schema.contacts.id, em.contactId))
      .where(and(folderWhere(f), search))
      .orderBy(desc(sql`coalesce(${em.receivedAt}, ${em.sentAt}, ${em.createdAt})`))
      .limit(150),
    db.execute<{ unread: number; unassigned: number; queue: number }>(sql`
      select
        count(*) filter (where direction='inbound' and not is_read)::int as unread,
        count(*) filter (where direction='inbound' and contact_id is null and company_id is null and kind in ('reply','inbound'))::int as unassigned,
        count(*) filter (where direction='outbound' and status in ('queued','sending','failed'))::int as queue
      from email_messages`),
    listMailboxes(),
  ]);
  const selected = selectedId ? (await db.select().from(em).where(eq(em.id, selectedId)))[0] : list[0]?.m;
  const thread = selected?.threadKey ? await db.select().from(em).where(eq(em.threadKey, selected.threadKey)).orderBy(asc(sql`coalesce(${em.receivedAt}, ${em.sentAt}, ${em.createdAt})`)) : selected ? [selected] : [];
  const [ctx] = selected?.contactId
    ? await db
        .select({ contact: schema.contacts, company: schema.companies })
        .from(schema.contacts)
        .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
        .where(eq(schema.contacts.id, selected.contactId))
    : selected?.companyId
      ? await db.select({ contact: schema.contacts, company: schema.companies }).from(schema.companies).leftJoin(schema.contacts, sql`false`).where(eq(schema.companies.id, selected.companyId))
      : [];
  const contacts = selected && !selected.contactId ? await contactOptions() : [];
  const companyNames = contacts.length
    ? new Map((await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies)).map((c) => [c.id, c.name]))
    : new Map<string, string>();
  const ai = aiStatus();
  const mb = mailboxes[0];
  const mbState = mb ? mailboxState(mb) : null;
  const c = counts[0];
  const badge: Record<string, number> = { unread: c?.unread ?? 0, unassigned: c?.unassigned ?? 0, queue: c?.queue ?? 0 };
  const analysis = selected?.aiAnalysis as (ReplyAnalysis & { source?: string }) | null;
  const lastInbound = [...thread].reverse().find((t) => t.direction === "inbound");
  const href = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { f, q, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/postfach?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="E-Mail-Postfach"
        description={
          mb ? (
            <span className="inline-flex items-center gap-1.5">
              <StatusDot state={mbState!.state} /> {mb.email} · {mbState!.label}
              {mb.lastSyncAt ? ` · zuletzt abgerufen ${fmt.relative(mb.lastSyncAt)}` : ""}
            </span>
          ) : (
            "Kein Postfach verbunden"
          )
        }
        actions={
          <>
            <SearchBox initial={q ?? ""} />
            <SyncButton />
            <ComposeDialog aiAvailable={ai.connected} />
          </>
        }
      />
      {!mb ? (
        <Callout tone="amber" className="mb-4" title="Postfach nicht verbunden">
          Verbinden Sie Ihr geschäftliches Postfach unter{" "}
          <Link href="/einstellungen?tab=email" className="underline">
            Einstellungen → E-Mail
          </Link>
          , damit Antworten automatisch abgerufen und zugeordnet werden.
        </Callout>
      ) : mb.lastSyncError ? (
        <Callout tone="red" className="mb-4" title="Synchronisierungsfehler">
          {mb.lastSyncError}
        </Callout>
      ) : null}

      <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[200px_minmax(0,380px)_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {FOLDERS.map((x) => (
            <Link key={x.key} href={href({ f: x.key, m: undefined })} className={cn("flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted", f === x.key && "bg-muted font-medium text-foreground")}>
              <x.icon className="size-4" />
              <span className="flex-1">{x.label}</span>
              {badge[x.key] ? <span className="text-xs tabular-nums">{badge[x.key]}</span> : null}
            </Link>
          ))}
        </nav>

        <Card className="max-h-[75vh] overflow-y-auto">
          {list.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Keine Nachrichten in diesem Ordner.</p> : null}
          {list.map(({ m, company, contactFirst, contactLast }) => {
            const who = m.direction === "inbound" ? (m.fromName ?? m.fromEmail) : `An: ${m.toEmails.join(", ")}`;
            const cat = m.aiCategory ? REPLY_CATEGORIES[m.aiCategory as ReplyCategory] : null;
            return (
              <Link key={m.id} href={href({ m: m.id })} className={cn("block border-b px-4 py-3 last:border-0 hover:bg-muted/40", selected?.id === m.id && "bg-muted/60", m.direction === "inbound" && !m.isRead && "border-l-2 border-l-brand")}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("truncate text-sm", m.direction === "inbound" && !m.isRead ? "font-semibold" : "font-medium")}>{who}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{fmt.relative(m.receivedAt ?? m.sentAt ?? m.createdAt)}</span>
                </div>
                <p className="truncate text-sm">{m.subject}</p>
                <p className="truncate text-xs text-muted-foreground">{m.snippet}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {company || contactFirst ? (
                    <Badge>
                      <Building2 className="size-3" />
                      {company ?? `${contactFirst} ${contactLast}`}
                    </Badge>
                  ) : null}
                  {cat ? <Badge tone={cat.tone}>{cat.label}</Badge> : null}
                  {m.kind === "bounce" ? <Badge tone="red">Unzustellbar</Badge> : null}
                  {m.kind === "auto_reply" ? <Badge>Abwesenheit</Badge> : null}
                  {m.direction === "outbound" && m.status !== "accepted" ? <Badge tone={m.status === "bounced" || m.status === "failed" ? "red" : "slate"}>{MESSAGE_STATUS[m.status]}</Badge> : null}
                </div>
              </Link>
            );
          })}
        </Card>

        <Card className="max-h-[75vh] min-w-0 overflow-y-auto">
          {!selected ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Nachricht auswählen.</p>
          ) : (
            <div className="grid gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{selected.subject}</h2>
                  <p className="text-xs text-muted-foreground">
                    {thread.length} Nachricht{thread.length === 1 ? "" : "en"} im Verlauf
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selected.direction === "inbound" ? <MarkRead id={selected.id} read={selected.isRead} /> : null}
                  {!selected.contactId ? <AssignMessage id={selected.id} contacts={contacts.map((x) => ({ ...x, companyName: x.companyId ? (companyNames.get(x.companyId) ?? null) : null }))} /> : null}
                  {selected.direction === "inbound" && ai.connected && selected.kind !== "bounce" ? <Reanalyze id={selected.id} /> : null}
                  {selected.status === "queued" ? <CancelQueued id={selected.id} /> : null}
                  {lastInbound && lastInbound.kind !== "bounce" ? (
                    <ComposeDialog
                      to={lastInbound.fromEmail}
                      subject={/^(re|aw):/i.test(lastInbound.subject) ? lastInbound.subject : `Re: ${lastInbound.subject}`}
                      replyToMessageId={lastInbound.id}
                      contactId={lastInbound.contactId}
                      companyId={lastInbound.companyId}
                      aiAvailable={ai.connected}
                      trigger={
                        <Button size="sm">
                          <Reply /> Antworten
                        </Button>
                      }
                    />
                  ) : null}
                </div>
              </div>

              {ctx ? (
                <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                  {ctx.contact ? (
                    <Link href={`/ansprechpartner/${ctx.contact.id}`} className="inline-flex items-center gap-1 hover:underline">
                      <User className="size-3" /> {`${ctx.contact.firstName} ${ctx.contact.lastName}`.trim() || ctx.contact.email}
                    </Link>
                  ) : null}
                  {ctx.company ? (
                    <Link href={`/unternehmen/${ctx.company.id}`} className="inline-flex items-center gap-1 hover:underline">
                      <Building2 className="size-3" /> {ctx.company.name}
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {analysis ? (
                <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-sm">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <Sparkles className="size-4 text-brand" />
                    <span className="font-medium">{analysis.source === "rules" ? "Regelbasierte Einordnung" : "KI-Analyse"}</span>
                    <Badge tone={REPLY_CATEGORIES[analysis.category]?.tone}>{REPLY_CATEGORIES[analysis.category]?.label}</Badge>
                    <Badge tone={analysis.sentiment === "positive" ? "green" : analysis.sentiment === "negative" ? "red" : "slate"}>
                      {{ positive: "positiv", neutral: "neutral", negative: "negativ" }[analysis.sentiment]}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">Konfidenz {Math.round(analysis.confidence * 100)} %</span>
                  </div>
                  <p>{analysis.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <b>Nächster Schritt:</b> {analysis.nextAction}
                    {analysis.followUpDate ? ` · Wiedervorlage ${fmt.date(analysis.followUpDate)}` : ""}
                    {analysis.proposedDates?.length ? ` · Terminvorschläge: ${analysis.proposedDates.join(", ")}` : ""}
                    {analysis.alternativeContact ? ` · Alternativer Kontakt: ${analysis.alternativeContact}` : ""}
                  </p>
                  {analysis.objectToMarketing ? <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">Werbewiderspruch erkannt – Adresse wurde gesperrt.</p> : null}
                </div>
              ) : selected.direction === "inbound" && (selected.kind === "reply" || selected.kind === "inbound") && !ai.connected ? (
                <p className="text-xs text-muted-foreground">KI-Analyse nicht verfügbar (nicht verbunden). Abmeldewünsche werden trotzdem regelbasiert erkannt.</p>
              ) : null}

              <div className="grid gap-3">
                {thread.map((t) => (
                  <div key={t.id} className={cn("rounded-lg border p-4", t.id === selected.id && "ring-1 ring-brand/40", t.direction === "outbound" && "bg-muted/30")}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <span>
                        <b className="text-sm">{t.direction === "outbound" ? (t.fromName ?? t.fromEmail) : (t.fromName ?? t.fromEmail)}</b>
                        <span className="text-muted-foreground"> &lt;{t.fromEmail}&gt; → {t.toEmails.join(", ")}</span>
                      </span>
                      <span className="text-muted-foreground">{fmt.dateTime(t.receivedAt ?? t.sentAt ?? t.createdAt)}</span>
                    </div>
                    {t.direction === "outbound" ? (
                      <div className="mb-2 flex flex-wrap gap-1">
                        <Badge tone={t.status === "accepted" || t.status === "delivered" ? "green" : t.status === "bounced" || t.status === "failed" ? "red" : "slate"}>{MESSAGE_STATUS[t.status]}</Badge>
                        {t.kind === "campaign" ? <Badge tone="violet">Kampagne</Badge> : null}
                        {t.smtpResponse ? <span className="text-[11px] text-muted-foreground">{t.smtpResponse.slice(0, 120)}</span> : null}
                        {t.error ? <span className="text-[11px] text-red-600">{t.error}</span> : null}
                      </div>
                    ) : null}
                    <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{t.direction === "inbound" ? stripQuoted(t.bodyText ?? "") || t.bodyText : t.bodyText}</pre>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Angemeldet als {me.email}. HTML-Inhalte werden aus Sicherheitsgründen als Text angezeigt.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
