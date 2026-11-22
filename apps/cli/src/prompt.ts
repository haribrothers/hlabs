// Questions on the terminal for `hlabs reset-password` (US-INST-25): typed passwords aren't shown. Answers can also be
// piped in, one per line.
import { createInterface } from 'node:readline';
import { CliError } from './daemon';

export type Prompt = (question: string, options?: { hidden?: boolean }) => Promise<string>;

const noAnswer = () => new CliError('Stopped: no answer was typed');

export function terminalPrompt(
  stdin: NodeJS.ReadStream = process.stdin,
  stdout: NodeJS.WriteStream = process.stdout,
): Prompt {
  if (!stdin.isTTY) {
    // Piped: one shared reader, so lines read ahead aren't lost between questions.
    const lines: string[] = [];
    const waiting: Array<(line: string | null) => void> = [];
    let ended = false;
    const reader = createInterface({ input: stdin, terminal: false });
    reader.on('line', (line) => (waiting.length ? waiting.shift()!(line) : lines.push(line)));
    reader.on('close', () => {
      ended = true;
      for (const resolve of waiting.splice(0)) resolve(null);
    });
    return async (question) => {
      stdout.write(question);
      const line = lines.length
        ? lines.shift()!
        : ended
          ? null
          : await new Promise<string | null>((r) => waiting.push(r));
      stdout.write('\n');
      if (line === null) throw noAnswer();
      return line;
    };
  }
  return (question, options) => (options?.hidden ? hidden(question, stdin, stdout) : visible(question, stdin, stdout));
}

function visible(question: string, stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve, reject) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    rl.once('close', () => reject(noAnswer()));
  });
}

/** Reads a line without showing it. */
function hidden(question: string, stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): Promise<string> {
  stdout.write(question);
  return new Promise((resolve, reject) => {
    let value = '';
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003' || ch === '\u0004') return finish(noAnswer());
        value = ch === '\u007f' || ch === '\b' ? [...value].slice(0, -1).join('') : value + ch;
      }
    };
    stdin.on('data', onData);
  });
}
