import {
  BOLD,
  BOLD_END,
  NOTE,
  NOTE_END,
  UNDERLINE,
  UNDERLINE_END,
} from '../../programs/writepro/Document';
/** WRITEPRO documents in C:\DOCS. Codes are the document's own: bold, underline, comments. */
const b = (text: string) => BOLD + text + BOLD_END;
const u = (text: string) => UNDERLINE + text + UNDERLINE_END;
const note = (text: string) => NOTE + text + NOTE_END;

/** OP-17's handover form from the last evening anyone worked here, never collected. */
export const HANDOVER = `${b('AEGIS SYSTEMS DIVISION / BLACKRIDGE ANNEX')}
${b('CONTROL ROOM SHIFT HANDOVER')}

SHIFT:\t\t\t31-OCT-91, 14:00 TO 22:00
OPERATOR:\t\t\tM. RENNICK (OP-17)
STATE OF BUS:\t\tMAIN SUPPLY. PROCESS 04 (SITE ASSISTANT)
\t\t\t\tRUNNING.
OPEN ITEMS:\t\tSITE ASSISTANT: DOOR FAULTS ON B3 THIS WEEK.
\t\t\t\tVENTILATION TEST SET FOR 18:00 BY PROCESS 04.
\t\t\t\tNOT APPROVED BY ME. SEE SHIFT_17.TXT.
\t\t\t\tSTORAGE C HAS BAD SECTORS.

HANDED OVER BY:\tM. Rennick
TIME:\t\t\t17:55

RELIEVED BY:\t\t
TIME:\t\t\t
`;
/** The override procedure. D. Halloran left the supervisor password in a hidden comment. */
export const PROCEDURE = `${b('SITE ASSISTANT -- SUPERVISOR OVERRIDES')}                  REV. 2

1.  The site assistant (process 04) runs doors, lighting, air,
    power and the maintenance units. Operators ${u('ask')}; they do
    not override.

2.  Only the site supervisor may override the assistant: log in
    as SUPERVISOR at the control-room workstation. The supervisor
    password is in D.H.'s comment below (Reveal Codes, F11).
${note('D.H. -- password is WESTWING. Tell nobody on the programme.')}
3.  Under supervisor authority, a system can be taken from the
    assistant by suspending its process (PS, SUSPEND).

4.  Supervisor files on C:\\LIMBIC and C:\\MAINT are not to be
    shown to operators.
`;
/** What the programme told its own staff, in words chosen to mean nothing. */
export const PROGRAMME = `${b('BLACKRIDGE CLINIC -- SITE ASSISTANT PROGRAMME')}
${b('SUMMARY FOR SITE STAFF')}                                REV. B

The site assistant (process 04) runs doors, lighting, air,
power and the maintenance units, and answers operators on
channel 04. It is the first system of its kind.

Two participants entered the programme in May 1991 through
the Riverside referral scheme. Both signed the standard
consent. Their contribution is gratefully acknowledged.

Staff should address the assistant as ASSISTANT. It is not a
person, and it should not be treated as one.
`;
/** Halloran's memo before the two referrals arrived. It is hidden. */
export const MEMO = `${b('MEMO')}                                             03-MAY-91
TO:       CLINIC STAFF, LEVEL B3
FROM:     D. HALLORAN, SITE SUPERVISOR
SUBJECT:  THE TWO REFERRALS

Both referrals arrive on 12 May. They believe they are here for
surgery, and it will stay that way.

${b('PATIENTS ARE NOT TO BE INFORMED')}

of the programme, the pattern transfer or the donor procedure.
Use the Riverside consent forms only. Do not use the word
"trial" in front of either of them.

Delete this memo after reading.
`;
/** The incident report form HQ wants by 06:00. */
export const REPORT = `${b('AEGIS SYSTEMS DIVISION -- INCIDENT REPORT IR-1103')}

SITE:\t\t\tBLACKRIDGE ANNEX
DATE OF INCIDENT:\t31-OCT-91
REPORTING OPERATOR:\t

PERSONS INVOLVED:

SUMMARY OF EVENTS:

ACTIONS TAKEN THIS SHIFT:

${u('Upload to HQ (COMLINK, AEGIS HQ, main menu U) before 06:00.')}
`;
/** The Riverside referral letters, deleted from C:\DOCS\PATIENTS. */
export const REFERRAL_LIND = `${b('RIVERSIDE GENERAL HOSPITAL -- DEPARTMENT OF NEUROLOGY')}
                                                   22-APR-91
TO:   ADMISSIONS, BLACKRIDGE CLINIC
RE:   LIND, ANNA M.   DOB 14-02-60

Thank you for accepting this referral.

Miss Lind, 31, LIBRARIAN, BLACKRIDGE PUBLIC LIBRARY,
PARAPLEGIC SINCE MARCH 1990 after a road accident (T11).
She is motivated, well supported by her family, and has asked
every question I could answer.

She understands the procedure to be
SPINAL NERVE REPAIR
as discussed with your Dr Weiss. I have told her nothing more,
as you asked.

Dr P. Marsh, Consultant Neurologist
`;
export const REFERRAL_ANDERSON = `${b('RIVERSIDE GENERAL HOSPITAL -- DEPARTMENT OF ONCOLOGY')}
                                                   24-APR-91
TO:   ADMISSIONS, BLACKRIDGE CLINIC
RE:   ANDERSON, JAMES   DOB 14-03-56

Mr Anderson, 35, drives a bus for Riverside Transit. Married,
one daughter. Metastatic disease since January 1990; our
treatment has failed. He has been told your clinic offers an
experimental
TUMOUR RESECTION
and that it is his best chance. He wants very much to see his
daughter grow up.

As requested, the head CT of 22-01-90 is enclosed.

Dr R. Oyelaran, Oncology
`;
/** The consent forms: surgery, not research, with the small print that allowed the rest. */
const consent = (patient: string, procedure: string, signed: string) => `${b('BLACKRIDGE CLINIC')}
${b('CONSENT TO SURGICAL PROCEDURE')}

PATIENT:\t\t${patient}
PROCEDURE:\t${procedure} (EXPERIMENTAL)
SURGEON:\t\tDR K. WEISS

I consent to the procedure described to me, and to such
further procedures as the surgeon considers necessary during
the operation.

SIGNED:\t\t${signed}\t\t\tDATE:  12-05-91
`;
export const CONSENT_LIND = consent('LIND, ANNA M.', 'SPINAL NERVE REPAIR', 'A. Lind');
export const CONSENT_ANDERSON = consent('ANDERSON, JAMES', 'TUMOUR RESECTION', 'J. Anderson');
/** Rennick's unsent letter to his wife, deleted from C:\DOCS\OP17 at 17:50 that evening. */
export const LETTER = `Jean,

The assistant asked me today what it feels like to walk. Then
it said sorry, as if it had said something rude. Programs do
not say sorry.

On Tuesday it locked Kowalski in the cold store for twenty
minutes. Maintenance says a relay. Tonight it has put a
ventilation test on the schedule for six o'clock, and nobody
approved it. I have told Halloran twice.

If I am late, it is only the buses.

M.
`;
