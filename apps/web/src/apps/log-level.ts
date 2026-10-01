// A log line's level (US-APP-08), from the forms apps commonly write: JSON `"level":"error"`, `level=warn`,
// `[warn]`, or a capitalised word such as `INFO`. FATAL, CRITICAL and PANIC count as ERROR. Lines without one get none.
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

const NAMES: Record<string, LogLevel> = {
  fatal: 'ERROR',
  critical: 'ERROR',
  crit: 'ERROR',
  panic: 'ERROR',
  error: 'ERROR',
  err: 'ERROR',
  eror: 'ERROR',
  warning: 'WARN',
  warn: 'WARN',
  wrn: 'WARN',
  info: 'INFO',
  inf: 'INFO',
  notice: 'INFO',
  debug: 'DEBUG',
  dbg: 'DEBUG',
  trace: 'DEBUG',
};

const PATTERNS = [
  /"(?:level|severity|lvl)"\s*:\s*"([a-z]+)"/i,
  /\b(?:level|lvl|severity)=["']?([a-z]+)/i,
  /\[([a-z]+)\]/i,
  /\b(FATAL|CRITICAL|CRIT|PANIC|ERROR|ERR|WARNING|WARN|INFO|NOTICE|DEBUG|TRACE)\b/,
];

/** Only the start of a line is looked at: a level comes first, and long lines stay cheap. */
const HEAD = 200;

export function logLevel(line: string): LogLevel | null {
  const head = line.slice(0, HEAD);
  for (const pattern of PATTERNS) {
    const level = NAMES[pattern.exec(head)?.[1]?.toLowerCase() ?? ''];
    if (level) return level;
  }
  return null;
}
