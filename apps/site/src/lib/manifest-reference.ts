// The app manifest reference (US-SITE-07, D-147) comes from the schema the daemon itself checks manifests with, so it
// can't drift: each field with its type, whether it's needed, its default and allowed values.
import { AppManifest } from '@hlabs/app-manifest';
import { z } from 'zod';

export interface Field {
  path: string;
  type: string;
  required: boolean;
  default: string | null;
  allowed: string | null;
  depth: number;
}

type Schema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  format?: string;
  pattern?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  anyOf?: Schema[];
  default?: unknown;
};

const typeOf = (s: Schema): string => {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return 'one of';
  if (s.anyOf) return s.anyOf.map(typeOf).join(' or ');
  if (s.type === 'array') return `list of ${s.items ? typeOf(s.items) : 'values'}`;
  if (s.format === 'uri') return 'URL';
  return Array.isArray(s.type) ? s.type.join(' or ') : (s.type ?? 'value');
};

function walk(schema: Schema, prefix: string, depth: number, out: Field[]) {
  const props = schema.properties ?? {};
  for (const [name, s] of Object.entries(props)) {
    const path = prefix ? `${prefix}.${name}` : name;
    out.push({
      path,
      type: typeOf(s),
      required: (schema.required ?? []).includes(name) && s.default === undefined,
      default: s.default === undefined ? null : JSON.stringify(s.default),
      allowed: s.enum ? s.enum.map(String).join(', ') : null,
      depth,
    });
    const inner = s.type === 'array' ? s.items : s;
    if (inner?.properties && depth < 2) walk(inner, s.type === 'array' ? `${path}[]` : path, depth + 1, out);
  }
}

export function manifestFields(): Field[] {
  const json = z.toJSONSchema(AppManifest, { io: 'input', unrepresentable: 'any' }) as Schema;
  const out: Field[] = [];
  walk(json, '', 0, out);
  return out;
}
