"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, GitMerge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/overlay";
import { findDuplicateGroupsAction, mergeCompaniesAction } from "@/server/actions/companies";

export function DuplicatesDialog() {
  const [groups, setGroups] = React.useState<{ ids: string[]; names: string[]; reason: string }[] | null>(null);
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const load = () =>
    start(async () => {
      const r = await findDuplicateGroupsAction();
      if (r.ok) setGroups(r.data!);
      else toast.error(r.error);
    });
  return (
    <Dialog onOpenChange={(o) => o && load()}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Copy /> Duplikate
        </Button>
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Mögliche Duplikate</DialogTitle>
          <DialogDescription>Gruppen mit gleichem normalisierten Namen oder gleicher Domain. Beim Zusammenführen bleibt der älteste Datensatz erhalten.</DialogDescription>
        </DialogHeader>
        {pending && !groups ? <Loader2 className="mx-auto animate-spin" /> : null}
        {groups && groups.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Keine Duplikate gefunden.</p> : null}
        <div className="grid gap-2">
          {groups?.map((g, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{g.reason}</p>
                <div className="flex flex-wrap gap-x-3">
                  {g.ids.map((id, j) => (
                    <Link key={id} href={`/unternehmen/${id}`} className="truncate font-medium hover:underline">
                      {g.names[j]}
                    </Link>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await mergeCompaniesAction(g.ids[0], g.ids.slice(1));
                    if (r.ok) {
                      toast.success("Zusammengeführt");
                      router.refresh();
                      const rr = await findDuplicateGroupsAction();
                      if (rr.ok) setGroups(rr.data!);
                    } else toast.error(r.error);
                  })
                }
              >
                <GitMerge /> Zusammenführen
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
