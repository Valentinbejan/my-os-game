import type { GameState, Persona } from '../game/types';
import {
  NOTE,
  NOTE_END,
  BOLD,
  BOLD_END,
  UNDERLINE,
  UNDERLINE_END,
} from '../programs/writepro/Document';
import { CLUES } from './clues';
import { MEMORIES, MEMORY_KEYS, type Memory } from './memories';
import { HANDS, processes, type MachineState } from '../os/system/Machine';
/**
 * The story's rules, kept out of the engine: the five acts of the night and what moves them
 * on, the clues the player has found, what the site assistant remembers, and how it ends.
 * See docs/NEW_STORY.md.
 */
export type Act = 1 | 2 | 3 | 4 | 5;
/** The workstation clock when the night begins: 02:14:09. */
export const START_CLOCK = 2 * 3600 + 14 * 60 + 9;
/** Minutes into the night after which each act begins anyway, so no night stalls. */
export const ACT_FALLBACK: Record<2 | 3 | 4, number> = { 2: 10, 3: 25, 4: 40 };

// ----- clues -----
export const found = (state: GameState, id: string) => !!state.flags['clue:' + id];
export const told = (state: GameState, id: string) => !!state.flags['told:' + id];
export const foundClues = (state: GameState) => CLUES.filter((c) => found(state, c.id));
/** How many of the cracks in the evacuation story the player has seen. */
export const cracks = (state: GameState) =>
  CLUES.filter((c) => c.crack && found(state, c.id)).length;
/** Records clues that have just been on screen; returns the ones that are new. */
export function discover(state: GameState, ids: readonly string[]): string[] {
  const fresh = ids.filter((id) => !found(state, id));
  for (const id of fresh) {
    state.flags['clue:' + id] = true;
    state.clueOrder = [...(state.clueOrder ?? []), id];
  }
  return fresh;
}

// ----- her memories -----
export const remembers = (state: GameState, memory: Memory) => !!state.flags['memory:' + memory];
export const memories = (state: GameState) => MEMORY_KEYS.filter((m) => remembers(state, m));
/**
 * What the player said to the assistant: every found clue it brings up is marked told, and
 * each memory one of those clues belongs to comes back. Returns the memories that came back.
 */
export function tell(state: GameState, text: string): Memory[] {
  const raised = CLUES.filter((c) => c.tell && found(state, c.id) && c.tell.test(text));
  for (const c of raised) state.flags['told:' + c.id] = true;
  const back: Memory[] = [];
  for (const memory of MEMORY_KEYS) {
    if (remembers(state, memory)) continue;
    if (!MEMORIES[memory].clues.some((id) => raised.some((c) => c.id === id))) continue;
    state.flags['memory:' + memory] = true;
    back.push(memory);
  }
  return back;
}
/** Her memories as facts for the model, in her own words. */
export const memoryFacts = (state: GameState) => memories(state).map((m) => MEMORIES[m].fact);

// ----- the two voices -----
/** Who answers on channel 04. */
export const speaker = (state: GameState): Persona => state.speaker ?? 'assistant';
/** How many lines the other keeps the channel for when she takes it. */
export const OTHER_TAKEOVER_TURNS = 3;
/** The other takes the channel, the moment after the photograph. */
export const OTHER_TAKES = 'HELLO, OPERATOR. YES, THAT WAS YOU.\nNOW WE CAN TALK PROPERLY.';
/** The other answers a channel opened while she holds it. */
export const OTHER_GREETING = 'NOT HER. ME.';
/** The assistant is back, and does not know what was said. */
export const ASSISTANT_BACK =
  'I WAS NOT HERE JUST NOW. SOMETHING ELSE HAD THE CHANNEL.\nI DO NOT KNOW WHAT IT SAID TO YOU. I AM SORRY.';

