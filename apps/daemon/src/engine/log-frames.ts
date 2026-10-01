// Docker's container logs, as lines (US-APP-08). Without a TTY the stream is multiplexed: frames of an 8-byte header
// (stream type, three zero bytes, a big-endian length) and that many bytes. With `timestamps` each line starts with an
// RFC 3339 time and a space. Lines can span frames, so partial lines wait for the rest.

export interface ContainerLogLine {
  stream: 'stdout' | 'stderr';
  /** ms since the epoch, from Docker's timestamp. */
  ts: number;
  line: string;
}

const HEADER = 8;

export class LogFrames {
  private pending: Buffer = Buffer.alloc(0);
  private readonly partial = { stdout: '', stderr: '' };

  /** `tty`: the container has a terminal, so its output isn't multiplexed (all of it is stdout). */
  constructor(private readonly tty: boolean) {}

  /** Takes the next bytes and gives the lines they complete. */
  push(chunk: Buffer): ContainerLogLine[] {
    if (this.tty) return this.text('stdout', chunk.toString('utf8'));
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    const lines: ContainerLogLine[] = [];
    while (this.pending.length >= HEADER) {
      const size = this.pending.readUInt32BE(4);
      if (this.pending.length < HEADER + size) break;
      const stream = this.pending[0] === 2 ? 'stderr' : 'stdout';
      lines.push(...this.text(stream, this.pending.subarray(HEADER, HEADER + size).toString('utf8')));
      this.pending = this.pending.subarray(HEADER + size);
    }
    return lines;
  }

  /** The stream ended: any line without its newline yet. */
  flush(): ContainerLogLine[] {
    const lines = (['stdout', 'stderr'] as const).filter((s) => this.partial[s]).map((s) => parse(s, this.partial[s]));
    this.partial.stdout = this.partial.stderr = '';
    return lines;
  }

  private text(stream: 'stdout' | 'stderr', text: string): ContainerLogLine[] {
    const parts = (this.partial[stream] + text).split('\n');
    this.partial[stream] = parts.pop() ?? '';
    return parts.map((raw) => parse(stream, raw));
  }
}

/** `2024-05-01T17:02:11.123456789Z Starting server` → its time and the message (a carriage return dropped). */
export function parse(stream: 'stdout' | 'stderr', raw: string): ContainerLogLine {
  const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
  const space = text.indexOf(' ');
  const ts = space > 0 ? Date.parse(text.slice(0, space)) : Number.NaN;
  return Number.isFinite(ts) ? { stream, ts, line: text.slice(space + 1) } : { stream, ts: Date.now(), line: text };
}
