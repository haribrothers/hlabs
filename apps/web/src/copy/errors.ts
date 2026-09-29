// Plain-words errors by hlabsCode (US-STATE-12, US-STATE-17): what went wrong and what to do next.
export const errorCopy = {
  generic: 'Something went wrong. Try again. If it keeps happening, check the logs in Settings › Advanced.',
  offline: "Can't reach hlabs right now. Check your connection and try again.",
  codes: {
    JOB_EXCLUSIVE_RUNNING: 'hlabs is busy with something that must finish first. Try again when it’s done.',
    ENGINE_UNAVAILABLE: "The container engine isn't running. Start it in Settings › Engine & startup.",
    ENGINE_START_FAILED: "The engine didn't start. Try again, or restart this computer.",
    AUTH_LOCKED: (detail: Record<string, unknown>) => {
      const seconds = typeof detail.retryAfterSeconds === 'number' ? detail.retryAfterSeconds : 900;
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      return `Too many wrong passwords. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
    },
    ACCESS_DENIED: "You don't have access to this. Ask an admin.",
    NOT_FOUND: "This isn't here any more. It may have been removed.",
    DISK_FULL: 'This computer is out of disk space. Free up some space and try again.',
  } as Record<string, string | ((detail: Record<string, unknown>) => string)>,
};