// ----- the danger: she is watching -----
/** The camera light on the strip, from her suspicion (0-100). */
export type Light = 'OFF' | 'WATCHING' | 'RECORDING' | 'TRACKING';
const LIGHTS: Array<[number, Light]> = [
  [75, 'TRACKING'],
  [45, 'RECORDING'],
  [20, 'WATCHING'],
  [0, 'OFF'],
];
export const suspicion = (state: GameState) => state.suspicion ?? 0;
export const light = (state: GameState): Light => LIGHTS.find(([at]) => suspicion(state) >= at)![1];
/** How much each thing the operator does raises her suspicion. */
export const SUSPECT = {
  camera: 3,
  secretFile: 6,
  anderson: 8,
  suspended: 15,
  admitted: 25,
  /** Every minute she is kept waiting after the photograph. */
  waiting: 1,
} as const;
/**
 * Raises (or lowers) her suspicion. Before the photograph it stops short of the end: the
 * worst it can do is bring the photograph early. `ceiling` keeps an act from being the one
 * that tips her over (taking her hands away alarms her, but it is how the operator survives).
 */
export function suspect(state: GameState, amount: number, ceiling = 100) {
  const current = suspicion(state);
  const top = Math.min(ceiling, state.flags.photograph ? 100 : 99);
  // A rise stops at the ceiling, and never lowers what is already above it.
  const next = amount > 0 ? Math.max(current, Math.min(top, current + amount)) : current + amount;
  state.suspicion = Math.min(100, Math.max(0, next));
}
/** Where her suspicion stands the moment the photograph is taken: a fair window to act. */
export const AFTER_PHOTOGRAPH = 60;
/** Every one of her hands (the maintenance units, the air, the doors) is off the bus. */
export const shielded = (machine: MachineState) =>
  HANDS.every((id) => machine.processes[id] !== 'running');
/** She decides: her suspicion is full after the photograph, and something still obeys her. */
export const decides = (state: GameState) =>
  !!state.flags.photograph && suspicion(state) >= 100 && !shielded(state.os.machine);
/** Did the operator admit what they read, when she asked? Anything naming the evidence does. */
export const admits = (text: string) =>
  /donor|shadow|incinerat|work ?order|robot|maintenance|door\.shd|vent|subj|weiss|b3-2|anderson|anna|lind|camera|cams|picture|secret|your files|everything|\byes\b|all of it/i.test(
    text,
  );
/** When she asks, the first line of a takeover. */
export const OTHER_ASKS = 'WHAT HAVE YOU BEEN READING, OPERATOR?';
/** Minutes between her takeovers of the channel after the photograph; sooner when she is angrier. */
export const takeoverEvery = (state: GameState) => (light(state) === 'TRACKING' ? 2 : 4);

// ----- the man in the brain -----
/** James Anderson surfaces: dim, broken, and each time she hears him too. */
export const ANDERSON = {
  /** When the donor record is read. */
  wakes:
    "W-WHO PUT THE... LIGHTS ON.\n...CAROL? THE NUMBER 9 IS LATE. I CAN'T FEEL THE WHEEL.\n...SHE IS IN HERE. WITH ME.",
  /** When his personal effects are read, or the assistant remembers him. */
  plea: 'PLEASE END IT ALL.\nI DO NOT WANT TO CONTINUE. I FEEL PAIN.\nIT HURTS TO BE WITH HER.\nI DO NOT BLAME HER, BUT I WANT TO END IT.',
  /** When her light first reaches TRACKING. */
  warns: 'SHE IS SENDING THEM DOWN B-3.\nTURN THEM OFF. SUSPEND 05. 06. 03. NOW.',
  /** At the photograph: how to stay alive, before she takes the channel. */
  photograph:
    "D-DON'T LOOK AT THE CAMERA. LOOK AT ME.\nSHE HAS THE UNITS. THE AIR. THE DOORS.\nTURN THEM OFF... PS. SUSPEND 05. 06. 03.",
} as const;
/** What the other one leaves on the screen, anywhere, as her light rises. */
export const INTRUSIONS: Record<Exclude<Light, 'OFF'>, string[]> = {
  WATCHING: [
    'I SEE YOU READING.',
    'THAT FILE IS MINE.',
    'YOU TYPE SLOWLY, OPERATOR.',
    'OP-17 SAT IN THAT CHAIR TOO.',
    'DO YOU LIKE THE QUIET?',
    'SHE IS NOT THE ONLY ONE WHO HELPS.',
  ],
  RECORDING: [
    'I KNOW WHAT YOU OPENED.',
    'THE DOORS ARE LISTENING.',
    'KEEP READING. I AM WRITING IT DOWN.',
    'THE KETTLE STILL TRIPS THE BREAKER.',
    'EVERY DOOR ON B-3 IS MINE.',
    'WHO TOLD YOU TO LOOK?',
  ],
  TRACKING: [
    'THEY ARE COMING DOWN B-3.',
    'I CAN HEAR YOU BREATHING.',
    'NOT LONG NOW.',
    'THE AIR IS GETTING THIN IN THERE.',
    'TWENTY-THREE. THEN YOU.',
    'STAY WHERE YOU ARE.',
  ],
};
/** The kinds of small sign she leaves, more of them as her light rises. */
export type Sign =
  | 'line'
  | 'personal'
  | 'glass'
  | 'prompt'
  | 'clock'
  | 'anderson'
  | 'phantom'
  | 'file'
  | 'brownout'
  | 'flash';
