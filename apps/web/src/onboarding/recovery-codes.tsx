// The recovery codes shown once after two-factor is turned on (US-ONB-11 → US-ONB-12).
export function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <ul className="m-0 mt-6 grid list-none grid-cols-2 gap-2 p-0" aria-label="Recovery codes">
      {codes.map((code) => (
        <li key={code} className="rounded-sm bg-surface-input px-3 py-2 font-mono text-mono">
          {code}
        </li>
      ))}
    </ul>
  );
}
