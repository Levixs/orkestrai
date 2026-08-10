/** Builds PTY input for a terminal transcript without affecting regular text fields. */
export function terminalDictationInput(text: string, autoSubmit: boolean): string {
  return autoSubmit ? `${text}\r` : text;
}
