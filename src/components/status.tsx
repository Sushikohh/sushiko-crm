import { ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { ACQ_STATUS, INDUSTRIES, PERMISSION_BASIS, type AcqStatus, type IndustryKey, type PermissionBasisKey } from "@/lib/constants";
import { potentialLabel } from "@/lib/scoring";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: AcqStatus }) {
  const s = ACQ_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function IndustryLabel({ industry }: { industry: IndustryKey }) {
  return <span className="text-muted-foreground">{INDUSTRIES[industry]}</span>;
}

export function PotentialBadge({ score }: { score: number }) {
  const p = potentialLabel(score);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums">
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-muted-foreground/50")} style={{ width: `${score}%` }} />
      </span>
      <span className="text-muted-foreground" title={p.label}>
        {score}
      </span>
    </span>
  );
}

/** Werbeerlaubnis immer mit Icon + Text (nie nur Farbe). */
export function PermissionBadge({ basis, allowed }: { basis: PermissionBasisKey; allowed?: boolean }) {
  const p = PERMISSION_BASIS[basis];
  const ok = allowed ?? p.allowsMarketing;
  const Icon = ok ? ShieldCheck : basis === "objected" || basis === "revoked" ? ShieldOff : ShieldAlert;
  return (
    <Badge tone={ok ? "green" : basis === "objected" || basis === "revoked" ? "red" : "slate"}>
      <Icon className="size-3" />
      {ok ? p.label : basis === "none" ? "Keine Werbeerlaubnis" : p.label}
    </Badge>
  );
}
