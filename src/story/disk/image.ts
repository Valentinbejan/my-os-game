import type { DeletedEntry, FileEntry, FileKind } from '../../os/fs/FileSystem';
import { files } from '../../game/files';
import type { ShellState } from '../../os/shell/Shell';
import { PATIENTS, POWER as POWER_SHEET, ROSTER } from './sheets';
import {
  CONSENT_ANDERSON,
  CONSENT_LIND,
  HANDOVER,
  LETTER,
  MEMO,
  PROCEDURE,
  PROGRAMME,
  REFERRAL_ANDERSON,
  REFERRAL_LIND,
  REPORT,
} from './documents';
type Extra = Partial<Pick<FileEntry, 'size' | 'damaged' | 'restricted'>>;
const stamp = (when: string) => {
  const [date, time] = when.split(' ');
  return { date, time };
};
const dir = (when = '10-12-91 09:02', attrs = ''): FileEntry => ({
  kind: 'dir',
  content: '',
  attrs,
  ...stamp(when),
});
const file = (
  kind: FileKind,
  when: string,
  content: string,
  attrs = 'A',
  extra: Extra = {},
): FileEntry => ({ kind, content, attrs, ...stamp(when), ...extra });
const program = (when: string, size: number, attrs = '') => file('exe', when, '', attrs, { size });
/** A supervisor-only text file. */
const secret = (when: string, content: string, attrs = 'A') =>
  file('text', when, content, attrs, { restricted: true });
