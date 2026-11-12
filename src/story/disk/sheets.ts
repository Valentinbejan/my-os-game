import { Sheet } from '../../programs/calcplan/Sheet';
import { columnIndex, parseRef } from '../../programs/calcplan/formula';
/**
 * The CALCPLAN worksheets in C:\SHEETS, built cell by cell. A cell's text may start with a
 * format in parentheses, "(D9)@TIME(7,45,0)", as the control panel shows it.
 */
function worksheet(
  widths: Record<string, number>,
  cells: Record<string, string>,
  hide: { rows?: number[]; columns?: string[] } = {},
): string {
  const sheet = new Sheet();
  for (const [col, width] of Object.entries(widths)) sheet.widths.set(columnIndex(col), width);
  for (const [ref, text] of Object.entries(cells)) {
    const at = parseRef(ref)!;
    const format = /^\(([^)]{1,3})\)/.exec(text);
    sheet.set(at.col, at.row, format ? text.slice(format[0].length) : text, format?.[1]);
  }
  for (const row of hide.rows ?? []) sheet.hiddenRows.add(row - 1);
  for (const col of hide.columns ?? []) sheet.hiddenColumns.add(columnIndex(col));
  return sheet.serialize();
}
/** Lays out rows of cells from `first` down, one string per column; '' leaves a cell blank. */
function rows(first: number, columns: string, data: string[][]): Record<string, string> {
  const cells: Record<string, string> = {};
  data.forEach((values, n) =>
    values.forEach((value, c) => {
      if (value) cells[columns[c] + (first + n)] = value;
    }),
  );
  return cells;
}
const line = (row: number, columns: string, char: string) =>
  rows(row, columns, [[...columns].map(() => '\\' + char)]);
const hm = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return `(D9)@TIME(${h},${m},0)`;
};
const day = (d: number, m: number) => `(D1)@DATE(91,${m},${d})`;

/**
 * The evacuation muster as Halloran's office kept it on 31 October: 23 on site, and not one
 * departure time. Dr Weiss's row was hidden afterwards; the row numbers skip from 27 to 29.
 */
const people: string[][] = [
  ["'ABERNATHY, R.", "'FACILITIES", "'PLANT", hm('07:42'), '', "'CAR", ''],
  ["'BECK, T.", "'PROGRAMME", "'B2-LAB", hm('08:15'), '', "'CAR", ''],
  ["'CHO, S.", "'MEDICAL", "'B3", hm('08:30'), '', "'CAR", ''],
  ["'DAVIES, P.", "'ADMIN", "'B1", hm('08:02'), '', "'BUS", ''],
  ["'DORAN, K.", "'SECURITY", "'GATE", hm('06:00'), '', "'CAR", ''],
  ["'ELLIS, M.", "'CATERING", "'CANTEEN", hm('07:10'), '', "'BUS", ''],
  ["'FARROW, G.", "'FACILITIES", "'PLANT", hm('07:45'), '', "'CAR", ''],
  ["'GUNDERSEN, E.", "'PROGRAMME", "'B2-LAB", hm('08:20'), '', "'CAR", ''],
  ["'HALLORAN, D.", "'ADMIN", "'B1", hm('08:40'), '', "'CAR", "'SITE SUPERVISOR"],
  ["'IVES, C.", "'ADMIN", "'B1", hm('08:05'), '', "'BUS", ''],
  ["'KOWALSKI, J.", "'SECURITY", "'B3-COR", hm('14:00'), '', "'CAR", ''],
  ["'MARCH, L.", "'MEDICAL", "'B3", hm('08:00'), '', "'CAR", ''],
  ["'NAKAMURA, H.", "'PROGRAMME", "'B4", hm('09:10'), '', "'BUS", ''],
  ["'OKAFOR, B.", "'MEDICAL", "'B3", hm('16:30'), '', "'CAR", "'NIGHT CARE"],
  ["'PELL, W.", "'FACILITIES", "'PLANT", hm('07:50'), '', "'CAR", ''],
  ["'QUINLAN, F.", "'CATERING", "'CANTEEN", hm('07:15'), '', "'BUS", ''],
  ["'RENNICK, M.", "'CONTROL", "'CTRL", hm('14:00'), '', "'CAR", "'OP-17"],
  ["'REYES, A.", "'PROGRAMME", "'B4", hm('08:25'), '', "'BUS", ''],
  ["'SOBEL, N.", "'ADMIN", "'B1", hm('08:35'), '', "'CAR", ''],
  ["'THORNE, V.", "'SECURITY", "'GATE", hm('06:00'), '', "'BUS", ''],
  ["'UPTON, D.", "'FACILITIES", "'PLANT", hm('07:30'), '', "'CAR", ''],
  ["'WEBB, R.", "'MEDICAL", "'B3", hm('08:10'), '', "'CAR", ''],
  ["'WEISS, K.", "'MEDICAL", "'B3-2", hm('07:55'), '', "'CAR", "'SURGEON"],
];
export const ROSTER = worksheet(
  { A: 14, B: 11, C: 8, D: 7, E: 7, F: 10, G: 20 },
  {
    A1: "'AEGIS SYSTEMS DIVISION / BLACKRIDGE ANNEX",
    A2: "'SITE PERSONNEL -- EVACUATION MUSTER 31-OCT-91",
    ...rows(4, 'ABCDEFG', [["'NAME", "'DEPT", "'ROOM", '"IN', '"OUT', "'TRANSPORT", "'NOTE"]]),
    ...line(5, 'ABCDEFG', '-'),
    ...rows(6, 'ABCDEFG', people),
    ...line(29, 'ABCDEFG', '='),
    A30: "'PERSONNEL ON SITE",
    D30: '@COUNT(A6..A28)',
    A31: "'MUSTER AT THE BUSES",
    G31: '+"CHECKED OUT: "&@STRING(@COUNT(E6..E28),0)',
    A33: "'Saved 18:15 from the supervisor's office. Nobody came to the buses.",
  },
  { rows: [28] },
);

