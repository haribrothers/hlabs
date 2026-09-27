// Column helpers: ULID text ids, integer ms UTC timestamps, 0/1 booleans (docs/prd/04-data-model.md).
import { integer, text } from 'drizzle-orm/sqlite-core';

export const id = () => text('id').primaryKey();
export const ms = (name: string) => integer(name);
export const bool = (name: string) => integer(name, { mode: 'boolean' });
export const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();
