// Secrets live in the OS keychain (or an encrypted file on headless Linux), never in SQLite (07 §7.7).
// The keychain-backed store ships with the first story that stores a secret (phase 1).

export interface SecretStore {
  get(ref: string): Promise<string | null>;
  set(ref: string, value: string): Promise<void>;
  delete(ref: string): Promise<void>;
}

/** In-memory store for tests and early development. */
export class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();
  async get(ref: string) {
    return this.values.get(ref) ?? null;
  }
  async set(ref: string, value: string) {
    this.values.set(ref, value);
  }
  async delete(ref: string) {
    this.values.delete(ref);
  }
}
