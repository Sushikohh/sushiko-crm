"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Printer, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/overlay";
import { Field, Input } from "@/components/ui/primitives";
import { setOfferStatusAction } from "@/server/actions/sales";

export function OfferActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = React.useTransition();
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [contract, setContract] = React.useState({ startDate: new Date().toISOString().slice(0, 10), noticePeriodMonths: "3" });
  const router = useRouter();
  const set = (s: "sent" | "accepted" | "rejected" | "draft", c?: { startDate: string; noticePeriodMonths: number }) =>
    start(async () => {
      const r = await setOfferStatusAction(id, s, c);
      if (r.ok) {
        toast.success(s === "accepted" ? "Angebot angenommen – Vertrag wurde angelegt" : "Status aktualisiert");
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => window.print()}>
        <Printer /> Drucken / PDF
      </Button>
      {status === "draft" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set("sent")}>
          <Send /> Als versendet markieren
        </Button>
      ) : null}
      {status === "draft" || status === "sent" ? (
        <>
          <Button size="sm" disabled={pending} onClick={() => setAcceptOpen(true)}>
            <Check /> Angenommen
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => set("rejected")}>
            <X /> Abgelehnt
          </Button>
        </>
      ) : null}
      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Angebot angenommen</DialogTitle>
            <DialogDescription>Es wird automatisch ein Reinigungsvertrag mit dem monatlichen Angebotswert angelegt und der Deal als gewonnen markiert.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vertragsbeginn">
              <Input type="date" value={contract.startDate} onChange={(e) => setContract({ ...contract, startDate: e.target.value })} />
            </Field>
            <Field label="Kündigungsfrist (Monate)">
              <Input type="number" min={0} max={36} value={contract.noticePeriodMonths} onChange={(e) => setContract({ ...contract, noticePeriodMonths: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => {
                setAcceptOpen(false);
                set("accepted", { startDate: contract.startDate, noticePeriodMonths: Number(contract.noticePeriodMonths) });
              }}
            >
              Vertrag anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
