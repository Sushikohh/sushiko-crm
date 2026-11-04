"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  FileSignature,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Megaphone,
  Search,
  Settings,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/firmenfinder", label: "Firmenfinder", icon: Search },
  { href: "/unternehmen", label: "Unternehmen", icon: Building2 },
  { href: "/ansprechpartner", label: "Ansprechpartner", icon: Users },
  { href: "/kampagnen", label: "Kampagnen", icon: Megaphone },
  { href: "/postfach", label: "E-Mail-Postfach", icon: Inbox, badgeKey: "inbox" as const },
  { href: "/pipeline", label: "Vertriebspipeline", icon: KanbanSquare },
  { href: "/aufgaben", label: "Aufgaben & Termine", icon: CalendarCheck, badgeKey: "tasks" as const },
  { href: "/angebote", label: "Angebote & Verträge", icon: FileSignature },
  { href: "/automatisierungen", label: "Automatisierungen", icon: Workflow },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];

export function SidebarNav({ badges, onNavigate }: { badges: { inbox: number; tasks: number }; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badge = item.badgeKey ? badges[item.badgeKey] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              active && "bg-sidebar-accent text-sidebar-foreground",
            )}
          >
            <item.icon className={cn("size-4 text-muted-foreground group-hover:text-foreground", active && "text-brand")} />
            <span className="flex-1 truncate">{item.label}</span>
            {badge > 0 ? <span className="rounded-full bg-brand/15 px-1.5 text-[10px] font-semibold text-brand">{badge > 99 ? "99+" : badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand({ companyName }: { companyName: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">{companyName}</p>
        <p className="text-[11px] text-muted-foreground">Akquise-CRM · Hamburg</p>
      </div>
    </Link>
  );
}
