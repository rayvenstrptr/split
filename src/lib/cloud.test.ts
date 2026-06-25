import { describe, it, expect } from 'vitest';
import type { SavedSession } from '../types';
import { normalizeUsername, isValidPin } from './cloud';
import { buildBackup, parseBackupData } from './backup';

const session = (id: string, savedAt = 1): SavedSession => ({
  id,
  name: `Session ${id}`,
  savedAt,
  state: { people: [], bills: [] },
});

describe('normalizeUsername', () => {
  it('lowercases and trims so casing/spacing collide', () => {
    expect(normalizeUsername('  Andi ')).toBe('andi');
    expect(normalizeUsername('ANDI')).toBe(normalizeUsername('andi'));
  });
});

describe('isValidPin', () => {
  it('accepts exactly four digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('0000')).toBe(true);
  });

  it('rejects wrong length or non-digits', () => {
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('')).toBe(false);
    expect(isValidPin(' 123')).toBe(false);
  });
});

describe('parseBackupData (cloud pull blob)', () => {
  it('reads sessions from a buildBackup() blob', () => {
    const blob = buildBackup([session('a'), session('b')]);
    expect(parseBackupData(blob).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('throws on an empty vault so cloud.pull can map it to []', () => {
    // A freshly claimed vault holds buildBackup([]) — no sessions.
    expect(() => parseBackupData(buildBackup([]))).toThrow();
    expect(() => parseBackupData({})).toThrow();
  });
});
