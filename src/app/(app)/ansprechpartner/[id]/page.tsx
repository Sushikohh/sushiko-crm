import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Building2, Mail, Pencil, Phone, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { aiStatus } from "@/lib/ai";
import { MESSAGE_STATUS, PERMISSION_BASIS, RECIPIENT_STATUS, REPLY_CATEGORIES, type ReplyCategory } from "@/lib/constants";
import { getContactDetail } from "@/lib/services/details";
import { companyOptions } from "@/lib/services/details";
import { listOwners } from "@/lib/services/queries";
import { contactName, fmt } from "@/lib/utils";
import { Badge, Callout, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PermissionBadge, StatusBadge } from "@/components/status";
import { NoteComposer, Timeline } from "@/components/timeline";
import { ContactDialog } from "@/components/forms/contact-dialog";
import { ComposeDialog } from "@/components/forms/compose-dialog";
import { PermissionDialog } from "@/components/forms/permission-dialog";
import { TaskDialog } from "@/components/forms/sales-dialogs";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d, companies, owners] = await Promise.all([getContactDetail(id), companyOptions(), listOwners()]);
  if (!d) notFound();
  const { contact: c, company } = d;
  const basis = d.permission?.basis ?? (d.suppression ? "objected" : "none");

  return (
    <>
      <Link href="/ansprechpartner" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Ansprechpartner
      </Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {c.salutation && c.salutation !== "Divers" ? `${c.salutation} ` : ""}
              {contactName(c)}
            </h1>
            <StatusBadge status={c.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {c.position ? <span>{c.position}</span> : null}
            {company ? (
              <Link href={`/unternehmen/${company.id}`} className="inline-flex items-center gap-1 hover:underline">
                <Building2 className="size-3" />
                {company.name}
              </Link>
            ) : null}
            {c.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3" />
                {c.email}
              </span>
            ) : null}
            {c.phone ? (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:underline">
                <Phone className="size-3" />
                {c.phone}
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.email ? <ComposeDialog to={c.email} contactId={c.id} companyId={c.companyId} aiAvailable={aiStatus().connected} /> : null}
          <TaskDialog companyId={c.companyId ?? ""} contactId={c.id} owners={owners} />
          <ContactDialog
            companies={companies}
            initial={{
              id: c.id,
              companyId: c.companyId ?? "",
              salutation: c.salutation ?? "",
              firstName: c.firstName,
              lastName: c.lastName,
              position: c.position ?? "",
              email: c.email ?? "",
              phone: c.phone ?? "",
              status: c.status,
              tags: c.tags.join(", "),
              notes: c.notes ?? "",
              isPrimary: c.isPrimary,
            }}
            trigger={
              <Button size="sm" variant="outline">
                <Pencil /> Bearbeiten
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-4">
          <NoteComposer companyId={c.companyId} contactId={c.id} />
          <Card>
            <CardHeader>
              <CardTitle>Kommunikationsverlauf</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-0 p-0">
              {d.messages.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">Noch keine E-Mails.</p> : null}
              {d.messages.map((m) => (
                <Link key={m.id} href={`/postfach?m=${m.id}`} className="flex items-start gap-3 border-t px-5 py-3 hover:bg-muted/40">
                  {m.direction === "inbound" ? <ArrowDownLeft className="mt-0.5 size-4 text-blue-500" /> : <ArrowUpRight className="mt-0.5 size-4 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <p className="truncate text-sm font-medium">{m.subject}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{fmt.dateTime(m.sentAt ?? m.receivedAt ?? m.createdAt)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{m.snippet}</p>
                    <div className="mt-1 flex gap-1.5">
                      <Badge tone={m.status === "bounced" ? "red" : m.status === "accepted" || m.status === "delivered" ? "green" : "slate"}>{MESSAGE_STATUS[m.status]}</Badge>
                      {m.aiCategory ? <Badge tone={REPLY_CATEGORIES[m.aiCategory as ReplyCategory]?.tone}>{REPLY_CATEGORIES[m.aiCategory as ReplyCategory]?.label}</Badge> : null}
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Aktivitäten</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline items={d.activities.map(({ a, userName }) => ({ id: a.id, type: a.type, title: a.title, body: a.body, userName, createdAt: a.createdAt.toISOString(), meta: a.meta }))} />
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-1.5">
                <ShieldCheck className="size-4" /> Werbeerlaubnis
              </CardTitle>
              <PermissionDialog contactId={c.id} email={c.email} current={basis} />
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {!c.email ? <p className="text-muted-foreground">Keine E-Mail-Adresse hinterlegt.</p> : null}
              {c.email ? (
                <>
                  <div className="flex items-center justify-between">
                    <PermissionBadge basis={basis} allowed={d.eligibility?.allowed} />
                    <span className="text-xs text-muted-foreground">{d.eligibility?.allowed ? "Kampagnenversand erlaubt" : "Kein Werbeversand"}</span>
                  </div>
                  {d.eligibility && !d.eligibility.allowed ? (
                    <Callout tone={basis === "objected" || basis === "revoked" ? "red" : "amber"}>
                      <ul className="list-disc pl-4">
                        {d.eligibility.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </Callout>
                  ) : null}
                  {d.permission ? (
                    <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Erteilt</dt>
                      <dd>{fmt.date(d.permission.grantedAt)}</dd>
                      <dt className="text-muted-foreground">Quelle</dt>
                      <dd>{d.permission.source ?? "–"}</dd>
                      <dt className="text-muted-foreground">Nachweis</dt>
                      <dd className="whitespace-pre-wrap">{d.permission.evidence ?? "–"}</dd>
                      {d.permission.doiConfirmedAt ? (
                        <>
                          <dt className="text-muted-foreground">DOI bestätigt</dt>
                          <dd>{fmt.dateTime(d.permission.doiConfirmedAt)}</dd>
                        </>
                      ) : null}
                      {d.permission.revokedAt ? (
                        <>
                          <dt className="text-muted-foreground">Widerruf</dt>
                          <dd>{fmt.dateTime(d.permission.revokedAt)}</dd>
                        </>
                      ) : null}
                    </dl>
                  ) : null}
                  {d.suppression ? (
                    <p className="text-xs text-muted-foreground">
                      Sperrliste seit {fmt.date(d.suppression.createdAt)}: {d.suppression.reason}
                    </p>
                  ) : null}
                  {d.permissionEvents.length ? (
                    <div>
                      <p className="mb-1 text-xs font-medium">Protokoll</p>
                      <ol className="grid gap-1.5 text-xs">
                        {d.permissionEvents.map(({ e, actor }) => (
                          <li key={e.id} className="rounded-md bg-muted/50 px-2 py-1.5">
                            <span className="font-medium">{e.fromBasis ? `${PERMISSION_BASIS[e.fromBasis].label} → ` : ""}{PERMISSION_BASIS[e.toBasis].label}</span>
                            <span className="block text-muted-foreground">
                              {fmt.dateTime(e.createdAt)} · {actor ?? e.actorLabel ?? "System"}
                              {e.reason ? ` · ${e.reason}` : ""}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Kampagnen</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {d.recipients.length === 0 ? <p className="text-muted-foreground">In keiner Kampagne.</p> : null}
              {d.recipients.map(({ r, campaign }) => (
                <Link key={r.id} href={`/kampagnen/${r.campaignId}`} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/40">
                  <span>{campaign}</span>
                  <Badge tone={r.status === "replied" ? "green" : r.status === "skipped" || r.status === "bounced" || r.status === "unsubscribed" ? "red" : "slate"}>{RECIPIENT_STATUS[r.status]}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
          {c.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notizen</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{c.notes}</CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
