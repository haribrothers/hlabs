// First run: onboarding state and the one-time setup token that guards it (D-013, D-041, US-ONB-01).
import { hlabsError, onboardingStepSchema } from '@hlabs/api';
import { nextOnboardingStep, SKIPPABLE_ONBOARDING_STEPS, type OnboardingStep } from '@hlabs/shared';
import { getSetting, setSetting, users, type HlabsDb } from '@hlabs/db';
import { count } from 'drizzle-orm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SecretStore } from '../platform/secrets';

/** Secret-store ref of the setup token (04 `settings.onboarding.setupTokenRef`). */
export const SETUP_TOKEN_REF = 'onboarding.setupToken';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

export class OnboardingService {
  /** Only the hash is kept in memory; the plain token lives in the secret store. */
  private tokenHash: Buffer | null = null;

  constructor(
    private readonly db: HlabsDb,
    private readonly secrets: SecretStore,
    private readonly dashboardUrl: string,
  ) {}

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

  /** Marks onboarding done and deletes the token and its secret-store item (used by onboarding.complete). */
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
