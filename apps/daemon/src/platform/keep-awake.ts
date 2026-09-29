// "Keep this computer awake" (US-SYS-20): while the setting is on and at least one app runs, hold a sleep assertion
// (macOS `caffeinate -i`, tied to the daemon so it ends with it; Linux `systemd-inhibit --what=sleep`). The display
// can still turn off. Behind an interface so tests never start a real one.
import { spawn, type ChildProcess } from 'node:child_process';

export interface SleepBlocker {
  readonly active: boolean;
  start(): void;
  stop(): void;
}

export function processSleepBlocker(platform: NodeJS.Platform = process.platform): SleepBlocker {
  let child: ChildProcess | null = null;
  return {
    get active() {
      return child !== null;
    },
    start() {
      if (child) return;
      child =
        platform === 'darwin'
          ? spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' })
          : spawn(
              'systemd-inhibit',
              ['--what=sleep', '--who=hlabs', '--why=Apps are running', '--mode=block', 'sleep', 'infinity'],
              { stdio: 'ignore' },
            );
      child.on('exit', () => (child = null));
      child.on('error', () => (child = null));
    },
    stop() {
      child?.kill();
      child = null;
    },
  };
}

/** Decides when to block sleep: the setting is on and an app is running. */
export class KeepAwake {
  constructor(
    private readonly blocker: SleepBlocker,
    private readonly state: () => { keepAwake: boolean; appsRunning: number },
  ) {}

  update(): void {
    const { keepAwake, appsRunning } = this.state();
    if (keepAwake && appsRunning > 0) this.blocker.start();
    else this.blocker.stop();
  }

  stop(): void {
    this.blocker.stop();
  }
}
