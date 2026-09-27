import { z } from 'zod';
import { io } from '../trpc';
import { empty, jobRefSchema, ok, pageInputSchema, pending } from './common';

/** Virtual paths: /home, /shared, /users/<u>, /appdata/<id>, /drives/<id> (resolved and jailed server-side). */
export const virtualPathSchema = z.string().min(1).max(4096).startsWith('/');
const pathRef = z.object({ path: virtualPathSchema });
const pathsRef = z.object({ paths: z.array(virtualPathSchema).min(1) });

export const files = {
  list: io(pathRef.extend({ sort: z.enum(['name', 'modified', 'size', 'kind']).optional() }), pending),
  stat: io(pathRef, pending),
  recent: io(empty, pending),
  listTrash: io(pageInputSchema, pending),
  openWith: io(pathRef, pending),
  preview: io(
    pathRef.extend({ width: z.number().int().optional() }),
    z.object({ url: z.string(), expiresAt: z.number() }),
  ),
  search: io(z.object({ query: z.string().min(1).max(200), path: virtualPathSchema.optional() }), pending),
  mkdir: io(pathRef, ok),
  rename: io(pathRef.extend({ name: z.string().min(1).max(255) }), ok),
  move: io(pathsRef.extend({ to: virtualPathSchema }), z.union([ok, jobRefSchema])),
  copy: io(pathsRef.extend({ to: virtualPathSchema }), z.union([ok, jobRefSchema])),
  trash: io(pathsRef, ok),
  restoreFromTrash: io(z.object({ ids: z.array(z.string()).min(1) }), ok),
  emptyTrash: io(z.object({ allUsers: z.boolean().optional() }).optional(), ok),
  shares: {
    get: io(pathRef, pending),
    set: io(pathRef.extend({ name: z.string(), readOnly: z.boolean(), users: z.array(z.string()) }), ok),
    remove: io(pathRef, ok),
  },
};
