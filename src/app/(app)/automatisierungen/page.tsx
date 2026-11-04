import { asc, desc, eq } from "drizzle-orm";
import { ArrowRight, ShieldCheck, Workflow, Zap } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ACQ_STATUS, DEAL_STAGES, REPLY_CATEGORIES, TASK_TYPES, type AcqStatus, type DealStageKey, type ReplyCategory } from "@/lib/constants";
import { TRIGGERS } from "@/lib/services/automations";
import { workerHeartbeat } from "@/lib/services/integrations";
import { fmt, requestTime } from "@/lib/utils";
import { Badge, Callout, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { AutomationEditor, AutomationRowActions, type AutomationAction, type AutomationValues } from "./automation-editor";
import { RestoreDefaults } from "./restore-defaults";

export const metadata = { title: "Automatisierungen" };

function describeAction(a: AutomationAction) {
  switch (a.type) {
    case "set_company_status":
      return `Akquisestatus → ${ACQ_STATUS[a.status as AcqStatus]?.label}`;
    case "set_contact_status":
      return `Kontaktstatus → ${ACQ_STATUS[a.status as AcqStatus]?.label}`;
    case "create_task":
      return `${TASK_TYPES[a.taskType as keyof typeof TASK_TYPES]}: „${a.title}“ (in ${a.dueInDays} T.)`;
    case "notify":
      return `Benachrichtigung „${a.title}“`;
    case "ensure_deal":
      return `Deal → ${DEAL_STAGES[a.stage as DealStageKey]?.label}`;
    case "set_follow_up":
      return `Wiedervorlage in ${a.days} Tagen${a.useSuggestedDate ? " (oder genanntes Datum)" : ""}`;
  }
}

export default async function AutomationsPage() {
  await requireUser();
  const [list, runs, heartbeat] = await Promise.all([
    db.select().from(schema.automations).orderBy(asc(schema.automations.createdAt)),
    db
      .select({ r: schema.automationRuns, name: schema.automations.name })
      .from(schema.automationRuns)
      .innerJoin(schema.automations, eq(schema.automations.id, schema.automationRuns.automationId))
      .orderBy(desc(schema.automationRuns.createdAt))
      .limit(40),
    workerHeartbeat(),
  ]);
  const workerOk = heartbeat && requestTime() - heartbeat.getTime() < 3 * 60_000;
  return (
    <>
      <PageHeader title="Automatisierungen" description="Wenn-Dann-Regeln, die im Hintergrund zuverlässig und genau einmal pro Ereignis ausgeführt werden." actions={<><RestoreDefaults show={list.length === 0} /><AutomationEditor triggers={TRIGGERS} /></>} />
      {!workerOk ? (
        <Callout tone="amber" className="mb-4" title="Hintergrunddienst nicht aktiv">
          Automatisierungen, Versand und Postfach-Abruf laufen im Worker-Prozess (<code>npm run worker</code> bzw. Docker-Dienst „worker“). Ereignisse werden gespeichert und nach dem Start verarbeitet.
        </Callout>
      ) : null}
      <Card className="mb-6 p-4">
        <div className="flex items-start gap-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 text-brand" />
          <div>
            <p className="font-medium">Fest eingebaute Schutzregeln (nicht deaktivierbar)</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
              <li>Abmeldungen per Link, per E-Mail-Antwort (KI oder regelbasiert erkannt) oder über Brevo setzen sofort einen Werbewiderspruch und sperren die Adresse.</li>
              <li>Hard Bounces sperren die Adresse; laufende Sequenzen werden für den Empfänger beendet.</li>
              <li>Jede Antwort stoppt die Sequenz des Empfängers (sofern in der Kampagne aktiviert).</li>
              <li>Vor jedem einzelnen Werbeversand wird die Einwilligung erneut geprüft.</li>
            </ul>
          </div>
        </div>
      </Card>

      {list.length === 0 ? (
        <EmptyState icon={<Workflow className="size-5" />} title="Keine Automatisierungen" description="Stellen Sie die empfohlenen Standardregeln wieder her oder legen Sie eigene an." />
      ) : (
        <div className="grid gap-3">
          {list.map((a) => {
            const cond = (a.conditions ?? {}) as AutomationValues["conditions"];
            const actions = (a.actions ?? []) as AutomationAction[];
            return (
              <Card key={a.id} className={a.enabled ? "" : "opacity-60"}>
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Zap className="size-4 text-brand" />
                      <p className="font-medium">{a.name}</p>
                      {a.isSystem ? <Badge>Standard</Badge> : null}
                    </div>
                    {a.description ? <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge tone="blue">{TRIGGERS[a.trigger as keyof typeof TRIGGERS]?.label ?? a.trigger}</Badge>
                      {cond.categories?.map((c) => (
                        <Badge key={c} tone={REPLY_CATEGORIES[c as ReplyCategory]?.tone}>
                          {REPLY_CATEGORIES[c as ReplyCategory]?.label}
                        </Badge>
                      ))}
                      {cond.toStage?.map((s) => <Badge key={s}>{DEAL_STAGES[s as DealStageKey]?.label}</Badge>)}
                      <ArrowRight className="size-3 text-muted-foreground" />
                      {actions.map((x, i) => (
                        <span key={i} className="rounded border px-1.5 py-0.5 text-muted-foreground">
                          {describeAction(x)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-[11px] text-muted-foreground">
                      <p>{a.runCount}× ausgeführt</p>
                      <p>{a.lastRunAt ? `zuletzt ${fmt.relative(a.lastRunAt)}` : "noch nie"}</p>
                    </div>
                    <AutomationRowActions
                      triggers={TRIGGERS}
                      value={{ id: a.id, name: a.name, description: a.description ?? "", trigger: a.trigger, conditions: cond, actions, enabled: a.enabled }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Ausführungsprotokoll</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 text-sm">
          {runs.length === 0 ? <p className="text-muted-foreground">Noch keine Ausführungen.</p> : null}
          {runs.map(({ r, name }) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 last:border-0">
              <span>
                <Badge tone={r.status === "success" ? "green" : r.status === "error" ? "red" : "slate"}>{r.status === "success" ? "Erfolg" : r.status === "error" ? "Fehler" : "Läuft"}</Badge> <span className="font-medium">{name}</span>{" "}
                <span className="text-xs text-muted-foreground">{((r.result as { actions?: string[] } | null)?.actions ?? []).join(" · ")}</span>
                {r.error ? <span className="text-xs text-red-600"> {r.error}</span> : null}
              </span>
              <span className="text-[11px] text-muted-foreground">{fmt.dateTime(r.createdAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
