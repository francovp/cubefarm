/**
 * What a floor's preview env may add up to, and the one place those numbers are measured, so the settings box and the
 * server turn away the same input for the same reason. Budgeted in characters, not variables: a project's .env is
 * routinely dozens of short variables, and Windows caps a process environment block at 32767 characters.
 */

/** The most characters a floor's preview env may add up to. */
export const PREVIEW_ENV_MAX_CHARS = 8000;

/** The most any one value may hold, so a single pasted blob can't spend the whole budget on its own. */
export const PREVIEW_ENV_MAX_VALUE_CHARS = 4000;

/** How many characters `env` takes in a process environment: KEY=value per variable, and one `=` each. */
export function previewEnvChars(env: Record<string, string>): number {
  let chars = 0;
  for (const [k, v] of Object.entries(env)) chars += k.length + v.length + 1;
  return chars;
}