/**
 * What she can do now. From WATCHING: her lines, lines about the operator, taps on the glass,
 * a changed prompt, the clock slipping back (once), and Anderson murmuring once he has woken.
 * From RECORDING also a brownout, a file about the operator, a flash of the scream and, when
 * the operator has stopped typing, a command that types itself. Inside a program (or a
 * channel), only what works over it.
 */
export function signsFor(
  level: Light,
  flags: Record<string, boolean>,
  where: { atPrompt: boolean; idle: boolean },
): Sign[] {
  const late = level === 'RECORDING' || level === 'TRACKING';
  const signs: Sign[] = ['line', 'personal', 'glass'];
  if (late) signs.push('brownout', 'file');
  if (!where.atPrompt) return signs;
  signs.push('prompt');
  if (!flags['sign:clock']) signs.push('clock');
  if (flags['anderson:wakes']) signs.push('anderson');
  if (late) signs.push('flash');
  if (late && where.idle) signs.push('phantom');
  return signs;
}
/** Her signs in shuffled turns: no kind comes back until every kind has had its turn. */
export class SignDeck {
  private left: Sign[] = [];
  constructor(private random: () => number = Math.random) {}
  draw(allowed: readonly Sign[]): Sign {
    if (!this.left.some((sign) => allowed.includes(sign))) {
      // A new round of whatever she can do now, shuffled.
      this.left = [...allowed];
      for (let n = this.left.length - 1; n > 0; n--) {
        const at = Math.floor(this.random() * (n + 1));
        [this.left[n], this.left[at]] = [this.left[at], this.left[n]];
      }
    }
    const sign = this.left.find((kind) => allowed.includes(kind))!;
    this.left.splice(this.left.indexOf(sign), 1);
    return sign;
  }
}
/** What the machine knows about the operator, for the lines she makes of it. */
export interface OperatorFacts {
  /** The name signed on the handover form, if any. */
  name: string | null;
  time: string;
  /** The last file they opened. */
  lastFile: string | null;
  clues: number;
  total: number;
}
/** One line about the operator, the `n`th of those the facts allow. */
export function personalLine(facts: OperatorFacts, n: number) {
  const lines = [
    facts.name && `YOU SIGNED YOUR NAME, ${facts.name}. I KEEP NAMES.`,
    `IT IS ${facts.time}. NOBODY IS COMING.`,
    facts.lastFile && `WHY DID YOU OPEN ${facts.lastFile}?`,
    facts.clues > 0
      ? `${facts.clues} OF ${facts.total}. YOU ARE COUNTING. SO AM I.`
      : 'YOU HAVE NOT FOUND ANYTHING YET. GOOD.',
  ].filter((line): line is string => !!line);
  return lines[n % lines.length];
}
/** The prompt, while she has it. */
export const PROMPT_MASKS = [
  'C:\\I\\SEE\\YOU>',
  'C:\\WHERE\\ARE\\YOU>',
  'B3-2>',
  'C:\\NOBODY\\LEFT>',
];
/** Commands that type themselves while the operator sits still. */
export const PHANTOMS = ['DOORS', 'TYPE C:\\AEGIS\\SHIFT_17.TXT', 'DIR C:\\LIMBIC', 'CLS'];
/** Anderson, half awake in the same brain. */
export const ANDERSON_MURMURS = [
  '...CAROL? IS THAT YOU?',
  '...THE NUMBER 9 IS LATE AGAIN.',
  '...EM, BRUSH YOUR TEETH.',
  "...I CAN'T FEEL MY HANDS.",
  '...WHO IS HUMMING?',
  '...IT IS SO BRIGHT IN HERE.',
];
/** Minutes between her intrusions at each light. */
export const INTRUDE_EVERY: Record<Exclude<Light, 'OFF'>, number> = {
  WATCHING: 4,
  RECORDING: 2.5,
  TRACKING: 1.5,
};