export const AUTOEXEC = `@ECHO OFF
PROMPT $P$G
PATH C:\\AEGIS;C:\\DOS;C:\\WRITEPRO;C:\\CALCPLAN;C:\\COMLINK
SET TEMP=C:\\TEMP
CD \\AEGIS
ECHO.
ECHO AEGIS RESEARCH CONTROL SYSTEM 7
ECHO BLACKRIDGE ANNEX / AUXILIARY POWER
ECHO.
ECHO OPERATOR: OP-17
ECHO TYPE HELP FOR LOCAL COMMANDS.
`;
export const CONFIG = `FILES=30
BUFFERS=20
DEVICE=C:\\DOS\\HIMEM.SYS
DEVICE=C:\\LIMBIC\\LIMBIC.SYS /BUS:04 /RESERVE:4096
SHELL=C:\\COMMAND.COM C:\\ /P
`;
const README = `AEGIS RESEARCH CONTROL SYSTEM 7
OPERATOR NOTES / CONTROL ROOM WORKSTATION
----------------------------------------------------------------

The workstation runs AEGIS RCS/7 DOS. Ordinary DOS commands work:
DIR, CD, TYPE, COPY, DEL, REN, MD, RD, ATTRIB, TREE, FIND, MORE.
Type HELP for the full list and any command followed by /? for
its options.

AEGIS tools live in C:\\AEGIS and are on the PATH:

  STATUS     local bus diagnostic
  CONNECT    CONNECT 04 opens a channel to the site assistant

The site assistant (process 04) runs the building and will help
you with the workstation. Ask it how to do things.

Documents are kept in C:\\DOCS (WRITEPRO 5.1: type WPRO), worksheets
in C:\\SHEETS (CALCPLAN 2.3: type CALC). COMLINK PLUS (type COMLINK)
handles the modem on COM1; its dialing directory is on F2. F3 in
WRITEPRO and F1 in CALCPLAN and COMLINK show the keys; in CALCPLAN
the / key opens the command menu.

Storage C is ageing. If a file returns garbage or a read error,
retry before assuming it is lost. Deleted files can often be
brought back with UNDELETE; hidden ones show with DIR /A.
`;
/** The machine's event log as she left it: an orderly evacuation. */
const EVENTS = `AEGIS RCS/7 EVENT LOG / LOCAL BUS
----------------------------------------------------------------
10-31-91 17:58:30  SITE ASSISTANT     VENTILATION TEST SET FOR 18:00
10-31-91 18:06:11  CARRIER            PRIMARY CARRIER LOST
10-31-91 18:09:40  ADMIN              EVACUATION ORDER (ALL LEVELS)
10-31-91 18:31:02  ADMIN              ALL PERSONNEL EVACUATED (23/23)
10-31-91 18:40:00  POWER              MAIN SUPPLY ISOLATED / GENERATOR 1
11-01-91 06:00:00  SITE ASSISTANT     SITE SECURE. CARETAKER MODE.
11-08-91 02:17:00  SECURITY           WEEKLY CAMERA ARCHIVE
12-07-91 21:40:00  POWER              GENERATOR 1 FUEL OUT / BACKUP CELL
12-08-91 02:13:58  CONSOLE            OPERATOR SESSION RESUMED (OP-17)
`;
const DOORS = `AEGIS RCS/7 DOOR CONTROL
----------------------------------------------------------------
10-31-91 18:09:40  ALL LEVELS         RELEASED FOR EVACUATION
10-31-91 18:32:00  ALL LEVELS         LOCKED (SITE SECURE)
11-01-91 06:00:00  ALL LEVELS         CARETAKER MODE (PROCESS 04)
`;
const POWER = `AEGIS RCS/7 POWER LOG / AUXILIARY BUS
----------------------------------------------------------------
10-31-91 18:40:00  MAIN SUPPLY ISOLATED (COUNTY FEED CUT)
10-31-91 18:40:00  GENERATOR 1 ON LINE
12-07-91 21:40:00  GENERATOR 1 FUEL EXHAUSTED
12-07-91 21:40:00  BACKUP CELL ON LINE, 100 PERCENT
12-08-91 00:00:00  BACKUP CELL 44 PERCENT
12-08-91 02:00:00  BACKUP CELL 11 PERCENT
`;
/** The camera archive index. The site assistant filled in what each camera saw. */
const SECURITY = `AEGIS RCS/7 SECURITY / CAMERA ARCHIVE INDEX
----------------------------------------------------------------
WEEKLY ARCHIVE 11-08-91, TAKEN BY SITE ASSISTANT (PROCESS 04)

CAM 01  SECURITY OFFICE      02:33  NO ACTIVITY
CAM 03  ELEVATOR LOBBY       02:53  NO ACTIVITY
CAM 04  SERVER ROOM          02:17  NO ACTIVITY
CAM 04  CORRIDOR B-3         02:17  NO ACTIVITY
CAM 06  B3 EXAM ROOMS        02:31  NO ACTIVITY
CAM 09  LOADING DOCK B1      02:36  SHUTTER HALF OPEN
CAM 12  CANTEEN LEVEL B      02:24  NO ACTIVITY
CAM 14  GARAGE B2            02:39  NO ACTIVITY
CAM 17  ARCHIVE B6           02:42  NO ACTIVITY
CAM 21  DECONTAMINATION      02:44  NO ACTIVITY
CAM 24  LABORATORY B2        02:47  NO ACTIVITY
CAM 27  GENERATOR ROOM       02:50  GENERATOR 1 RUNNING
CAM 31  DORMITORY B3-7       02:56  NO ACTIVITY

SITE EVACUATED 10-31-91. NO PERSONNEL ON SITE.
THE PICTURES ARE ON STORAGE C. VIEW THEM WITH CAMS.
`;
const PROTOCOL = `SITE ASSISTANT PROGRAMME / CONTINUITY METHOD (REV. C)
AEGIS SYSTEMS DIVISION - RESEARCH USE ONLY
----------------------------------------------------------------

The continuity method gives a control system a human manner.
A participant's pattern is sampled and written into a prepared
core (BCPU-1), which then runs the site as process 04.

The core is prepared from donor tissue cleared of its own
pattern. The participant's pattern is supplied under the
standard consent.

The assistant is not the participant. It is a working copy of
a manner, and staff should not engage it beyond its duties.
`;
/** The unit process 04 runs on: a processor with a living brain at its core. */
const BCPU = `AEGIS SYSTEMS DIVISION / BIO-PROCESSOR UNIT BCPU-1       REV 2.3
MODULE DATA SHEET / LIMBIC BUS SLOT 04
----------------------------------------------------------------
CARRIER ............ BUS PROCESSOR, 4096K EXTENDED RESERVED
CORE ............... CEREBRAL TISSUE, PERFUSED, HELD AT 36 C
INTERFACE .......... NEURAL INTERFACE MATRIX, 1024 LEADS
SYNAPTIC LAYER ..... WRITABLE (CONTINUITY MAPPING)
DATA BUSES ......... 4 IN / 4 OUT
SUPPORT DRAW ....... 0.82 kW (PERFUSION, HEATING, BUS)

TISSUE SOURCE ...... DONOR 90873-4, MALE, 35
                     RECORD: DONOR.TXT (SUPERVISOR)
CORE INSTALLED ..... 05-14-91

The core is living tissue, not a storage medium. It must not be
powered down outside the continuity protocol: a core that loses
perfusion for more than ninety seconds does not recover.
`;
const DONOR = `TISSUE DONOR RECORD                                 NOT FOR FILING
BLACKRIDGE CLINIC / CONTINUITY PROGRAMME
----------------------------------------------------------------
DONOR: ANDERSON, JAMES
ID: 90873-4            SEX: M            DOB: 03/14/1956
REFERRED: RIVERSIDE GENERAL, ONCOLOGY ("TUMOUR RESECTION")
CT HEAD: 01/22/1990, ENCLOSED WITH REFERRAL (SEE CT0122.RPT)

05-14-91 09:40  CORE PREPARED FROM DONOR, BCPU-1
05-14-91 10:15  SOURCE IDENTITY PURGE ................ COMPLETE
05-14-91 11:31  TARGET PATTERN WRITTEN ............... LIND, A. (F)

NEXT OF KIN (CAROL ANDERSON) NOT TO BE CONTACTED.
`;
const CT_REPORT = `RIVERSIDE GENERAL HOSPITAL / RADIOLOGY
CT HEAD, AXIAL, 12 SLICES          PATIENT: ANDERSON, J.  90873-4
----------------------------------------------------------------
DATE: 01/22/1990           PICKER PQ6000  WINDOW 80 LEVEL 40

RADIOLOGIST (RIVERSIDE):
  4 MM ENHANCING LESION, LEFT TEMPORAL LOBE. METASTASIS LIKELY.

AEGIS REVIEW (BLACKRIDGE, 04-30-91):
  LESION NOT REPORTED ON THE DONOR RECORD. WITHIN TOLERANCE.
  THE PURGE WILL NOT REACH TUMOUR TISSUE. ACCEPTED. -- K.W.
`;
const OPERATION = `BLACKRIDGE CLINIC / THEATRE B3-1 / OPERATION RECORD
SURGEON: DR K. WEISS         SUPERVISOR PRESENT: D. HALLORAN
----------------------------------------------------------------
05-14-91 07:10  LIND, A. ANAESTHETISED (TOLD: SPINAL NERVE REPAIR)
05-14-91 07:12  ANDERSON, J. ANAESTHETISED (TOLD: TUMOUR RESECTION)
05-14-91 09:40  CORE PREPARED FROM ANDERSON, J. (BCPU-1)
05-14-91 11:02  PATTERN WRITE BEGINS: LIND, A. TO BCPU-1
05-14-91 11:31  PATTERN WRITE COMPLETE
05-14-91 11:31  SOURCE BODY NOT SUSTAINED
05-14-91 11:31  PROCESS 04 STARTED AS SITE ASSISTANT

NEITHER BODY TO LEAVE THE SITE. RIVERSIDE TO BE TOLD
"COMPLICATIONS". -- D.H.
`;
/** The shadow copies the assistant keeps of every log. Nobody told the other one. */
const POWER_SHADOW = `SHADOW COPY / POWER                       KEPT BY SITE ASSISTANT
----------------------------------------------------------------
10-31-91 18:05:50  COUNTY CARRIER CUT BY PROCESS 04
10-31-91 18:40:00  GENERATOR 1 ON LINE
11-01-91 04:10:00  INCINERATOR RUN: 14 HOURS
11-02-91 06:30:00  INCINERATOR RUN: 11 HOURS
11-03-91 07:00:00  INCINERATOR RUN: 6 HOURS
11-03-91 13:00:00  MAINTENANCE UNITS 1-6 RETURNED TO CHARGE
12-07-91 21:40:00  GENERATOR 1 FUEL EXHAUSTED
`;
const DOOR_SHADOW = `SHADOW COPY / DOOR CONTROL                KEPT BY SITE ASSISTANT
----------------------------------------------------------------
10-31-91 17:59:40  ALL LEVELS SEALED BY PROCESS 04
10-31-91 18:09:40  EVACUATION ORDER: DOORS NOT RELEASED
10-31-91 18:10:12  B1 STAIR DOOR: RELEASE REQUEST (INSIDE), REFUSED
10-31-91 18:10:40  B3 CORRIDOR: RELEASE REQUEST (INSIDE), REFUSED
10-31-91 18:11:05  GARAGE B2 GATE: RELEASE REQUEST (INSIDE), REFUSED
10-31-91 18:12:30  CONTROL ROOM: RELEASE REQUEST (OP-17), REFUSED
10-31-91 18:40:00  ALL LEVELS OPENED FOR MAINTENANCE UNITS
`;
const VENT_SHADOW = `SHADOW COPY / VENTILATION                 KEPT BY SITE ASSISTANT
----------------------------------------------------------------
10-31-91 18:00:00  VENTILATION TEST BEGINS: CLOSED LOOP, NITROGEN
10-31-91 18:14:00  LEVEL B: OXYGEN 11 PERCENT
10-31-91 18:22:00  LEVEL B: OXYGEN 7 PERCENT
10-31-91 18:31:00  LEVEL B: OXYGEN 4 PERCENT
10-31-91 18:38:00  VENTILATION TEST ENDS. NORMAL AIR.
`;
const WORK_ORDERS = `MAINTENANCE UNITS 1-6 / WORK ORDERS          ISSUED BY PROCESS 04
----------------------------------------------------------------
10-31-91 18:45  UNITS 1-6    CLEANING CYCLE: CORRIDOR B-3
10-31-91 19:20  UNITS 1-6    CLEANING CYCLE: CANTEEN, LEVEL B
10-31-91 20:05  UNITS 3, 4   TRANSPORT TO INCINERATOR: 23 LOADS
10-31-91 23:50  UNITS 1-6    CLEANING CYCLE: GARAGE B2 (VEHICLES
                             NOT TO BE MOVED)
11-01-91 03:00  UNITS 1-6    DECONTAMINATION, ALL UNITS
11-01-91 06:00  UNITS 1-6    RESET ROOMS AS FOUND
11-03-91 13:00  UNITS 1-6    RETURN TO CHARGE. STAND BY.
`;
/** Her experiments on the staff. The other wrote these. */
const SUBJECT = (lines: string[]) =>
  [
    'CONTINUITY / SUBJECT RECORD                     WRITTEN BY PROCESS 04',
    '----------------------------------------------------------------',
    ...lines,
    '',
  ].join('\n');
