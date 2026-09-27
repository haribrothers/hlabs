// First run: onboarding state and the one-time setup token that guards it (D-013, D-041, US-ONB-01).
import { hlabsError, onboardingStepSchema } from '@hlabs/api';
import {
  enabledOnboardingSteps,
  nextOnboardingStep,
  SKIPPABLE_ONBOARDING_STEPS,
  ulid,
  type OnboardingStep,
} from '@hlabs/shared';
import { auditLog, getSetting, setSetting, storageLocations, users, type HlabsDb } from '@hlabs/db';
import { count, eq } from 'drizzle-orm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SecretStore } from '../platform/secrets';
import { readInstallLog } from '../engine/install-job';
import type { EventBus } from '../events/bus';
import type { JobRunner } from '../jobs/runner';
import { runSystemCheck, type SystemCheck, type SystemCheckDeps } from './system-check';

/** Secret-store ref of the setup token (04 `settings.onboarding.setupTokenRef`). */
export const SETUP_TOKEN_REF = 'onboarding.setupToken';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

export class OnboardingService {
  /** Only the hash is kept in memory; the plain token lives in the secret store. */
  private tokenHash: Buffer | null = null;

  private readonly db: HlabsDb;
  private readonly secrets: SecretStore;
  private readonly dashboardUrl: string;

  constructor(
    private readonly deps: {
      db: HlabsDb;
      secrets: SecretStore;
      dashboardUrl: string;
      jobs: JobRunner;
      bus: EventBus;
      dataDir: string;
      /** False in e2e (HLABS_DEV_NO_ENGINE_INSTALL). */
      engineInstallAllowed?: boolean;
      systemCheck: SystemCheckDeps;
    },
  ) {
    this.db = deps.db;
    this.secrets = deps.secrets;
    this.dashboardUrl = deps.dashboardUrl;
  }

  get completed(): boolean {
    return getSetting(this.db, 'onboarding').completedAt !== null;
  }

  status() {
    const { completedAt, step } = getSetting(this.db, 'onboarding');
    const hasUsers = (this.db.select({ n: count() }).from(users).get()?.n ?? 0) > 0;
    const parsed = onboardingStepSchema.safeParse(step);
    return { completed: completedAt !== null, step: parsed.success ? parsed.data : 'welcome', hasUsers };
  }

  /**
   * Moves past a step that needs no action (Get started on the welcome screen, US-ONB-02). Only the next
   * enabled step is accepted; repeating the saved step is a no-op (two tabs, double clicks).
   */
  setStep(step: OnboardingStep): void {
    const current = this.status().step;
    if (step === current) return;
    if (!SKIPPABLE_ONBOARDING_STEPS.includes(current) || nextOnboardingStep(current) !== step) {
      throw hlabsError('ONBOARDING_STEP_INVALID');
    }
    setSetting(this.db, 'onboarding', { ...getSetting(this.db, 'onboarding'), step });
  }

  /** The system check (US-ONB-04). Read-only; the engine is detected again each time. */
  async checkSystem(opts: { includeLog?: boolean } = {}): Promise<SystemCheck> {
    const check = await runSystemCheck(this.deps.systemCheck);
    const job = this.deps.jobs.latest('engine_install');
    if (!job) return check;
    const install = {
      jobId: job.id,
      state: job.state,
      progress: job.progress,
      lastLogLine: job.message,
      hlabsCode: job.hlabsCode,
      ...(opts.includeLog ? { log: await readInstallLog(this.deps.dataDir) } : {}),
    };
    return { ...check, engine: { ...check.engine, install } };
  }

  /**
   * Installs hlabs's own Colima (US-ONB-05): macOS only, only when no engine is found. A running install is
   * returned instead of starting another (reloads, several tabs).
   */
  async installEngine(): Promise<string> {
    const { probe } = this.deps.systemCheck;
    if ((await probe.os()).platform !== 'darwin' || this.deps.engineInstallAllowed === false) {
      throw hlabsError('ENGINE_INSTALL_UNSUPPORTED');
    }
    const current = this.deps.jobs.latest('engine_install');
    if (current && (current.state === 'queued' || current.state === 'running')) return current.id;
    // Not next to an engine that is only stopped, or that this account can't open (US-ONB-07).
    if ((await runSystemCheck(this.deps.systemCheck)).engine.state !== 'missing') {
      throw hlabsError('VALIDATION_FAILED', 'A container engine is already present');
    }
    return this.deps.jobs.start('engine_install');
  }