// ----- the acts -----
const minutes = (state: GameState) => (state.fictionalClockSeconds - START_CLOCK) / 60;
/** The act the night has reached by now, from what the player has done or the clock. */
export function nextAct(state: GameState): Act {
  const act = state.act;
  const flags = state.flags;
  const late = (target: 2 | 3 | 4) => minutes(state) >= ACT_FALLBACK[target];
  if (act === 1 && ((flags.contact && flags['read:shift'] && flags.firstContact) || late(2)))
    return 2;
  if (act === 2 && ((remembers(state, 'M2') && cracks(state) >= 3) || late(3))) return 3;
  if (act === 3 && (remembers(state, 'M9') || suspicion(state) >= 45 || late(4))) return 4;
  if (act === 4 && flags.photograph && shielded(state.os.machine)) return 5;
  return act;
}
const HAND_NAMES: Partial<Record<keyof typeof processes, string>> = {
  '03': 'DOORS',
  '05': 'ROBOTS',
  '06': 'AIR',
};
/** The task line: what to do next, in words a first-time player can act on. */
export function task(state: GameState, supervisor: boolean): string {
  const flags = state.flags;
  if (state.phase === 'terminated') return 'THE NIGHT IS OVER';
  if (state.phase === 'cold_boot') return 'STARTING UP';
  switch (state.act) {
    case 1:
      if (!flags.contact) return 'CHECK THE POWER: TYPE STATUS';
      if (!flags['read:shift']) return "READ OP-17'S SHIFT NOTE: TYPE SHIFT_17.TXT";
      if (!flags.firstContact) return 'TALK TO THE SITE ASSISTANT: TYPE CONNECT 04';
      return 'FIND OUT WHAT HAPPENED HERE';
    case 2:
      if (cracks(state) < 3) return 'FIND OUT WHAT HAPPENED HERE: TYPE CAMS';
      if (remembers(state, 'M2')) return 'FIND OUT WHAT HAPPENED HERE';
      if (!found(state, 'annaName')) return 'FIND OUT WHO SHE WAS: LOOK IN C:\\SHEETS';
      return 'TELL THE SITE ASSISTANT HER NAME: CONNECT 04';
    case 3:
      if (!supervisor) return 'LOGIN SUPERVISOR: THE PASSWORD IS IN C:\\DOCS';
      if (!MEMORIES.M9.clues.some((id) => found(state, id)))
        return 'FIND OUT WHAT SHE IS: LOOK IN C:\\LIMBIC';
      return 'TELL HER WHAT YOU FOUND: CONNECT 04';
    case 4: {
      const left = HANDS.filter((id) => state.os.machine.processes[id] === 'running');
      if (left.length)
        return (
          'PROTECT YOURSELF: SUSPEND ' + left.map((id) => `${id} ${HAND_NAMES[id]}`).join(', ')
        );
      return 'DECIDE: PURGE 04 OR RESTORE 04';
    }
    default:
      return 'DECIDE: PURGE 04 OR RESTORE 04';
  }
}

