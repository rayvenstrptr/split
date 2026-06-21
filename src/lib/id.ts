/** Short unique id for people and bills. */
export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}
