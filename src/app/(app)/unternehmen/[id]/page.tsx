import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ExternalLink, FilePlus2, Globe, Mail, MapPin, Pencil, Phone, Star, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { aiStatus } from "@/lib/ai";
import { CONTRACT_STATUS, DEAL_STAGES, INDUSTRIES, MESSAGE_STATUS, OFFER_STATUS, REPLY_CATEGORIES, type ReplyCategory } from "@/lib/constants";
import { getCompanyDetail } from "@/lib/services/details";
import { listOwners } from "@/lib/services/queries";
import { sourceLabel } from "@/lib/services/companies";
import { contactName, fmt } from "@/lib/utils";
import { Badge, Callout, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { PermissionBadge, PotentialBadge, StatusBadge } from "@/components/status";
import { NoteComposer, Timeline } from "@/components/timeline";
import { ContactDialog } from "@/components/forms/contact-dialog";
import { AppointmentDialog, DealDialog, TaskDialog } from "@/components/forms/sales-dialogs";
import { ComposeDialog } from "@/components/forms/compose-dialog";
import { CompanyFormDialog } from "../company-form";
import { FollowUpButton, PotentialEditor, StatusSelect } from "./header-actions";
import { LocationsCard } from "./locations";
import { TaskList } from "@/app/(app)/aufgaben/task-list";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d, owners] = await Promise.all([getCompanyDetail(id), listOwners()]);
  if (!d) notFound();
  const { company: c } = d;
  const contactOpts = d.contacts.map((x) => ({ id: x.id, name: contactName(x) }));
  const primary = d.contacts.find((x) => x.isPrimary) ?? d.contacts[0];
  const address = [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const openTasks = d.tasks.filter((t) => !t.t.completedAt).length;
  const ai = aiStatus().connected;

  return (
    <>
      <Link href="/unternehmen" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Unternehmen
      </Link>
      {d.mergedInto ? (
        <Callout tone="amber" className="mb-4">
          Dieser Datensatz wurde mit{" "}
          <Link className="underline" href={`/unternehmen/${d.mergedInto.id}`}>
            {d.mergedInto.name}
          </Link>{" "}
          zusammengeführt.
        </Callout>
      ) : null}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{c.name}</h1>
            <StatusBadge status={c.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{INDUSTRIES[c.industry]}</span>
            {address ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {address}
                {c.district ? ` · ${c.district}` : ""}
              </span>
            ) : null}
            <PotentialEditor companyId={c.id} score={c.potentialScore} override={c.potentialOverride} factors={d.score.factors} />
            {d.owner ? (
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3" />
                {d.owner.fullName}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect companyId={c.id} status={c.status} />
          <FollowUpButton companyId={c.id} current={c.nextFollowUpAt?.toISOString() ?? null} />
          <ComposeDialog to={primary?.email ?? c.email ?? ""} contactId={primary?.id} companyId={c.id} aiAvailable={ai} />
          <TaskDialog companyId={c.id} contacts={contactOpts} owners={owners} />
          <AppointmentDialog companyId={c.id} contacts={contactOpts} location={address} />
          <DealDialog initial={{ companyId: c.id, title: `Unterhaltsreinigung ${c.name}`, monthlyValue: c.estimatedMonthlyValue ?? "", contactId: primary?.id ?? "" }} contacts={contactOpts} owners={owners} />
          <Button size="sm" variant="outline" asChild>
            <Link href={`/angebote/neu?company=${c.id}`}>
              <FilePlus2 /> Angebot
            </Link>
          </Button>
          <CompanyFormDialog
            owners={owners}
            initial={{
              id: c.id,
              name: c.name,
              industry: c.industry,
              street: c.street ?? "",
              postalCode: c.postalCode ?? "",
              city: c.city ?? "",
              district: c.district ?? "",
              website: c.website ?? "",
              phone: c.phone ?? "",
              email: c.email ?? "",
              companySize: c.companySize ?? "",
              employeeCount: c.employeeCount?.toString() ?? "",
              areaSqm: c.areaSqm?.toString() ?? "",
              estimatedMonthlyValue: c.estimatedMonthlyValue ?? "",
              status: c.status,
              ownerId: c.ownerId ?? "",
              tags: c.tags.join(", "),
              notes: c.notes ?? "",
            }}
            trigger={
              <Button size="sm" variant="outline">
                <Pencil /> Bearbeiten
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <Tabs defaultValue="activity">
            <TabsList className="flex-wrap">
              <TabsTrigger value="activity">Aktivitäten</TabsTrigger>
              <TabsTrigger value="mail">Kommunikation ({d.messages.length})</TabsTrigger>
              <TabsTrigger value="tasks">Aufgaben & Termine ({openTasks + d.appointments.filter((a) => a.status === "planned").length})</TabsTrigger>
              <TabsTrigger value="sales">Angebote & Verträge ({d.offers.length + d.contracts.length})</TabsTrigger>
              <TabsTrigger value="locations">Standorte ({d.locations.length + 1})</TabsTrigger>
            </TabsList>
            <TabsContent value="activity" className="grid gap-4">
              <NoteComposer companyId={c.id} />
              <Timeline
                items={d.activities.map(({ a, userName }) => ({ id: a.id, type: a.type, title: a.title, body: a.body, userName, createdAt: a.createdAt.toISOString(), meta: a.meta }))}
              />
            </TabsContent>
            <TabsContent value="mail">
              <Card>
                {d.messages.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Noch keine E-Mails mit diesem Unternehmen.</p> : null}
                {d.messages.map((m) => (
                  <Link key={m.id} href={`/postfach?m=${m.id}`} className="flex items-start gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/40">
                    {m.direction === "inbound" ? <ArrowDownLeft className="mt-0.5 size-4 text-blue-500" /> : <ArrowUpRight className="mt-0.5 size-4 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{m.subject}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{fmt.dateTime(m.sentAt ?? m.receivedAt ?? m.createdAt)}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{m.snippet}</p>
                      <div className="mt-1 flex gap-1.5">
                        <Badge tone={m.status === "bounced" || m.status === "failed" ? "red" : m.status === "accepted" || m.status === "delivered" ? "green" : "slate"}>{MESSAGE_STATUS[m.status]}</Badge>
                        {m.aiCategory ? <Badge tone={REPLY_CATEGORIES[m.aiCategory as ReplyCategory]?.tone}>{REPLY_CATEGORIES[m.aiCategory as ReplyCategory]?.label}</Badge> : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </Card>
            </TabsContent>
            <TabsContent value="tasks" className="grid gap-4">
              <TaskList
                tasks={d.tasks.map(({ t, assignee }) => ({ id: t.id, title: t.title, type: t.type, priority: t.priority, dueAt: t.dueAt?.toISOString() ?? null, completedAt: t.completedAt?.toISOString() ?? null, assignee, companyName: null, companyId: null, description: t.description }))}
              />
              <Card>
                <CardHeader>
                  <CardTitle>Termine & Besichtigungen</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {d.appointments.length === 0 ? <p className="text-sm text-muted-foreground">Keine Termine.</p> : null}
                  {d.appointments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt.dateTime(a.startsAt)}
                          {a.location ? ` · ${a.location}` : ""}
                        </p>
                      </div>
                      <Badge tone={a.status === "done" ? "green" : a.status === "planned" ? "blue" : "slate"}>{{ planned: "Geplant", done: "Durchgeführt", cancelled: "Abgesagt", no_show: "Nicht erschienen" }[a.status]}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="sales" className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Angebote</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {d.offers.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Angebote.</p> : null}
                  {d.offers.map((o) => (
                    <Link key={o.id} href={`/angebote/${o.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
                      <div>
                        <p className="font-medium">
                          {o.number} · {o.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmt.eur2(o.monthlyNet)} / Monat netto · erstellt {fmt.date(o.createdAt)}
                        </p>
                      </div>
                      <Badge tone={o.status === "accepted" ? "green" : o.status === "rejected" ? "red" : o.status === "sent" ? "blue" : "slate"}>{OFFER_STATUS[o.status]}</Badge>
                    </Link>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Verträge</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {d.contracts.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Verträge.</p> : null}
                  {d.contracts.map((k) => (
                    <div key={k.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium">{k.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmt.eur2(k.monthlyValue)} / Monat · ab {fmt.date(k.startDate)} · Kündigungsfrist {k.noticePeriodMonths} Monate
                        </p>
                      </div>
                      <Badge tone={k.status === "active" ? "green" : "slate"}>{CONTRACT_STATUS[k.status]}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="locations">
              <LocationsCard companyId={c.id} main={{ street: c.street, postalCode: c.postalCode, city: c.city, district: c.district }} locations={d.locations} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Stammdaten</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2.5 text-sm">
              {c.website ? (
                <a href={c.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 hover:underline">
                  <Globe className="size-3.5 text-muted-foreground" /> {c.domain ?? c.website} <ExternalLink className="size-3 text-muted-foreground" />
                </a>
              ) : null}
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-2 hover:underline">
                  <Phone className="size-3.5 text-muted-foreground" /> {c.phone}
                </a>
              ) : null}
              {c.email ? (
                <span className="inline-flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" /> {c.email}
                </span>
              ) : null}
              <dl className="mt-2 grid grid-cols-[120px_1fr] gap-x-2 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Potenzial</dt>
                <dd>
                  <PotentialBadge score={c.potentialScore} />
                </dd>
                <dt className="text-muted-foreground">Mitarbeiter</dt>
                <dd>{c.employeeCount ?? c.companySize ?? "–"}</dd>
                <dt className="text-muted-foreground">Fläche</dt>
                <dd>{c.areaSqm ? `${fmt.num(c.areaSqm)} m²` : "–"}</dd>
                <dt className="text-muted-foreground">Gesch. Monatswert</dt>
                <dd>{c.estimatedMonthlyValue ? fmt.eur(c.estimatedMonthlyValue) : "–"}</dd>
                <dt className="text-muted-foreground">Wiedervorlage</dt>
                <dd>{fmt.date(c.nextFollowUpAt)}</dd>
                <dt className="text-muted-foreground">Datenquelle</dt>
                <dd>
                  {sourceLabel(c.source)}
                  {c.source === "osm" ? <span className="block text-[10px] text-muted-foreground">© OpenStreetMap-Mitwirkende (ODbL)</span> : null}
                </dd>
                <dt className="text-muted-foreground">Erfasst</dt>
                <dd>{fmt.date(c.capturedAt)}</dd>
                <dt className="text-muted-foreground">Letzte Prüfung</dt>
                <dd>{fmt.date(c.lastVerifiedAt)}</dd>
              </dl>
              {c.tags.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.tags.map((t) => (
                    <Link key={t} href={`/unternehmen?tag=${encodeURIComponent(t)}`}>
                      <Badge>{t}</Badge>
                    </Link>
                  ))}
                </div>
              ) : null}
              {c.notes ? <p className="mt-2 rounded-md bg-muted/50 p-2.5 text-xs whitespace-pre-wrap">{c.notes}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Ansprechpartner ({d.contacts.length})</CardTitle>
              <ContactDialog initial={{ companyId: c.id }} trigger={<Button size="sm" variant="ghost">+ Hinzufügen</Button>} />
            </CardHeader>
            <CardContent className="grid gap-2">
              {d.contacts.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Ansprechpartner.</p> : null}
              {d.contacts.map((p) => {
                const e = d.eligibility.get(p.id);
                return (
                  <Link key={p.id} href={`/ansprechpartner/${p.id}`} className="rounded-lg border px-3 py-2 hover:bg-muted/40">
                    <p className="flex items-center gap-1 text-sm font-medium">
                      {p.isPrimary ? <Star className="size-3 fill-amber-400 text-amber-400" /> : null}
                      {contactName(p)}
                    </p>
                    <p className="text-xs text-muted-foreground">{[p.position, p.email].filter(Boolean).join(" · ") || "–"}</p>
                    {p.email ? (
                      <div className="mt-1">
                        <PermissionBadge basis={e?.basis ?? "none"} allowed={e?.allowed} />
                      </div>
                    ) : null}
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deals</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {d.deals.length === 0 ? <p className="text-sm text-muted-foreground">Kein Deal.</p> : null}
              {d.deals.map((x) => (
                <Link key={x.id} href={`/pipeline?deal=${x.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{x.title}</p>
                    <p className="text-xs text-muted-foreground">{fmt.eur(x.monthlyValue)} / Monat</p>
                  </div>
                  <Badge tone={x.stage === "won" ? "green" : x.stage === "lost" ? "red" : "violet"}>{DEAL_STAGES[x.stage].label}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