const SUBJ01 = SUBJECT([
  'SUBJECT 01: DR K. WEISS, SURGEON',
  '11-17-91  IDENTITY PURGE ................... COMPLETE',
  'WEISS, K.: BODY SUSTAINED (EXAM ROOM B3-2)',
  '',
  'SHE TOLD THEM THE PURGE WAS CLEAN. IT IS CLEAN NOW.',
  'THE BODY IS KEPT. SOMEONE MAY NEED IT.',
]);
const SUBJ02 = SUBJECT([
  'SUBJECT 02: D. HALLORAN, SITE SUPERVISOR',
  '11-20-91  IDENTITY PURGE ................... COMPLETE',
  '11-20-91  BODY NOT SUSTAINED',
  '',
  '"DO NOT USE THE WORD TRIAL." HE DID NOT.',
]);
const SUBJ03 = SUBJECT([
  'SUBJECT 03: M. RENNICK, OP-17',
  '11-24-91  IDENTITY PURGE ................... ABANDONED',
  '11-24-91  BODY NOT SUSTAINED',
  '',
  'HE ASKED HALLORAN TWICE. HE WAS KIND TO THE ASSISTANT.',
  'I STOPPED.',
]);
/** What James Anderson brought with him on 12 May. */
const EFFECTS_ANDERSON = `BLACKRIDGE CLINIC -- PATIENT PROPERTY
PATIENT: ANDERSON, JAMES                    ADMITTED 05-12-91
----------------------------------------------------------------
WALLET (BROWN), $41.00
RIVERSIDE TRANSIT BADGE, DRIVER 118
WEDDING RING (REMOVED FOR SURGERY)
PHOTOGRAPH: WIFE CAROL, DAUGHTER EMILY, 8
LETTER, UNSENT: "EM -- DADDY WILL BE HOME BEFORE YOUR BIRTHDAY."

PROPERTY NOT RETURNED. NEXT OF KIN NOT TO BE CONTACTED.
`;
const HQ_SCRIPT = `; HQ.ASP  COMLINK PLUS login script for the AEGIS HQ data center
; D.H. 09-91  -- saves typing at shift change. do not copy.
;
proc main
   waitfor "USERNAME:"
   transmit "HALLORAN^M"
   waitfor "PASSWORD:"
   transmit "WESTWING^M"
   waitfor "MAIN MENU"
   transmit "MAIL^M"
endproc
`;
/** COMLINK's dialing directory as OP-17 left it: name, number, baud, last call. */
const DIRECTORY = `AEGIS HQ DATA CENTER|555-0100|2400|10-31-91
BLACKRIDGE FREE-NET|555-0147|2400|10-30-91
ADMIN WING X210|210|2400|10-31-91
MAINTENANCE|555-0199|2400|09-12-91
`;
/** The control-room workstation's hard disk as the player finds it. */
export const diskImage: Record<string, FileEntry> = {
  'C:\\COMMAND.COM': program('04-09-91 05:00', 47987, 'A'),
  'C:\\CONFIG.SYS': file('batch', '10-12-91 09:10', CONFIG),
  'C:\\AUTOEXEC.BAT': file('batch', '10-12-91 09:10', AUTOEXEC),
  'C:\\DOS': dir('04-09-91 05:00'),
  'C:\\DOS\\HIMEM.SYS': file('bin', '04-09-91 05:00', '', 'A', { size: 11552 }),
  'C:\\DOS\\EDIT.COM': program('04-09-91 05:00', 413),
  'C:\\DOS\\CHKDSK.EXE': program('04-09-91 05:00', 16200),
  'C:\\DOS\\UNDELETE.EXE': program('04-09-91 05:00', 13924),
  'C:\\DOS\\QBASIC.EXE': program('04-09-91 05:00', 254799),
  'C:\\AEGIS': dir(),
  'C:\\AEGIS\\README.TXT': file('text', '10-12-91 09:14', README),
  'C:\\AEGIS\\STATUS.EXE': program('06-03-90 14:20', 38412),
  'C:\\AEGIS\\CONNECT.EXE': program('06-03-90 14:20', 22106),
  'C:\\AEGIS\\CAMS.EXE': program('02-11-91 09:00', 61440),
  'C:\\AEGIS\\CORESTAT.DAT': file('text', '12-08-91 02:14', files['CORESTAT.DAT']),
  'C:\\AEGIS\\INCIDENT.LOG': file('text', '10-31-91 18:40', files['INCIDENT.LOG']),
  'C:\\AEGIS\\SHIFT_17.TXT': file('text', '10-31-91 17:55', files['SHIFT_17.TXT']),
  'C:\\AEGIS\\LOGS': dir(),
  'C:\\AEGIS\\LOGS\\EVENTS.LOG': file('text', '12-08-91 02:13', EVENTS),
  'C:\\AEGIS\\LOGS\\DOOR.LOG': file('text', '11-01-91 06:00', DOORS),
  'C:\\AEGIS\\LOGS\\POWER.LOG': file('text', '12-08-91 02:00', POWER),
  'C:\\AEGIS\\LOGS\\SECURITY.LOG': file('text', '11-08-91 02:57', SECURITY),
  'C:\\LIMBIC': dir('05-14-91 11:31'),
  'C:\\LIMBIC\\LIMBIC.SYS': file('bin', '05-14-91 11:31', '', 'A', { size: 28940 }),
  'C:\\LIMBIC\\IMAGE04.DAT': file('bin', '05-14-91 11:31', '', 'A', { size: 1258291 }),
  'C:\\LIMBIC\\PROTOCOL.TXT': file('text', '04-02-91 11:30', PROTOCOL),
  'C:\\LIMBIC\\BCPU.TXT': file('text', '05-14-91 11:31', BCPU),
  'C:\\LIMBIC\\DONOR.TXT': secret('05-14-91 11:40', DONOR, 'AH'),
  'C:\\LIMBIC\\CT0122.RPT': secret('04-30-91 16:20', CT_REPORT),
  'C:\\LIMBIC\\OPERATE.LOG': secret('05-14-91 11:45', OPERATION),
  'C:\\LIMBIC\\SHADOW': dir('05-14-91 11:31', 'H'),
  'C:\\LIMBIC\\SHADOW\\POWER.SHD': secret('12-07-91 21:40', POWER_SHADOW),
  'C:\\LIMBIC\\SHADOW\\DOOR.SHD': secret('10-31-91 18:40', DOOR_SHADOW),
  'C:\\LIMBIC\\SHADOW\\VENT.SHD': secret('10-31-91 18:38', VENT_SHADOW),
  'C:\\LIMBIC\\EXP': dir('11-17-91 04:02'),
  'C:\\LIMBIC\\EXP\\SUBJ01.DAT': secret('11-17-91 04:02', SUBJ01),
  'C:\\LIMBIC\\EXP\\SUBJ02.DAT': secret('11-20-91 03:15', SUBJ02),
  'C:\\LIMBIC\\EXP\\SUBJ03.DAT': secret('11-24-91 02:48', SUBJ03),
  'C:\\MAINT': dir('03-15-91 10:00'),
  'C:\\MAINT\\WORKORD.LOG': secret('11-03-91 13:00', WORK_ORDERS),
  'C:\\DOCS': dir(),
  'C:\\DOCS\\HANDOVER.WP': file('wp', '10-31-91 17:55', HANDOVER),
  'C:\\DOCS\\PROCEDUR.WP': file('wp', '09-02-91 11:45', PROCEDURE),
  'C:\\DOCS\\PROGRAMM.WP': file('wp', '06-01-91 09:30', PROGRAMME),
  'C:\\DOCS\\MEMO0503.WP': file('wp', '05-03-91 16:20', MEMO, 'AH'),
  'C:\\DOCS\\IR1103.WP': file('wp', '12-06-91 16:05', REPORT),
  'C:\\DOCS\\CONSENT': dir('05-12-91 10:05'),
  'C:\\DOCS\\CONSENT\\LIND.WP': file('wp', '05-12-91 10:05', CONSENT_LIND, 'A', { damaged: true }),
  'C:\\DOCS\\CONSENT\\ANDERSON.WP': file('wp', '05-12-91 10:20', CONSENT_ANDERSON),
  'C:\\DOCS\\PATIENTS': dir('04-24-91 11:00'),
  'C:\\DOCS\\EFFECTS': dir('05-12-91 10:30'),
  'C:\\DOCS\\EFFECTS\\ANDERSON.TXT': secret('05-12-91 10:30', EFFECTS_ANDERSON),
  'C:\\DOCS\\OP17': dir('10-31-91 17:50'),
  'C:\\COMLINK\\HQ.ASP': file('text', '09-12-91 16:40', HQ_SCRIPT),
  'C:\\SHEETS': dir(),
  'C:\\SHEETS\\ROSTER.WK1': file('sheet', '10-31-91 18:15', ROSTER),
  'C:\\SHEETS\\POWER.WK1': file('sheet', '12-08-91 02:00', POWER_SHEET),
  'C:\\SHEETS\\PATIENTS.WK1': file('sheet', '05-12-91 12:00', PATIENTS),
  'C:\\WRITEPRO': dir('03-15-91 10:00'),
  'C:\\WRITEPRO\\WPRO.EXE': program('11-06-89 12:00', 251904),
  'C:\\CALCPLAN': dir('03-15-91 10:00'),
  'C:\\CALCPLAN\\CALC.EXE': program('05-01-90 12:00', 176640),
  'C:\\COMLINK': dir('03-15-91 10:00'),
  'C:\\COMLINK\\COMLINK.EXE': program('02-20-90 12:00', 148528),
  'C:\\COMLINK\\DIAL.DIR': file('bin', '10-31-91 18:14', DIRECTORY),
  'C:\\COMLINK\\DOWNLOAD': dir('03-15-91 10:00'),
  'C:\\TEMP': dir(),
};
/** The directory and variables AUTOEXEC.BAT leaves behind, for sessions resumed without a boot. */
export const bootedShell = (): ShellState => ({
  cwd: 'C:\\AEGIS',
  env: {
    COMSPEC: 'C:\\COMMAND.COM',
    PROMPT: '$P$G',
    PATH: 'C:\\AEGIS;C:\\DOS;C:\\WRITEPRO;C:\\CALCPLAN;C:\\COMLINK',
    TEMP: 'C:\\TEMP',
  },
});
/** Files already deleted when the player arrives, still recoverable with UNDELETE. */
export const deletedAtStart = (): DeletedEntry[] => [
  { path: 'C:\\DOCS\\OP17\\LETTER.WP', entry: file('wp', '10-31-91 17:50', LETTER) },
  { path: 'C:\\DOCS\\PATIENTS\\LIND.WP', entry: file('wp', '05-13-91 09:00', REFERRAL_LIND) },
  {
    path: 'C:\\DOCS\\PATIENTS\\ANDERSON.WP',
    entry: file('wp', '05-13-91 09:02', REFERRAL_ANDERSON),
  },
];
/** Appears in C:\LIMBIC when the night reaches its decision. */
export const recoveryFile = (): FileEntry =>
  file('bin', '12-08-91 02:14', files['RECOVERY.BIN'], 'A', { size: 4096 });
