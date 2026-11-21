// A pretend hlabsd on loopback for the `hlabs` command's tests: it checks the tray token from a temporary data dir
// (D-035) and answers tray procedures from `answers`, asked again on every call.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, type Deps } from '../src/cli';
import { daemonClient } from '../src/daemon';
import type { Prompt } from '../src/prompt';

export const TOKEN = 'tray-token-1';

export interface Call {
  path: string;
  input: unknown;
}

export class PretendHlabs {
  readonly dir = mkdtempSync(join(tmpdir(), 'hlabs-cli-'));
  readonly calls: Call[] = [];
  private server: Server | undefined;
  port = 0;

  constructor() {
    writeFileSync(join(this.dir, 'tray.token'), `${TOKEN}\n`, { mode: 0o640 });
  }

  /** Answers each procedure with `answers[path](input)`; a thrown `{ hlabsCode }` is an error answer. */
  async start(answers: Record<string, (input: unknown) => unknown>): Promise<this> {
    await this.stop();
    this.server = createServer((req, res) => {
      const [path, query] = req.url!.replace(/^\/trpc\//, '').split('?') as [string, string | undefined];
      res.setHeader('content-type', 'application/json');
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: { data: { hlabsCode: 'TRAY_TOKEN_REJECTED' } } }));
        return;
      }
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        const raw = req.method === 'POST' ? body : new URLSearchParams(query ?? '').get('input');
        const input: unknown = raw ? JSON.parse(raw) : undefined;
        this.calls.push({ path, input });
        try {
          res.end(JSON.stringify({ result: { data: answers[path]!(input) } }));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: { data: { hlabsCode: (err as { hlabsCode?: string }).hlabsCode } } }));
        }
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.port = (this.server!.address() as { port: number }).port;
    return this;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise((resolve) => server.close(resolve));
  }

  async close(): Promise<void> {
    await this.stop();
    rmSync(this.dir, { recursive: true, force: true });
  }

  /** Runs `hlabs <argv>` against it; `answers` are typed at its questions in turn. */
  async cli(argv: string[], over: Partial<Deps> & { answers?: string[] } = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const asked: string[] = [];
    const answers = [...(over.answers ?? [])];
    const prompt: Prompt = async (question) => {
      asked.push(question);
      if (!answers.length) throw new Error(`No answer for "${question}"`);
      return answers.shift()!;
    };
    const code = await run(
      argv,
      { out: (l) => out.push(l), err: (l) => err.push(l) },
      {
        client: () => daemonClient({ dataDir: this.dir, port: this.port }),
        sleep: async () => {},
        prompt: () => prompt,
        isRoot: () => true,
        dataDir: this.dir,
        now: Date.now,
        runInstaller: () => 0,
        ...over,
      },
    );
    return { code, out: out.join('\n'), err: err.join('\n'), asked };
  }
}