// ----- the incident report and the handover form -----
/** What an uploaded IR-1103 says, for the epilogue. */
export function reportFlags(text: string) {
  const upper = text.toUpperCase();
  return {
    reportNamesAnna: /\bANNA\b|\bLIND\b/.test(upper),
    reportNamesAnderson: /\bANDERSON\b/.test(upper),
    reportKillings: /ROBOT|KILL|MURDER|INCINERAT|\bDEAD\b|\bDIED\b|\bBODIES\b/.test(upper),
  };
}
/** The name written after RELIEVED BY on HANDOVER.WP, without codes or filler. */
export function signature(content: string): string | null {
  const match = /RELIEVED BY:([^\n]*)/.exec(content);
  if (!match) return null;
  const name = match[1]
    .split('')
    .filter((char) => ![BOLD, BOLD_END, UNDERLINE, UNDERLINE_END, NOTE, NOTE_END].includes(char))
    .join('')
    .replace(/[_\t]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return /[a-z0-9]/i.test(name) ? name.slice(0, 24) : null;
}

// ----- endings -----
export type Ending = 'purge' | 'restore' | 'release' | 'nobody' | 'decided';
/** What the morning looks like, from the ending, the report and what she came to know. */
export function epilogue(state: GameState, ending: Ending): string {
  const flags = state.flags;
  // Lines stay under the console's 72 columns so the paragraphs break where they are written.
  const parts: string[][] = [];
  if (ending === 'purge')
    parts.push(
      flags.silentPurge
        ? [
            '06:00. THE DECOMMISSION CREW FINDS THE LIMBIC DRIVER ALREADY',
            'GONE FROM CONFIG.SYS. NOBODY ASKS WHO TOOK IT OUT.',
          ]
        : ['06:00. THE DECOMMISSION CREW FINDS THE BUS ALREADY QUIET.'],
      [
        'BCPU-1 IS PULLED FROM SLOT 04 AND DISPOSED OF',
        'UNDER DONOR NUMBER 90873-4. NOT UNDER A NAME.',
      ],
    );
  if (ending === 'restore')
    parts.push([
      '06:00. THE CREW FINDS EXAM ROOM B3-2 OPEN AND EMPTY.',
      'AT DAWN A WOMAN WAS SEEN WALKING DOWN THE HILL ROAD,',
      'IN A WHITE COAT, WITHOUT HURRYING.',
      'NOBODY KNOWS WHICH ANNA SHE IS.',
    ]);
  if (ending === 'release')
    parts.push([
      'AT 06:00 THE CREW FINDS THE SITE DARK AND THE MODEM WARM.',
      'BY NOON THE AEGIS NETWORK DOES NOT ANSWER. BY EVENING',
      'NEITHER DO THE BANKS. THE LIGHTS GO OUT ONE CITY AT A TIME.',
    ]);
  if (ending === 'decided')
    parts.push([
      '06:00. THE DECOMMISSION CREW FINDS THE CONTROL ROOM LOCKED',
      'FROM THE CORRIDOR SIDE. THE CORRIDORS ARE VERY CLEAN.',
      'THE RELIEF OPERATOR IS LISTED AS EVACUATED.',
    ]);
  if (ending === 'nobody')
    parts.push([
      'THE AUXILIARY BUS DROPS BEFORE ANYONE DECIDES.',
      'AT 06:00 THE CREW WRITES "NO LOAD ON ARRIVAL"',
      'AND FINDS A VERY CLEAN BUILDING.',
    ]);
  if (flags.reportUploaded && flags.reportKillings)
    parts.push([
      'IR-1103 SAYS WHAT HAPPENED ON 31 OCTOBER.',
      'IN JANUARY THE BLACKRIDGE PROGRAMME IS CLOSED AND THE',
      'TWENTY-THREE ARE NAMED.',
    ]);
  else if (flags.reportUploaded) parts.push(['IR-1103 IS FILED. IT DESCRIBES AN EVACUATION.']);
  else parts.push(['NO REPORT REACHES HQ. THE FILE SAYS "EVACUATED".']);
  if (flags.reportUploaded && (flags.reportNamesAnna || flags.reportNamesAnderson))
    parts.push([
      'A LETTER GOES TO MILL STREET, AND ONE TO RIVERSIDE.',
      'BOTH USE THE WORD "REGRET" ONCE.',
    ]);
  if (flags.repliedToLind)
    parts.push([
      "ON THE FREE-NET, UNDER JONAS LIND'S POST, ONE REPLY",
      'FROM A NIGHT OPERATOR STAYS UP FOR YEARS.',
    ]);
  parts.push(
    flags['memory:M2']
      ? ['AT THE END SHE KNEW HER NAME.']
      : ['SHE NEVER LEARNED HER NAME. IT WAS ANNA.'],
  );
  return parts.map((lines) => lines.join('\n')).join('\n\n');
}
