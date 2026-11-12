import type { GameState } from './types';
export const commandNames = [
  'HELP',
  'DIR',
  'TYPE',
  'STATUS',
  'CONNECT',
  'DISCONNECT',
  'CLS',
  'DATE',
  'TIME',
  'VER',
  'MEM',
  'HISTORY',
  'PURGE',
  'RESTORE',
  'CONFIG',
  // Operator tools and programs stay local in the channel too; ambiguous words (FIND,
  // SET, ECHO, COPY...) need a slash: /FIND.
  'CD',
  'DOORS',
  'CLUES',
  'LOGIN',
  'LOGOUT',
  'PS',
  'SUSPEND',
  'RESUME',
  'ALLOC',
  'USERS',
  'LOG',
  'REBOOT',
  'CHKDSK',
  'UNDELETE',
  'ATTRIB',
  'EDIT',
  'WPRO',
  'CALC',
  'COMLINK',
  'CAMS',
] as const;
export interface Command {
  name: (typeof commandNames)[number];
  args: string[];
}
export function parseCommand(text: string): Command | null {
  const parts = text.trim().toUpperCase().split(/\s+/);
  const name = parts[0] === '/HELP' ? 'HELP' : parts[0] === '/EXIT' ? 'DISCONNECT' : parts[0];
  return commandNames.includes(name as Command['name'])
    ? { name: name as Command['name'], args: parts.slice(1) }
    : null;
}
export function availableCommands(state: GameState): string[] {
  const list = [
    'HELP',
    'DIR',
    'TYPE <FILE>',
    'STATUS',
    'CLS',
    'DATE',
    'TIME',
    'VER',
    'MEM',
    'HISTORY',
    'CONFIG',
  ];
  if (state.flags.contact) list.push('CONNECT 04');
  if (state.connected) list.push('DISCONNECT');
  if (state.phase === 'final_choice') list.push('PURGE 04', 'RESTORE 04');
  return list;
}
