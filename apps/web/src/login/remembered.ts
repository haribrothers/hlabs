// The account last logged in on this device (US-AUTH-06): localStorage `hlabs.lastUser`, no secrets in it.
export const LAST_USER_KEY = 'hlabs.lastUser';

export interface RememberedUser {
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  avatarColor: string | null;
}

export function readRememberedUser(storage: Storage = window.localStorage): RememberedUser | null {
  try {
    const value = JSON.parse(storage.getItem(LAST_USER_KEY) ?? 'null') as Partial<RememberedUser> | null;
    if (!value || typeof value.username !== 'string' || typeof value.displayName !== 'string') return null;
    return {
      username: value.username,
      displayName: value.displayName,
      role: value.role === 'admin' ? 'admin' : 'member',
      avatarColor: typeof value.avatarColor === 'string' ? value.avatarColor : null,
    };
  } catch {
    return null;
  }
}

export function writeRememberedUser(user: RememberedUser, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(LAST_USER_KEY, JSON.stringify(user));
  } catch {
    // Storage blocked: the list or the username form still work.
  }
}

export function forgetRememberedUser(storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(LAST_USER_KEY);
  } catch {
    // Nothing to forget.
  }
}
