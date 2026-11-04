"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restoreDefaultsAction } from "@/server/actions/automations";

export function RestoreDefaults({ show }: { show: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!show) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await restoreDefaultsAction();
          if (r.ok) {
            toast.success(`${r.data} Standardregeln angelegt`);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <RotateCcw /> Standardregeln
    </Button>
  );
}
