import {
  HISTORY_LIMIT,
  MODEL_CHOICES,
  TEXT_SPEEDS,
  defaultSettings,
  newGame,
  type GameState,
  type Settings,
} from './types';
import type { FileEntry } from '../os/fs/FileSystem';
import { validName } from '../os/fs/paths';
import { bootedShell, deletedAtStart, recoveryFile } from '../story/disk/image';
import { newMachine, type MachineState } from '../os/system/Machine';
import { decodeArchive, type Archive } from './archive';
import { clue } from '../story/clues';
export interface Save {
  version: 2;
  game: GameState;
  settings: Settings;
  /** Endings, memories and faces found over every night; older saves have none. */
  archive: Archive;
}
/** Largest save accepted: the story state plus every file the player wrote. */
export const SAVE_LIMIT = 1_000_000;
const RECOVERY = 'C:\\LIMBIC\\RECOVERY.BIN';
const phases = [
  'cold_boot',
  'operator_shell',
  'diagnostic_contact',
  'conversation',
  'impossible_color',
  'final_choice',
  'terminated',
];
const kinds = ['dir', 'text', 'wp', 'sheet', 'bin', 'exe', 'batch'];
const validPath = (path: unknown) =>
  typeof path === 'string' &&
  path.length <= 128 &&
  /^C:\\/.test(path) &&
  (path === 'C:\\' || path.slice(3).split('\\').every(validName));
const validEntry = (entry: FileEntry) =>
  !!entry &&
  typeof entry === 'object' &&
  kinds.includes(entry.kind) &&
  typeof entry.content === 'string' &&
  entry.content.length <= 200_000 &&
  /^\d\d-\d\d-\d\d$/.test(entry.date) &&
  /^\d\d:\d\d$/.test(entry.time) &&
  typeof entry.attrs === 'string' &&
  /^[RHSA]*$/.test(entry.attrs) &&
  (entry.size === undefined ||
    (Number.isInteger(entry.size) && entry.size >= 0 && entry.size <= 100_000_000)) &&
  (entry.damaged === undefined || typeof entry.damaged === 'boolean') &&
  (entry.restricted === undefined || typeof entry.restricted === 'boolean');
function validMachine(machine: MachineState) {
  const states = ['running', 'suspended', 'offline'];
  return (
    !!machine &&
    typeof machine === 'object' &&
    !!machine.processes &&
    ['01', '02', '03', '04'].every((id) => id in machine.processes) &&
    Object.entries(machine.processes).every(
      ([id, state]) => /^0[1-6]$/.test(id) && states.includes(state),
    ) &&
    [4, 6].includes(Object.keys(machine.processes).length) &&
    Number.isFinite(machine.cell) &&
    machine.cell >= 0 &&
    machine.cell <= 100 &&
    ['OP-17', 'SUPERVISOR'].includes(machine.user) &&
    Number.isInteger(machine.clockOffset) &&
    Math.abs(machine.clockOffset) <= 86400 &&
    Number.isInteger(machine.dateOffset) &&
    Math.abs(machine.dateOffset) <= 40000 &&
    typeof machine.limbicLoaded === 'boolean'
  );
}
function validOs(os: GameState['os']) {
  if (!os || typeof os !== 'object' || !os.shell || typeof os.shell !== 'object') return false;
  const env = os.shell.env;
  if (
    !validPath(os.shell.cwd) ||
    !env ||
    typeof env !== 'object' ||
    Array.isArray(env) ||
    Object.keys(env).length > 32 ||
    !Object.entries(env).every(
      ([name, value]) =>
        /^[A-Z_][A-Z0-9_]{0,31}$/.test(name) && typeof value === 'string' && value.length <= 256,
    )
  )
    return false;
  if (!os.changes || typeof os.changes !== 'object' || Array.isArray(os.changes)) return false;
  if (
    !Object.entries(os.changes).every(
      ([path, entry]) => validPath(path) && (entry === null || validEntry(entry)),
    )
  )
    return false;
  if (os.machine !== undefined && !validMachine(os.machine)) return false;
  return (
    Array.isArray(os.deleted) &&
    os.deleted.length <= 50 &&
    os.deleted.every((d) => !!d && validPath(d.path) && validEntry(d.entry))
  );
}
const validMessages = (messages: unknown) =>
  Array.isArray(messages) &&
  messages.length <= HISTORY_LIMIT &&
  messages.every(
    (m: { role: string; content: unknown }) =>
      !!m &&
      ['user', 'assistant'].includes(m.role) &&
      typeof m.content === 'string' &&
      m.content.length <= 2000,
  );
