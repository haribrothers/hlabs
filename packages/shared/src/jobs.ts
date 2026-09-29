// Job kinds that run alone (D-020): while one runs no other job starts, and it waits for running ones. Shared so the
// dashboard can explain a waiting button without importing the API package (US-SYS-18).
export const EXCLUSIVE_JOB_KINDS = [
  'system_update',
  'restore',
  'move_all_data',
  'engine_switch',
  'rename_host',
  'factory_reset',
] as const;