/**
 * OP-17's load plan, with the power monitor's history appended: five weeks on the
 * generator, then the backup cell from 21:40 last night, emptied fast by what was running.
 */
export const POWER = worksheet(
  { A: 12, B: 18, C: 10, D: 10 },
  {
    A1: "'AUXILIARY BUS -- LOAD PLAN",
    A2: "'OP-17 31-OCT-91. Cell history appended by POWERMON.",
    ...rows(4, 'ABCD', [["'PROCESS", "'NAME", '"kW', "'  STATE"]]),
    ...line(5, 'ABCD', '-'),
    ...rows(6, 'ABCD', [
      ["'01", "'ENVIRONMENT", '0.04', "'  RUNNING"],
      ["'02", "'SITE CARRIER", '0', "'  NO CARRIER"],
      ["'03", "'DOOR CONTROL", '0.01', "'  RUNNING"],
      ["'04", "'SITE ASSISTANT", '0.86', "'  RUNNING"],
    ]),
    B10: "'TOTAL LOAD",
    C10: '(F2)@SUM(C6..C9)',
    A12: "'CELL CAPACITY kWh",
    C12: '12.5',
    A13: "'CELL CHARGE",
    C13: '(P0)0.11',
    A14: "'HOURS LEFT",
    C14: '(F2)+C12*C13/C10',
    A15: "'HOURS LEFT WITHOUT 04",
    C15: '(F1)+C12*C13/(C10-C9)',
    A16: "'HOURS UNTIL CREW (06:00)",
    C16: '(F2)(@TIME(6,0,0)-(@NOW-@INT(@NOW)))*24',
    A18: "'CELL HISTORY (POWERMON)",
    ...rows(19, 'ABCD', [["'DATE", "'TIME", '"CHARGE', '"AVG kW']]),
    ...line(20, 'ABCD', '-'),
    ...rows(21, 'ABCD', [
      [day(7, 12), hm('21:40'), '(P0)1', ''],
      [day(8, 12), hm('00:00'), '(P0)0.44', '(F3)+$C$12*(C21-C22)/((A22+B22-A21-B21)*24)'],
      [day(8, 12), hm('02:00'), '(P0)0.11', '(F3)+$C$12*(C22-C23)/((A23+B23-A22-B22)*24)'],
      ["'NOW", '', '(P0)+C13', '(F3)+C10'],
    ]),
    A26: "'Generator 1 carried the site 31-OCT to 07-DEC 21:40 (fuel).",
  },
);

/** The programme's two participants, as the clinic listed them for its staff. */
export const PATIENTS = worksheet(
  { A: 4, B: 17, C: 5, D: 22, E: 21, F: 10, G: 12 },
  {
    A1: "'BLACKRIDGE CLINIC -- PROGRAMME PARTICIPANTS (REFERRAL SCHEME)",
    ...rows(3, 'ABCDEFG', [
      ["'NO", "'NAME", '"AGE', "'REFERRED BY", "'PROCEDURE (AS TOLD)", "'ADMITTED", "'STATUS"],
    ]),
    ...line(4, 'ABCDEFG', '-'),
    ...rows(5, 'ABCDEFG', [
      [
        "'01",
        "'LIND, ANNA M.",
        '31',
        "'DR P. MARSH, RIVERSIDE",
        "'SPINAL NERVE REPAIR",
        day(12, 5),
        "'TRANSFERRED",
      ],
      [
        "'02",
        "'ANDERSON, JAMES",
        '35',
        "'DR R. OYELARAN",
        "'TUMOUR RESECTION",
        day(12, 5),
        "'CORE DONOR",
      ],
    ]),
    ...line(7, 'ABCDEFG', '='),
    A8: "'Both entered through the Riverside referral scheme and signed the standard consent.",
  },
);
