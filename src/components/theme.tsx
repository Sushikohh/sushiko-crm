"use client";

import * as React from "react";

/**
 * Schlanke Theme-Verwaltung (hell/dunkel/System) ohne zusätzliches Laufzeit-Skript im React-Baum.
 * Das initiale Setzen der Klasse erfolgt per Inline-Skript im <head> (siehe THEME_INIT_SCRIPT),
 * damit beim Laden kein Aufblitzen entsteht.
 */
export type Theme = "light" | "dark" | "system";
const KEY = "theme";

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) || "system";
  } catch {
    return "system";
  }
}

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* privater Modus */
  }
  apply(t);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (read() === "system") apply("system");
    cb();
  };
  mq.addEventListener("change", onChange);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onChange);
  };
}

/** Liefert das gewählte Theme; auf dem Server `null` (vermeidet Hydration-Abweichungen). */
export function useTheme(): { theme: Theme | null; setTheme: (t: Theme) => void } {
  const theme = React.useSyncExternalStore(subscribe, read, () => null);
  return { theme, setTheme };
}
