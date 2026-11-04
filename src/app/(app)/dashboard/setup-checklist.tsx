import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { integrationStatuses } from "@/lib/services/integrations";
import { Card, StatusDot } from "@/components/ui/primitives";

/** Zeigt offene Einrichtungsschritte – verschwindet, sobald alles Wesentliche verbunden ist. */
export async function SetupChecklist() {
  const statuses = await integrationStatuses();
  const essentials = statuses.filter((s) => ["identity", "mailbox", "worker"].includes(s.key));
  if (essentials.every((s) => s.state === "connected")) return null;
  return (
    <Card className="mb-6 p-4">
      <p className="text-sm font-semibold">Einrichtung abschließen</p>
      <p className="mb-3 text-xs text-muted-foreground">Ohne diese Schritte können keine E-Mails versendet oder empfangen werden.</p>
      <div className="grid gap-2 md:grid-cols-3">
        {essentials.map((s) => (
          <Link key={s.key} href={s.href} className="flex items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50">
            <span className="mt-1.5">
              <StatusDot state={s.state} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{s.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>
            </span>
            <ArrowRight className="mt-0.5 size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