/** Both conversations, or (before the second voice) the single one, which was the assistant's. */
function validChats(state: { chats?: unknown; recentMessages?: unknown }) {
  if (state.chats === undefined) return validMessages(state.recentMessages);
  const chats = state.chats as Record<string, unknown>;
  return (
    !!chats &&
    typeof chats === 'object' &&
    validMessages(chats.assistant) &&
    validMessages(chats.other)
  );
}
export function decodeSave(raw: string | null): Save | null {
  if (!raw || raw.length > SAVE_LIMIT) return null;
  try {
    const value = JSON.parse(raw);
    const state = value.game;
    if (![1, 2].includes(value.version) || state?.schemaVersion !== value.version) return null;
    if (
      !phases.includes(state.phase) ||
      !validChats(state) ||
      (state.speaker !== undefined && !['assistant', 'other'].includes(state.speaker)) ||
      (state.otherTurns !== undefined &&
        (!Number.isInteger(state.otherTurns) || state.otherTurns < 0 || state.otherTurns > 20)) ||
      !Number.isFinite(state.fictionalClockSeconds) ||
      !Number.isInteger(state.meaningfulDialogueTurns) ||
      state.meaningfulDialogueTurns < 0 ||
      !state.flags ||
      typeof state.flags !== 'object' ||
      Array.isArray(state.flags) ||
      !Object.values(state.flags).every((v) => typeof v === 'boolean') ||
      !Array.isArray(state.seenDialogue) ||
      !state.seenDialogue.every((t: unknown) => typeof t === 'string' && t.length <= 512) ||
      (state.ending !== undefined &&
        !['purge', 'restore', 'release', 'nobody', 'decided'].includes(state.ending)) ||
      (state.suspicion !== undefined &&
        (typeof state.suspicion !== 'number' ||
          !Number.isFinite(state.suspicion) ||
          state.suspicion < 0 ||
          state.suspicion > 100)) ||
      (state.takeoverClock !== undefined &&
        (typeof state.takeoverClock !== 'number' || !Number.isFinite(state.takeoverClock))) ||
      (state.contactClock !== undefined &&
        (typeof state.contactClock !== 'number' ||
          !Number.isFinite(state.contactClock) ||
          state.contactClock < 0)) ||
      (state.photographClock !== undefined &&
        (typeof state.photographClock !== 'number' ||
          !Number.isFinite(state.photographClock) ||
          state.photographClock < 0 ||
          state.photographClock > 86_400 * 7)) ||
      (state.operatorName !== undefined &&
        (typeof state.operatorName !== 'string' ||
          !/^[\x20-\x7e]{1,24}$/.test(state.operatorName))) ||
      (state.phase === 'terminated' && !state.ending) ||
      (state.act !== undefined && ![1, 2, 3, 4, 5].includes(state.act)) ||
      (state.clueOrder !== undefined &&
        (!Array.isArray(state.clueOrder) ||
          !state.clueOrder.every((id: unknown) => typeof id === 'string' && !!clue(id)))) ||
      (value.version === 2 && !validOs(state.os))
    )
      return null;
    const game: GameState = { ...newGame(), ...state, schemaVersion: 2 };
    if (value.version === 2 && !game.os.machine) game.os.machine = newMachine();
    // Machines from before the maintenance units and the air were on the bus, and the old seal.
    const machine = game.os.machine as MachineState & { seal?: unknown };
    machine.processes = { ...newMachine().processes, ...machine.processes };
    delete machine.seal;
    if (value.version === 1) {
      // Version 1 kept a flat file list; the session resumes on the new disk as AUTOEXEC left it.
      delete (game as GameState & { unlockedFiles?: string[] }).unlockedFiles;
      game.os = {
        shell: bootedShell(),
        changes: {},
        deleted: deletedAtStart(),
        machine: newMachine(),
      };
    }
    // Saves from before the second voice kept one conversation: the assistant's.
    const old = game as GameState & { recentMessages?: GameState['chats']['assistant'] };
    if (state.chats === undefined) game.chats = { assistant: old.recentMessages ?? [], other: [] };
    delete old.recentMessages;
    // Saves from before the story rewrite knew the decision as the "anomaly".
    if (game.flags.anomaly) game.flags.photograph = true;
    delete game.flags.anomaly;
    if (
      game.phase === 'impossible_color' ||
      game.phase === 'final_choice' ||
      game.flags.photograph
    ) {
      game.flags.photograph = true;
      game.flags.contact = true;
      game.act = Math.max(game.act, 4) as GameState['act'];
      if (game.phase !== 'terminated') game.phase = 'final_choice';
      if (!game.os.changes[RECOVERY]) game.os.changes[RECOVERY] = recoveryFile();
    } else delete game.os.changes[RECOVERY];
    if (game.phase === 'conversation' || game.phase === 'diagnostic_contact')
      game.flags.contact = true;
    game.connected = Boolean(game.connected && game.flags.contact && game.phase !== 'terminated');
    const settings = { ...defaultSettings };
    for (const key of [
      'reducedFlicker',
      'highContrast',
      'warningSeen',
      'bootCompleted',
      'guided',
    ] as const) {
      if (typeof value.settings?.[key] === 'boolean') settings[key] = value.settings[key];
    }
    if (TEXT_SPEEDS.includes(value.settings?.textSpeed))
      settings.textSpeed = value.settings.textSpeed;
    if (MODEL_CHOICES.includes(value.settings?.model)) settings.model = value.settings.model;
    for (const key of ['bloom', 'volume', 'hum', 'keyboard', 'effects'] as const) {
      if (typeof value.settings?.[key] === 'number' && Number.isFinite(value.settings[key]))
        settings[key] = Math.max(0, Math.min(1, value.settings[key]));
    }
    return { version: 2, game, settings, archive: decodeArchive(value.archive) };
  } catch {
    return null;
  }
}
