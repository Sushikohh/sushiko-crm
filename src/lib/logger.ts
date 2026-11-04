/** Strukturiertes JSON-Logging (stdout), kompatibel mit gängigen Log-Collectors. */
const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;
type Meta = Record<string, unknown>;

function threshold(): number {
  const l = (process.env.LOG_LEVEL as Level) || "info";
  return levels[l] ?? 20;
}

function write(level: Level, msg: string, meta?: Meta) {
  if (levels[level] < threshold()) return;
  const entry: Meta = { ts: new Date().toISOString(), level, msg };
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      entry[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
    }
  }
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function make(base: Meta = {}) {
  return {
    debug: (m: string, meta?: Meta) => write("debug", m, { ...base, ...meta }),
    info: (m: string, meta?: Meta) => write("info", m, { ...base, ...meta }),
    warn: (m: string, meta?: Meta) => write("warn", m, { ...base, ...meta }),
    error: (m: string, meta?: Meta) => write("error", m, { ...base, ...meta }),
    child: (extra: Meta) => make({ ...base, ...extra }),
  };
}

export const logger = make();
export type Logger = ReturnType<typeof make>;
