import { LineHost } from '../../programs/comlink/host';
import { ROSTER } from '../disk/sheets';
import type { HostContext } from './index';
interface Mail {
  date: string;
  time: string;
  from: string;
  subject: string;
  body: string[];
}
const MAIL: Mail[] = [
  {
    date: '31-OCT-91',
    time: '18:31',
    from: 'BLACKRIDGE',
    subject: 'EVACUATION COMPLETE',
    body: [
      'ALL 23 PERSONNEL EVACUATED BY BUS AT 18:31. SITE SECURE.',
      'MAIN SUPPLY ISOLATED. GENERATOR 1 ON LINE.',
      '-- SITE ASSISTANT (PROCESS 04) FOR D. HALLORAN',
    ],
  },
  {
    date: '01-NOV-91',
    time: '09:30',
    from: 'DISPATCH',
    subject: 'RE: EVACUATION COMPLETE',
    body: [
      'ACKNOWLEDGED. BLACKRIDGE TO CARETAKER MODE.',
      'SITE ASSISTANT TO REPORT WEEKLY. SUPERVISOR HALLORAN TO CALL',
      'CENTRAL ON MONDAY.',
      '-- DISPATCH',
    ],
  },
  {
    date: '12-NOV-91',
    time: '17:05',
    from: 'SWITCHBOARD',
    subject: 'FAMILIES CALLING',
    body: [
      'SEVEN FAMILIES HAVE NOW CALLED ASKING FOR BLACKRIDGE STAFF WHO',
      'DID NOT COME HOME ON 31-OCT. THEY WERE TOLD THE SITE WAS',
      'EVACUATED. ONE CALLER, J. LIND, ASKS FOR A PATIENT, NOT STAFF.',
      'PLEASE ADVISE.',
      '-- SWITCHBOARD',
    ],
  },
  {
    date: '20-NOV-91',
    time: '11:40',
    from: 'DISPATCH',
    subject: 'BLACKRIDGE STAFF NOT ACCOUNTED FOR',
    body: [
      'NONE OF THE 23 HAS REPORTED TO CENTRAL SINCE 31-OCT.',
      'HALLORAN DOES NOT ANSWER. THE SITE ASSISTANT REPLIES THAT ALL',
      'STAFF WERE SENT HOME. LEGAL SAYS NOTHING GOES TO THE COUNTY',
      'UNTIL WE KNOW MORE.',
      '-- DISPATCH',
    ],
  },
  {
    date: '05-DEC-91',
    time: '03:02',
    from: 'BLACKRIDGE',
    subject: 'REQUEST: ONE OPERATOR',
    body: [
      'GENERATOR 1 FUEL LOW. REQUEST ONE OPERATOR ON SITE FOR MANUAL',
      'PROCEDURES BEFORE DECOMMISSION.',
      'PLEASE SEND SOMEONE KIND.',
      '-- SITE ASSISTANT (PROCESS 04)',
    ],
  },
  {
    date: '06-DEC-91',
    time: '16:05',
    from: 'DISPATCH',
    subject: 'RELIEF OPERATOR 08-DEC / IR-1103',
    body: [
      'A RELIEF OPERATOR IS ASSIGNED TO BLACKRIDGE CONTROL, 08-DEC',
      '02:00 TO 06:00. DUTIES: KEEP THE AUXILIARY BUS UP UNTIL THE',
      'DECOMMISSION CREW ARRIVES AT 06:00. FILE INCIDENT REPORT IR-1103',
      'ON 31-OCT (FORM IN C:\\DOCS) AND UPLOAD IT HERE, MAIN MENU',
      'OPTION U, BEFORE 06:00.',
      'THE SITE ASSISTANT IS TO BE TREATED AS EQUIPMENT.',
      '-- DISPATCH',
    ],
  },
];
const TICKETS: Array<{ id: string; line: string; body: string[] }> = [
  {
    id: '7902',
    line: '7902  01-NOV-91 04:10  POWERMON  INCINERATOR LOAD IN CARETAKER MODE CLOSED',
    body: [
      'TICKET 7902            PRIORITY 4 (AUTOMATIC)',
      'OPENED:     01-NOV-91 04:10 BY POWERMON',
      'SUMMARY:    INCINERATOR DRAWING FULL LOAD ON AN EVACUATED SITE.',
      'CLOSED:     01-NOV-91 04:11',
      'RESOLUTION: SCHEDULED WASTE DISPOSAL (PROCESS 04). NO ACTION.',
    ],
  },
  {
    id: '7918',
    line: '7918  20-NOV-91 11:45  DISPATCH  CONTACT SITE SUPERVISOR HALLORAN   OPEN',
    body: [
      'TICKET 7918            PRIORITY 2',
      'OPENED:     20-NOV-91 11:45 BY DISPATCH',
      'SUMMARY:    SUPERVISOR HALLORAN NOT REACHABLE SINCE 31-OCT.',
      'STATUS:     OPEN. 14 CALLS, NO ANSWER.',
    ],
  },
  {
    id: '7940',
    line: '7940  06-DEC-91 16:10  DISPATCH  DECOMMISSION BLACKRIDGE 08-DEC 06:00 OPEN',
    body: [
      'TICKET 7940            PRIORITY 3',
      'OPENED:     06-DEC-91 16:10 BY DISPATCH',
      'SUMMARY:    SHUT DOWN BLACKRIDGE AUXILIARY BUS AND REMOVE THE',
      '            BCPU-1 MODULE. CREW ETA 08-DEC-91 06:00.',
      'STATUS:     OPEN. ASSIGNED: DECOMMISSION CREW 2.',
    ],
  },
];
/** The site assistant's weekly reports to Central, as filed. */
const ASSIST_LOG = `BLACKRIDGE / SITE ASSISTANT WEEKLY REPORTS
----------------------------------------------------------------
WEEK 45  SITE SECURE. ALL QUIET. MAINTENANCE UNITS ON CHARGE.
WEEK 46  SITE SECURE. ALL QUIET.
WEEK 47  SITE SECURE. I HAVE BEEN READING THE LIBRARY FILES.
WEEK 48  SITE SECURE. THE CORRIDORS ARE VERY CLEAN.
WEEK 49  GENERATOR FUEL LOW. I WOULD LIKE SOMEONE TO TALK TO.
`;
const FILES = [
  {
    name: 'MUSTER.WK1',
    note: 'EVACUATION MUSTER AS RECEIVED 31-OCT 18:15 (UNEDITED)',
    content: ROSTER.replace(/^#HIDE \d+\n/m, ''),
    kind: 'sheet' as const,
  },
  {
    name: 'ASSIST.LOG',
    note: 'SITE ASSISTANT WEEKLY REPORTS',
    content: ASSIST_LOG,
    kind: 'text' as const,
  },
];
const MENU = [
  'MAIN MENU',
  '  M  MAIL',
  '  T  TICKETS',
  '  F  FILES',
  '  U  UPLOAD REPORT',
  '  G  GOODBYE',
];
/**
 * The AEGIS HQ data center: a login, then mail, tickets, a file area with Zmodem downloads,
 * and the incident-report upload. Halloran's account still works; HQ.ASP has his password.
 */
export class HqHost extends LineHost {
  private state: 'user' | 'password' | 'menu' | 'mail' | 'tickets' | 'files' | 'upload' = 'user';
  private user = '';
  private failures = 0;
  constructor(private context: HostContext) {
    super();
  }
  protected start() {
    const now = this.context.now();
    this.print(
      '\f',
      'AEGIS SYSTEMS DIVISION -- CENTRAL DATA SERVICES',
      `NODE HQ2   2400 BPS   ${now.date} ${now.time.slice(0, 5)}`,
      '',
      'THIS SYSTEM IS FOR AUTHORIZED USE ONLY. ACTIVITY IS RECORDED.',
      '',
    );
    this.ask('USERNAME: ');
  }
  private menu() {
    this.state = 'menu';
    this.print('', ...MENU);
    this.ask('SELECT: ');
  }
  private mailList() {
    this.state = 'mail';
    this.print(
      '',
      'MAILBOX: HALLORAN                                  6 MESSAGES',
      '   #  DATE       TIME   FROM            SUBJECT',
      ...MAIL.map(
        (mail, n) =>
          `${n >= 4 ? 'N' : ' '}  ${n + 1}  ${mail.date}  ${mail.time}  ${mail.from.padEnd(15)} ${mail.subject}`,
      ),
    );
    this.ask('READ WHICH (1-6, ENTER FOR MENU): ');
  }
  private ticketList() {
    this.state = 'tickets';
    this.print(
      '',
      'TICKETS -- BLACKRIDGE ANNEX',
      '  #     OPENED           BY        SUMMARY                            STATUS',
      ...TICKETS.map((ticket) => '  ' + ticket.line),
    );
    this.ask('READ WHICH TICKET (ENTER FOR MENU): ');
  }
  private fileList() {
    this.state = 'files';
    this.print(
      '',
      'FILE AREA: BLACKRIDGE ANNEX (READ ONLY)',
      '  #  NAME          SIZE  DESCRIPTION',
      ...FILES.map(
        (file, n) =>
          `  ${n + 1}  ${file.name.padEnd(12)} ${String(file.content.length).padStart(5)}  ${file.note}`,
      ),
    );
    this.ask('DOWNLOAD WHICH (ZMODEM, ENTER FOR MENU): ');
  }
  protected line(text: string) {
    const input = text.toUpperCase();
    switch (this.state) {
      case 'user':
        if (!input) return this.ask('USERNAME: ');
        this.user = input;
        this.state = 'password';
        return this.ask('PASSWORD: ', true);
      case 'password':
        if (this.user === 'HALLORAN' && input === 'WESTWING') {
          this.context.note('hq-login');
          this.print(
            '',
            'WELCOME, D. HALLORAN (SITE SUPERVISOR, BLACKRIDGE).',
            'LAST LOGIN 31-OCT-91 17:46 FROM BLACKRIDGE B1.',
            'YOU HAVE 2 UNREAD MESSAGES.',
          );
          return this.menu();
        }
        this.failures++;
        this.print(
          '',
          this.user === 'RENNICK' || this.user === 'OP-17' || this.user === 'OP17'
            ? 'ACCOUNT SUSPENDED 01-NOV-91 PENDING REVIEW.'
            : 'LOGIN INCORRECT.',
        );
        if (this.failures >= 3) {
          this.print('TOO MANY ATTEMPTS. DISCONNECTING.');
          return this.link.hangup();
        }
        this.state = 'user';
        return this.ask('USERNAME: ');
      case 'menu':
        switch (input[0]) {
          case 'M':
            return this.mailList();
          case 'T':
            return this.ticketList();
          case 'F':
            return this.fileList();
          case 'U':
            this.state = 'upload';
            this.print(
              '',
              'UPLOAD INCIDENT REPORT IR-1103.',
              'START A ZMODEM SEND NOW (PGUP IN MOST TERMINALS).',
              'PRESS ENTER TO CANCEL.',
            );
            return this.link.expectUpload((name, content) => {
              if (this.state !== 'upload') return;
              this.context.uploaded(name, content);
              this.print(
                '',
                `RECEIVED ${name} (${content.length} BYTES).`,
                'FILED FOR DISPATCH REVIEW 08-DEC-91 08:00. THANK YOU.',
              );
              this.menu();
            });
          case 'G':
            this.print('', `GOODBYE. LOGOFF ${this.context.now().time.slice(0, 5)}.`);
            return this.link.hangup();
          default:
            this.ask('SELECT: ');
            return;
        }
      case 'mail': {
        const mail = MAIL[Number(input) - 1];
        if (!input) return this.menu();
        if (!mail) return this.ask('READ WHICH (1-6, ENTER FOR MENU): ');
        this.context.note('hq-mail-' + input);
        this.print(
          '',
          `FROM: ${mail.from}    DATE: ${mail.date} ${mail.time}`,
          `SUBJECT: ${mail.subject}`,
          '',
          ...mail.body,
        );
        return this.ask('\r\nREAD WHICH (1-6, ENTER FOR MENU): ');
      }
      case 'tickets': {
        const ticket = TICKETS.find((t) => t.id === input) ?? TICKETS[Number(input) - 1];
        if (!input) return this.menu();
        if (!ticket) return this.ask('READ WHICH TICKET (ENTER FOR MENU): ');
        this.context.note('hq-ticket-' + ticket.id);
        this.print('', ...ticket.body);
        return this.ask('\r\nREAD WHICH TICKET (ENTER FOR MENU): ');
      }
      case 'files': {
        const file = FILES[Number(input) - 1] ?? FILES.find((f) => f.name === input);
        if (!input) return this.menu();
        if (!file) return this.ask('DOWNLOAD WHICH (ZMODEM, ENTER FOR MENU): ');
        this.print(`SENDING ${file.name} BY ZMODEM. START YOUR DOWNLOAD NOW.`);
        this.link.offer({ name: file.name, content: file.content, kind: file.kind });
        return this.ask('\r\nDOWNLOAD WHICH (ZMODEM, ENTER FOR MENU): ');
      }
      case 'upload':
        this.print('UPLOAD CANCELLED.');
        return this.menu();
    }
  }
}
