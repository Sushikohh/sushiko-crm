"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { Bell, Building2, CheckCheck, KanbanSquare, LogOut, Menu, Monitor, Moon, Search, Settings, Sun, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, SheetContent } from "@/components/ui/overlay";
import { cn, fmt, initials } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { markNotificationsRead } from "@/server/actions/misc";
import { Brand, SidebarNav } from "./sidebar";

export type NotificationItem = { id: string; title: string; body: string | null; link: string | null; level: string; readAt: string | null; createdAt: string };

type SearchHit = { type: "company" | "contact" | "deal"; id: string; title: string; subtitle: string; href: string };

function GlobalSearch() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setHits((await res.json()).results);
      } catch {
        /* abgebrochen */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const icon = { company: Building2, contact: Users, deal: KanbanSquare };
  const visibleHits = q.trim().length >= 2 ? hits : [];
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Suchen …</span>
        <kbd className="hidden rounded border bg-background px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </button>
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <D.Content className="fixed top-[15%] left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-2xl sm:max-w-xl">
            <D.Title className="sr-only">Globale Suche</D.Title>
            <Command shouldFilter={false} className="flex flex-col">
              <div className="flex items-center gap-2 border-b px-3">
                <Search className="size-4 text-muted-foreground" />
                <Command.Input value={q} onValueChange={setQ} placeholder="Unternehmen, Ansprechpartner, Deals …" className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </div>
              <Command.List className="max-h-80 overflow-y-auto p-1.5">
                {q.trim().length >= 2 && !loading && visibleHits.length === 0 ? <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">Keine Treffer.</Command.Empty> : null}
                {q.trim().length < 2 ? <div className="px-3 py-6 text-center text-xs text-muted-foreground">Mindestens 2 Zeichen eingeben</div> : null}
                {visibleHits.map((h) => {
                  const I = icon[h.type];
                  return (
                    <Command.Item
                      key={`${h.type}-${h.id}`}
                      value={`${h.type}-${h.id}`}
                      onSelect={() => {
                        setOpen(false);
                        setQ("");
                        router.push(h.href);
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm data-[selected=true]:bg-accent"
                    >
                      <I className="size-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{h.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{h.subtitle}</p>
                      </div>
                    </Command.Item>
                  );
                })}
              </Command.List>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}

function Notifications({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const unread = items.filter((n) => !n.readAt).length;
  const tone: Record<string, string> = { success: "bg-emerald-500", warning: "bg-amber-500", error: "bg-red-500", info: "bg-blue-500" };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label="Benachrichtigungen">
          <Bell />
          {unread > 0 ? <span className="absolute top-1 right-1 size-2 rounded-full bg-brand ring-2 ring-background" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Benachrichtigungen</p>
          {unread > 0 ? (
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await markNotificationsRead();
                router.refresh();
              }}
            >
              <CheckCheck className="size-3.5" /> Alle gelesen
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Keine Benachrichtigungen</p> : null}
          {items.map((n) => {
            const inner = (
              <div className={cn("flex gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/50", !n.readAt && "bg-brand/5")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone[n.level] ?? tone.info)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body ? <p className="truncate text-xs text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground" suppressHydrationWarning>
                    {fmt.relative(n.createdAt)}
                  </p>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} onClick={() => void markNotificationsRead([n.id])}>
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Darstellung">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTheme("light")}>
          <Sun /> Hell
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}>
          <Moon /> Dunkel
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}>
          <Monitor /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({
  user,
  notifications,
  badges,
  companyName,
}: {
  user: { fullName: string; email: string; role: string };
  notifications: NotificationItem[];
  badges: { inbox: number; tasks: number };
  companyName: string;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Trigger asChild>
          <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Menü">
            <Menu />
          </Button>
        </D.Trigger>
        <SheetContent className="left-0 right-auto max-w-72 border-r border-l-0 bg-sidebar p-3 data-[state=open]:slide-in-from-left">
          <D.Title className="sr-only">Navigation</D.Title>
          <div className="py-2">
            <Brand companyName={companyName} />
          </div>
          <SidebarNav badges={badges} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </D.Root>
      <div className="flex flex-1 items-center">
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-1">
        <Notifications items={notifications} />
        <ThemeToggle />
        <Button variant="ghost" size="icon-sm" asChild aria-label="Einstellungen">
          <Link href="/einstellungen">
            <Settings />
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex size-8 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand ring-offset-2 hover:ring-2 hover:ring-brand/30" aria-label="Benutzerprofil">
              {initials(user.fullName || user.email)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <p className="text-sm font-medium text-foreground">{user.fullName}</p>
              <p className="truncate text-xs font-normal">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/einstellungen?tab=profil">
                <User /> Mein Profil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/einstellungen">
                <Settings /> Einstellungen
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logoutAction()}>
              <LogOut /> Abmelden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