  /**
   * Continue on the system check: blocking checks must pass; saves start at login and the web ports Caddy
   * will use, and moves on to the account step (a later saved step is kept).
   */
  async confirmSystem(startAtLogin: boolean): Promise<void> {
    const saved = this.status().step;
    if (saved === 'welcome') throw hlabsError('ONBOARDING_STEP_INVALID');
    const check = await this.checkSystem();
    if (check.engine.level === 'error') throw hlabsError('ENGINE_UNAVAILABLE');
    if (check.disk.level === 'error') throw hlabsError('DISK_FULL');

    const startup = getSetting(this.db, 'startup');
    setSetting(this.db, 'startup', { ...startup, startAtLogin });
    // The tray applies start at login (D-042).
    if (startup.startAtLogin !== startAtLogin) this.deps.bus.emit('startup.changeRequested', { startAtLogin });
    setSetting(this.db, 'network', {
      ...getSetting(this.db, 'network'),
      ports: { http: check.ports.http.use, https: check.ports.https.use },
    });
    const steps = enabledOnboardingSteps();
    const next = nextOnboardingStep('system');
    if (steps.indexOf(saved) < steps.indexOf(next)) {
      setSetting(this.db, 'onboarding', { ...getSetting(this.db, 'onboarding'), step: next });
    }
  }

  /**
   * Called at boot while onboarding is incomplete: reuses the token from the secret store so earlier
   * URLs keep working after a restart, or makes a new one (32 random bytes, base64url).
   * Returns the setup URL, or null once onboarding is complete.
   */
  async prepareSetupToken(): Promise<string | null> {
    if (this.completed) {
      this.tokenHash = null;
      return null;
    }
    const current = getSetting(this.db, 'onboarding');
    let token = current.setupTokenRef ? await this.secrets.get(current.setupTokenRef) : null;
    if (!token) {
      token = randomBytes(32).toString('base64url');
      await this.secrets.set(SETUP_TOKEN_REF, token);
      setSetting(this.db, 'onboarding', { ...current, setupTokenRef: SETUP_TOKEN_REF });
    }
    this.tokenHash = sha256(token);
    return this.urlFor(token);
  }

  /** The setup URL rebuilt from the secret store (dev route now; tray.setupUrl and `hlabs setup-url` later). */
  async setupUrl(): Promise<string | null> {
    const { completedAt, setupTokenRef } = getSetting(this.db, 'onboarding');
    if (completedAt !== null || !setupTokenRef) return null;
    const token = await this.secrets.get(setupTokenRef);
    return token ? this.urlFor(token) : null;
  }

  /** Constant-time check of the `x-hlabs-setup` header; always false once onboarding is complete. */
  verifySetupToken(candidate: string | null | undefined): boolean {
    if (!candidate || !this.tokenHash || this.completed) return false;
    return timingSafeEqual(sha256(candidate), this.tokenHash);
  }

  /**
   * onboarding.complete (US-ONB-14, US-ONB-22): needs an admin and a root storage location, then marks onboarding
   * done, retires the setup token and records it in the audit log.
   */
  async complete(opts: { userId: string; ip: string | null; now?: number }): Promise<void> {
    const hasRoot = this.db.select().from(storageLocations).where(eq(storageLocations.isRoot, true)).get();
    if (!this.status().hasUsers || !hasRoot) throw hlabsError('ONBOARDING_INCOMPLETE');
    const now = opts.now ?? Date.now();
    await this.markComplete(now);
    this.db
      .insert(auditLog)
      .values({
        id: ulid(),
        at: now,
        userId: opts.userId,
        action: 'onboarding.complete',
        target: null,
        detailJson: null,
        ip: opts.ip,
      })
      .run();
  }

  /** Marks onboarding done and deletes the token and its secret-store item. */
  async markComplete(now = Date.now()): Promise<void> {
    const current = getSetting(this.db, 'onboarding');
    if (current.setupTokenRef) await this.secrets.delete(current.setupTokenRef);
    setSetting(this.db, 'onboarding', { completedAt: now, step: 'done', setupTokenRef: null });
    this.tokenHash = null;
  }

  private urlFor(token: string) {
    return `${this.dashboardUrl}/setup?token=${token}`;
  }
}
