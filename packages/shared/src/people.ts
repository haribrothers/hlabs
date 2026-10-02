// People (09-account-people.md).

/**
 * Where a deleted person's kept Home folder goes (US-ACCT-16, D-101): `<username>-deleted-<yyyy-mm-dd>` beside the
 * other Home folders, the date in local time, so a later person with that username starts with an empty Home.
 */
export function keptHomeFolderName(username: string, at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${username}-deleted-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
