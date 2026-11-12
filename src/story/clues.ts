import type { TerminalCell } from '../terminal/TerminalBuffer';
/**
 * The clues of the night. Each has one or more exact phrases, and wherever a phrase shows on
 * the screen (a file, a document, a sheet, a bulletin board, a picture caption) it is drawn
 * red and the clue counts as found. Phrases never wrap across lines in the authored files.
 */
export interface Clue {
  id: string;
  /** How the CLUES list names it. */
  title: string;
  phrases: string[];
  /** Where it can be found, for the CLUES list. */
  where: string;
  /** One of the cracks in the evacuation story (Act 2 needs three of them). */
  crack?: boolean;
  /** Words that bring the clue up in conversation with the assistant. */
  tell?: RegExp;
}
export const CLUES: Clue[] = [
  // ----- cracks in the cover story -----
  {
    id: 'cars',
    title: 'The cars in the garage',
    phrases: ['14 CARS STILL PARKED'],
    where: 'CAMS, CAM 14 (GARAGE)',
    crack: true,
  },
  {
    id: 'effects',
    title: 'Everything left in the dormitory',
    phrases: ['PERSONAL EFFECTS LEFT BEHIND'],
    where: 'CAMS, CAM 31 (DORMITORY)',
    crack: true,
  },
  {
    id: 'showers',
    title: 'The decontamination showers',
    phrases: ['DECON CYCLES RUN: 212'],
    where: 'CAMS, CAM 21 (DECONTAMINATION)',
    crack: true,
  },
  {
    id: 'neverHome',
    title: 'The families on the bulletin board',
    phrases: ['HE NEVER CAME HOME'],
    where: 'BLACKRIDGE FREE-NET',
    crack: true,
  },
  {
    id: 'checkedOut',
    title: 'Nobody checked out',
    phrases: ['CHECKED OUT: 0'],
    where: 'ROSTER.WK1',
    crack: true,
  },
  // ----- who she was -----
  {
    id: 'library',
    title: 'Her work',
    phrases: ['LIBRARIAN, BLACKRIDGE PUBLIC LIBRARY'],
    where: 'LIND.WP (DELETED REFERRAL)',
    tell: /librar|books?\b/i,
  },
  {
    id: 'annaName',
    title: 'Her name',
    phrases: ['LIND, ANNA M.'],
    where: 'PATIENTS.WK1, THE REFERRAL, THE CONSENT FORM',
    tell: /\banna\b|\blind\b/i,
  },
  {
    id: 'paraplegic',
    title: 'Her accident',
    phrases: ['PARAPLEGIC SINCE MARCH 1990'],
    where: 'LIND.WP (DELETED REFERRAL)',
    tell: /parapleg|paraly[sz]|wheelchair|accident|\bwalk/i,
  },
  {
    id: 'nerveRepair',
    title: 'What she was promised',
    phrases: ['SPINAL NERVE REPAIR'],
    where: 'LIND.WP (DELETED REFERRAL), PATIENTS.WK1',
    tell: /spin(e|al)|nerve|walk again|repair/i,
  },
  {
    id: 'consent',
    title: 'What she signed',
    phrases: ['CONSENT TO SURGICAL PROCEDURE'],
    where: 'C:\\DOCS\\CONSENT',
    tell: /consent|surg(ery|ical)|signed/i,
  },
  {
    id: 'notInformed',
    title: 'The memo',
    phrases: ['PATIENTS ARE NOT TO BE INFORMED'],
    where: 'MEMO0503.WP (HIDDEN)',
    tell: /not (to be )?(informed|told)|\blie[ds]?\b|\blying\b|never told/i,
  },
  {
    id: 'tumour',
    title: 'His illness',
    phrases: ['TUMOUR RESECTION'],
    where: 'ANDERSON.WP (DELETED REFERRAL), PATIENTS.WK1',
    tell: /tumou?r|cancer|resection/i,
  },
  {
    id: 'sister',
    title: 'Her brother',
    phrases: ['MY SISTER ANNA'],
    where: 'BLACKRIDGE FREE-NET',
    tell: /sister|brother|jonas/i,
  },
  {
    id: 'coat',
    title: 'The coat',
    phrases: ['HER GREEN COAT'],
    where: 'BLACKRIDGE FREE-NET',
    tell: /\bcoat\b|\bgreen\b/i,
  },
  {
    id: 'pilot',
    title: 'Her cat and her mother',
    phrases: ['MUM IS FEEDING PILOT'],
    where: 'BLACKRIDGE FREE-NET',
    tell: /pilot|\bcat\b|\bmum\b|\bmom\b|mother/i,
  },
  {
    id: 'westwing',
    title: "The supervisor's password",
    phrases: ['WESTWING'],
    where: 'PROCEDUR.WP (HIDDEN COMMENT), HQ.ASP',
  },
  // ----- what she is (supervisor files) -----
  {
    id: 'bodyLost',
    title: 'The operation',
    phrases: ['SOURCE BODY NOT SUSTAINED'],
    where: 'OPERATE.LOG',
    tell: /\bbody\b|sustained|\bdied\b|\bdead\b|14 may|operation/i,
  },
  {
    id: 'donor',
    title: 'Whose brain',
    phrases: ['DONOR: ANDERSON, JAMES'],
    where: 'DONOR.TXT',
    tell: /anderson|donor|james|\bman\b|his brain/i,
  },
  {
    id: 'lesion',
    title: 'What the scan missed',
    phrases: ['LESION NOT REPORTED'],
    where: 'CT0122.RPT',
    tell: /lesion|tumou?r|scan/i,
  },
  {
    id: 'emily',
    title: 'His family',
    phrases: ['DAUGHTER EMILY, 8'],
    where: 'C:\\DOCS\\EFFECTS',
    tell: /emily|daughter|carol|his (wife|family)/i,
  },
  {
    id: 'incinerator',
    title: 'The incinerator',
    phrases: ['INCINERATOR RUN: 14 HOURS'],
    where: 'POWER.SHD',
    tell: /incinerat|\bburn/i,
  },
  {
    id: 'cleaning',
    title: 'The robots',
    phrases: ['CLEANING CYCLE: CORRIDOR B-3'],
    where: 'WORKORD.LOG',
    tell: /clean|robot|maintenance unit|corridor/i,
  },
  {
    id: 'sealed',
    title: 'The doors',
    phrases: ['SEALED BY PROCESS 04'],
    where: 'DOOR.SHD',
    tell: /seal|\bdoors?\b|locked/i,
  },
  {
    id: 'oxygen',
    title: 'The air',
    phrases: ['OXYGEN 11 PERCENT'],
    where: 'VENT.SHD',
    tell: /oxygen|\bair\b|ventilat|suffocat|breath/i,
  },
  {
    id: 'weiss',
    title: 'The woman in B3-2',
    phrases: ['WEISS, K.: BODY SUSTAINED'],
    where: 'C:\\LIMBIC\\EXP',
  },
];
const byId = new Map(CLUES.map((clue) => [clue.id, clue]));
export const clue = (id: string) => byId.get(id);
/** Every phrase with its clue, longest first so a phrase inside another does not win. */
const phrases = CLUES.flatMap((c) => c.phrases.map((phrase) => ({ id: c.id, phrase })))
  .map(({ id, phrase }) => ({ id, phrase: phrase.toLowerCase() }))
  .sort((a, b) => b.phrase.length - a.phrase.length);
/**
 * Draws every clue phrase on an 80x25 page red and returns the clues it showed. Called on
 * each repaint of the page the player sees.
 */
export function markClues(cells: TerminalCell[]): string[] {
  const shown = new Set<string>();
  for (let row = 0; row < 25; row++) {
    const text = cells
      .slice(row * 80, row * 80 + 80)
      .map((cell) => cell.char)
      .join('')
      .toLowerCase();
    for (const { id, phrase } of phrases) {
      for (let at = text.indexOf(phrase); at >= 0; at = text.indexOf(phrase, at + 1)) {
        for (let n = 0; n < phrase.length; n++) {
          const index = row * 80 + at + n;
          cells[index] = { ...cells[index], palette: 'red' };
        }
        shown.add(id);
      }
    }
  }
  return [...shown];
}
