/** Where a command writes: its answer, and what went wrong. */
export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}
