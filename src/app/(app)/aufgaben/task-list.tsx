"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/overlay";
import { Badge, Card } from "@/components/ui/primitives";
import { TASK_TYPES } from "@/lib/constants";
import { cn, fmt } from "@/lib/utils";
import { deleteTaskAction, toggleTaskAction } from "@/server/actions/sales";

export type TaskItem = {
  id: string;
  title: string;
  type: keyof typeof TASK_TYPES;
  priority: "low" | "normal" | "high";
  dueAt: string | null;
  completedAt: string | null;
  assignee: string | null;
  companyName: string | null;
  companyId: string | null;
  description: string | null;
};

export function TaskList({ tasks, empty = "Keine Aufgaben." }: { tasks: TaskItem[]; empty?: string }) {
  const router = useRouter();
  const [, start] = React.useTransition();
  const [now] = React.useState(() => Date.now());
  if (!tasks.length) return <Card className="p-6 text-center text-sm text-muted-foreground">{empty}</Card>;
  return (
    <Card className="divide-y">
      {tasks.map((t) => {
        const overdue = !t.completedAt && t.dueAt && new Date(t.dueAt).getTime() < now;
        return (
          <div key={t.id} className="group flex items-start gap-3 px-4 py-3">
            <Checkbox
              className="mt-0.5"
              checked={!!t.completedAt}
              aria-label="Erledigt"
              onCheckedChange={(c) =>
                start(async () => {
                  const r = await toggleTaskAction(t.id, !!c);
                  if (!r.ok) toast.error(r.error);
                  router.refresh();
                })
              }
            />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", t.completedAt && "text-muted-foreground line-through")}>{t.title}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <Badge tone={t.type === "call" ? "blue" : t.type === "follow_up" ? "amber" : t.type === "tasting" ? "violet" : "slate"}>{TASK_TYPES[t.type]}</Badge>
                {t.priority === "high" ? <Badge tone="red">Hoch</Badge> : null}
                <span className={cn(overdue && "font-medium text-red-600 dark:text-red-400")}>{t.dueAt ? `fällig ${fmt.dateTime(t.dueAt)}` : "ohne Termin"}</span>
                {t.companyName && t.companyId ? (
                  <Link href={`/unternehmen/${t.companyId}`} className="hover:underline">
                    {t.companyName}
                  </Link>
                ) : null}
                {t.assignee ? <span>{t.assignee}</span> : null}
              </div>
              {t.description ? <p className="mt-1 text-xs text-muted-foreground">{t.description}</p> : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover:opacity-100"
              aria-label="Löschen"
              onClick={() =>
                start(async () => {
                  await deleteTaskAction(t.id);
                  router.refresh();
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
    </Card>
  );
}
