import { EXPRESSIONS, type Expression } from '../screen/face';
import { MEMORY_KEYS, type Memory } from '../story/memories';
import type { GameState } from './types';
/** How a night ended; the silent purge (the driver left out) counts apart from PURGE 04. */
export type EndingKey = 'purge' | 'silent' | 'restore' | 'release' | 'decided' | 'nobody';
export const ENDING_KEYS: readonly EndingKey[] = [
  'purge',
  'silent',
  'restore',
  'release',
  'decided',
  'nobody',
];
/** What the operator has found over every night played, kept apart from the night itself. */
export interface Archive {
  /** Nights played to an ending. */
  nights: number;
  endings: EndingKey[];
  /** What the site assistant came to remember of being Anna (M1-M9). */
  memories: Memory[];
  faces: Expression[];
}
export const emptyArchive = (): Archive => ({ nights: 0, endings: [], memories: [], faces: [] });
/** The ending a finished night reached, or null while it runs. */
export function endingOf(state: GameState): EndingKey | null {
  if (state.phase !== 'terminated' || !state.ending) return null;
  return state.ending === 'purge' && state.flags.silentPurge ? 'silent' : state.ending;
}
const add = <T>(list: T[], item: T) => {
  if (list.includes(item)) return false;
  list.push(item);
  return true;
};
/**
 * Adds what this night has shown to the archive: its ending, the memories recovered and the
 * faces seen. Returns whether anything was new. A night is counted once, when it ends.
 */
export function recordArchive(
  archive: Archive,
  state: GameState,
  seen: Iterable<Expression>,
): boolean {
  let changed = false;
  for (const memory of MEMORY_KEYS)
    if (state.flags['memory:' + memory]) changed = add(archive.memories, memory) || changed;
  const faces = [...seen];
  // Anyone who has seen her face has seen her close her eyes: she blinks and she listens.
  if (faces.length) faces.push('closed');
  for (const face of faces) changed = add(archive.faces, face) || changed;
  const ending = endingOf(state);
  if (ending && !state.flags.archived) {
    state.flags.archived = true;
    archive.nights++;
    add(archive.endings, ending);
    changed = true;
  }
  return changed;
}
/** Reads an archive from a save, keeping only values the game knows. */
export function decodeArchive(value: unknown): Archive {
  const archive = emptyArchive();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return archive;
  const raw = value as Record<string, unknown>;
  const pick = <T>(list: unknown, known: readonly T[]) =>
    Array.isArray(list) ? known.filter((item) => list.includes(item)) : [];
  if (typeof raw.nights === 'number' && Number.isInteger(raw.nights))
    archive.nights = Math.max(0, Math.min(9999, raw.nights));
  archive.endings = pick(raw.endings, ENDING_KEYS);
  archive.memories = pick(raw.memories, MEMORY_KEYS);
  archive.faces = pick(raw.faces, EXPRESSIONS);
  return archive;
}
