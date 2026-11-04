import Link from "next/link";
import { asc, desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { listMailboxes, mailboxState } from "@/lib/mail/mailbox";
import { integrationStatuses, workerHeartbeat } from "@/lib/services/integrations";
import { getSetting } from "@/lib/services/settings";
import { cn, fmt, requestTime } from "@/lib/utils";
import { Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, StatusDot } from "@/components/ui/primitives";
import { IdentityForm, MailboxForm, ProfileForm, SalesForm, SuppressionPanel, TeamPanel } from "./forms";

export const metadata = { title: "Einstellungen" };

const TABS = [
  { key: "unternehmen", label: "Unternehmen" },
  { key: "email", label: "E-Mail" },
  { key: "integrationen", label: "Integrationen" },
  { key: "team", label: "Team" },
  { key: "profil", label: "Profil" },
  { key: "sperrliste", label: "Sperrliste" },
  { key: "vertrieb", label: "Vertrieb" },
  { key: "system", label: "System" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; willkommen?: string }> }) {
  const me = await requireUser();
  const { tab = "unternehmen", willkommen } = await searchParams;
  const isAdmin = me.role === "admin";
  const localAuth = env.AUTH_PROVIDER === "local";

  let content: React.ReactNode = null;
  if (tab === "unternehmen") {
    const id = await getSetting("sender_identity");
    content = (
      <IdentityForm
        readOnly={!isAdmin}
        initial={{
          companyName: id?.companyName ?? "",
          legalForm: id?.legalForm ?? "",
          street: id?.street ?? "",
          postalCode: id?.postalCode ?? "",
          city: id?.city ?? "Hamburg",
          phone: id?.phone ?? "",
          email: id?.email ?? "",
          website: id?.website ?? "",
          managingDirector: id?.managingDirector ?? "",
          registerInfo: id?.registerInfo ?? "",
          vatId: id?.vatId ?? "",
        }}
      />
    );
  } else if (tab === "email") {
    const [m] = await listMailboxes();
    content = (
      <MailboxForm
        key={m?.id ?? "neu"}
        readOnly={!isAdmin}
        status={m ? { label: mailboxState(m).label, lastSyncAt: m.lastSyncAt?.toISOString() ?? null, lastSyncError: m.lastSyncError, lastSmtpError: m.lastSmtpError } : undefined}
        initial={{
          id: m?.id,
          name: m?.name ?? "Geschäftspostfach",
          email: m?.email ?? "",
          fromName: m?.fromName ?? me.fullName,
          imapHost: m?.imapHost ?? "",
          imapPort: String(m?.imapPort ?? 993),
          imapUser: m?.imapUser ?? "",
          imapPassword: "",
          imapFolder: m?.imapFolder ?? "INBOX",
          smtpHost: m?.smtpHost ?? "",
          smtpPort: String(m?.smtpPort ?? 465),
          smtpSecure: m?.smtpSecure ?? true,
          smtpUser: m?.smtpUser ?? "",
          smtpPassword: "",
          dailyLimit: String(m?.dailyLimit ?? 80),
          hasImapPassword: !!m?.imapPasswordEnc,
          hasSmtpPassword: !!m?.smtpPasswordEnc,
        }}
      />
    );
  } else if (tab === "integrationen") {
    const statuses = await integrationStatuses();
    const webhook = `${env.APP_URL.replace(/\/$/, "")}/api/webhooks/brevo${env.BREVO_WEBHOOK_SECRET ? "?token=<BREVO_WEBHOOK_SECRET>" : ""}`;
    content = (
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Verbindungsstatus</CardTitle>
            <CardDescription>API-Schlüssel werden ausschließlich serverseitig über Umgebungsvariablen konfiguriert (siehe .env.example).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {statuses.map((s) => (
              <Link key={s.key} href={s.href} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/40">
                <StatusDot state={s.state} />
                <span className="w-56 font-medium">{s.label}</span>
                <span className="truncate text-xs text-muted-foreground">{s.detail}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Konfiguration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="font-medium">KI (Antwortanalyse, Entwürfe, Personalisierung)</p>
              <p className="text-xs text-muted-foreground">
                <code>AI_PROVIDER=anthropic</code> + <code>ANTHROPIC_API_KEY</code> (Modell über <code>ANTHROPIC_MODEL</code>, Standard {env.ANTHROPIC_MODEL}) oder <code>AI_PROVIDER=openai</code> + <code>OPENAI_API_KEY</code>.
                Es werden nur die zur Analyse nötigen Texte übermittelt; prüfen Sie den Auftragsverarbeitungsvertrag (AVV) des Anbieters.
              </p>
            </div>
            <div>
              <p className="font-medium">Brevo (optional, für Kampagnen)</p>
              <p className="text-xs text-muted-foreground">
                <code>BREVO_API_KEY</code> und <code>BREVO_WEBHOOK_SECRET</code> setzen. Webhook-URL in Brevo (Transactional → Webhooks; Ereignisse: delivered, hard bounce, soft bounce, blocked, spam, unsubscribed):
              </p>
              <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs break-all">{webhook}</code>
            </div>
            <div>
              <p className="font-medium">Firmenfinder (OpenStreetMap)</p>
              <p className="text-xs text-muted-foreground">
                <code>FINDER_OSM_ENABLED=true</code>, optional eigener Overpass-Server über <code>FINDER_OVERPASS_URL</code> und Kontaktadresse <code>FINDER_CONTACT_EMAIL</code> für den User-Agent.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  } else if (tab === "team") {
    const users = await db.select().from(schema.profiles).orderBy(asc(schema.profiles.fullName));
    content = <TeamPanel meId={me.id} isAdmin={isAdmin} localAuth={localAuth} users={users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, role: u.role, active: u.active, createdAt: u.createdAt.toISOString() }))} />;
  } else if (tab === "profil") {
    content = <ProfileForm localAuth={localAuth} initial={{ fullName: me.fullName, emailSignature: me.emailSignature ?? "" }} />;
  } else if (tab === "sperrliste") {
    const items = await db.select().from(schema.suppressions).orderBy(desc(schema.suppressions.createdAt)).limit(1000);
    content = <SuppressionPanel isAdmin={isAdmin} items={items.map((s) => ({ id: s.id, email: s.email, reason: s.reason, createdAt: s.createdAt.toISOString() }))} />;
  } else if (tab === "vertrieb") {
    const s = (await getSetting("sales"))!;
    content = <SalesForm initial={s} />;
  } else if (tab === "system") {
    const [heartbeat, [q]] = await Promise.all([
      workerHeartbeat(),
      db.execute<{ queued: number; failed: number; sending: number; events: number }>(sql`
        select count(*) filter (where status='queued')::int as queued, count(*) filter (where status='failed')::int as failed,
               count(*) filter (where status='sending')::int as sending, (select count(*) from email_events)::int as events
        from email_messages where direction='outbound'`),
    ]);
    const ok = heartbeat && requestTime() - heartbeat.getTime() < 3 * 60_000;
    content = (
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Hintergrunddienst</CardTitle>
            <CardDescription>Versand, Postfach-Synchronisierung (alle 2 Minuten), KI-Analyse, Kampagnen-Takt (minütlich) und Automatisierungen.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="flex items-center gap-2">
              <StatusDot state={ok ? "connected" : heartbeat ? "error" : "incomplete"} />
              {ok ? "Worker läuft" : heartbeat ? `Kein Lebenszeichen seit ${fmt.dateTime(heartbeat)}` : "Worker wurde noch nie gestartet"}
            </p>
            <p className="text-xs text-muted-foreground">
              Warteschlange: {q?.queued ?? 0} wartend · {q?.sending ?? 0} in Bearbeitung · {q?.failed ?? 0} fehlgeschlagen · {q?.events ?? 0} Zustellereignisse
            </p>
            <p className="text-xs text-muted-foreground">
              Start lokal: <code>npm run worker</code> · Docker: <code>docker compose up -d worker</code>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Umgebung</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-xs text-muted-foreground">
            <p>Authentifizierung: {localAuth ? "Lokal (bcrypt + signierte Session)" : "Supabase Auth"}</p>
            <p>App-URL: {env.APP_URL}</p>
            <p>Datenbank: {new URL(env.DATABASE_URL).host}</p>
          </CardContent>
        </Card>
        <Callout tone="blue" title="Datenschutz">
          Exporte (CSV) stehen unter Unternehmen und Ansprechpartner zur Verfügung (Auskunftsersuchen nach Art. 15 DSGVO). Gelöschte Kontakte entfernen personenbezogene Daten; Einwilligungs- und Widerspruchsnachweise bleiben aus Nachweisgründen erhalten.
        </Callout>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Einstellungen" description={isAdmin ? "Konfiguration für Ihr Unternehmen und Ihr Team." : "Einige Einstellungen können nur Administratoren ändern."} />
      {willkommen ? (
        <Callout tone="green" className="mb-4" title="Willkommen!">
          Hinterlegen Sie zuerst Ihre Firmendaten (Impressum) und verbinden Sie anschließend Ihr Postfach unter „E-Mail“.
        </Callout>
      ) : null}
      <div className="mb-6 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <Link key={t.key} href={`/einstellungen?tab=${t.key}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground", tab === t.key ? "border-brand font-medium text-foreground" : "border-transparent")}>
            {t.label}
          </Link>
        ))}
      </div>
      <div className="max-w-5xl">{content}</div>
    </>
  );
}
