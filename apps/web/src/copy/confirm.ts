// The shared confirm dialog (US-STATE-11…13). Callers give the title (a question naming the thing), the body (what
// happens) and the verb on the confirm button; never "OK" or "Yes".
export const confirmCopy = {
  cancel: 'Cancel',
  /** When the action outlasts the dialog (30 s) and then succeeds. */
  finished: (confirmLabel: string) => `${confirmLabel} finished`,
};
