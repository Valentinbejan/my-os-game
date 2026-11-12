import { LineHost } from '../../programs/comlink/host';
import type { HostContext } from './index';
interface Post {
  number: number;
  date: string;
  from: string;
  to: string;
  subject: string;
  body: string[];
}
const BULLETINS: Array<{ title: string; body: string[] }> = [
  {
    title: 'WELCOME / RULES (SYSOP)',
    body: [
      'WELCOME TO THE BLACKRIDGE FREE-NET. ONE CALL PER DAY FOR GUESTS,',
      '30 MINUTES PER CALL. BE CIVIL. NO SELLING ON THE GENERAL BOARD.',
      'THE MODEM IS IN MY KITCHEN. IF IT IS BUSY, I AM ON THE PHONE.',
      '-- WALT PRUITT, SYSOP',
    ],
  },
  {
    title: 'ROADS AND WEATHER, WEEK OF 2 DEC',
    body: [
      'SNOW ON THE HILL ROAD MOST NIGHTS. THE COUNTY PLOUGHS AS FAR AS',
      'THE QUARRY AND NO FURTHER. CHAINS IF YOU MUST GO UP.',
    ],
  },
  {
    title: 'THE ANNEX (SYSOP, 12-NOV)',
    body: [
      'AEGIS SAYS THE ANNEX WAS EVACUATED ON HALLOWEEN AND EVERYBODY',
      'WAS SENT HOME BY BUS. I HAVE HAD SEVEN CALLS FROM FAMILIES WHO',
      'SAY NOBODY CAME HOME. THE COUNTY SAYS IT IS A COMPANY MATTER.',
      'THE LIGHTS ARE STILL ON UP THERE EVERY NIGHT.',
      'THERE IS A BOARD FOR THE FAMILIES NOW. -- WALT',
    ],
  },
];
const BOARDS: Array<{ name: string; posts: Post[] }> = [
  {
    name: 'GENERAL',
    posts: [
      {
        number: 301,
        date: '11-30-91',
        from: 'MARGE COLE',
        to: 'ALL',
        subject: 'CHRISTMAS FAIR SATURDAY',
        body: ['ST. LUKE HALL, 9 TO NOON. BRING TINS BACK PLEASE.'],
      },
      {
        number: 307,
        date: '12-03-91',
        from: 'DALE OKONJO',
        to: 'ALL',
        subject: 'LIGHTS ON THE HILL',
        body: [
          'DROVE PAST THE ANNEX AT 1 AM. EVERY FLOOR LIT. SOMETHING WAS',
          'MOVING PAST THE WINDOWS ON THE WEST SIDE, SLOW, IN A LINE.',
          'NOT PEOPLE. I DID NOT STOP.',
        ],
      },
    ],
  },
  {
    name: 'THE ANNEX / FAMILIES',
    posts: [
      {
        number: 262,
        date: '11-02-91',
        from: 'SUSAN PELL',
        to: 'ALL',
        subject: 'BILL PELL, FACILITIES',
        body: [
          'MY HUSBAND BILL WORKS FACILITIES AT THE ANNEX.',
          'HE NEVER CAME HOME',
          'ON THURSDAY. AEGIS SAYS EVERYBODY WAS BUSSED OUT AT HALF SIX.',
          'BILL DRIVES TO WORK. HIS CAR IS NOT IN OUR DRIVE.',
        ],
      },
      {
        number: 265,
        date: '11-04-91',
        from: 'MAUREEN ELLIS',
        to: 'SUSAN PELL',
        subject: 'RE: BILL PELL, FACILITIES',
        body: ['SAME. MY SON MARK, CATERING. THEY SAY BUS 1. HE NEVER RANG.'],
      },
      {
        number: 281,
        date: '11-15-91',
        from: 'J. LIND',
        to: 'ALL',
        subject: 'ANYONE AT THE BLACKRIDGE CLINIC?',
        body: [
          'MY SISTER ANNA',
          'WENT UP TO THE BLACKRIDGE CLINIC ON 12 MAY FOR AN OPERATION ON',
          'HER SPINE. THEY SAID SHE WOULD BE HOME BY AUGUST. HER LETTERS',
          'STOPPED IN JUNE. SINCE HALLOWEEN THE CLINIC PHONE DOES NOT',
          'ANSWER AT ALL. -- JONAS LIND',
        ],
      },
      {
        number: 283,
        date: '11-16-91',
        from: 'WALT PRUITT',
        to: 'J. LIND',
        subject: 'RE: ANYONE AT THE BLACKRIDGE CLINIC?',
        body: [
          'JONAS, THE CLINIC IS THE ANNEX. SAME BUILDING, SAME AEGIS.',
          'I WILL KEEP YOUR POST AT THE TOP OF THIS BOARD.',
        ],
      },
      {
        number: 298,
        date: '12-02-91',
        from: 'J. LIND',
        to: 'ALL',
        subject: 'RE: ANYONE AT THE BLACKRIDGE CLINIC?',
        body: [
          'STILL NOTHING. I STILL HAVE',
          'HER GREEN COAT',
          'IN THE CAR. SHE LEFT IT THE DAY I DROVE HER UP.',
          'MUM IS FEEDING PILOT. HE WAITS BY THE DOOR EVERY NIGHT.',
          'IF YOU ARE UP THERE, TELL HER.',
        ],
      },
    ],
  },
  {
    name: 'SWAP & SELL',
    posts: [
      {
        number: 290,
        date: '11-22-91',
        from: 'TOM REESE',
        to: 'ALL',
        subject: 'FS: 2400 BAUD MODEM',
        body: ['EXTERNAL, HAYES COMPATIBLE, CABLE INCLUDED. $60 OR TRADE.'],
      },
    ],
  },
];
/**
 * The Blackridge Free-Net: a one-line community BBS in the sysop's kitchen. The outside
 * world, where the families of the annex staff, and Anna's brother, are asking.
 */
export class FreeNetHost extends LineHost {
  private state: 'name' | 'menu' | 'bulletins' | 'boards' | 'posts' | 'read' | 'write' = 'name';
  private caller = 'GUEST';
  private board = 0;
  private post = 0;
  private draft: string[] = [];
  constructor(private context: HostContext) {
    super();
  }
  protected start() {
    this.print(
      '\f',
      '     BLACKRIDGE FREE-NET',
      '     A COMMUNITY BULLETIN BOARD SYSTEM -- SINCE 1988',
      '     SYSOP: WALT PRUITT                NODE 1 OF 1',
      '',
    );
    this.ask('ENTER YOUR FIRST AND LAST NAME, OR GUEST: ');
  }
  private menu() {
    this.state = 'menu';
    this.print(
      '',
      'MAIN MENU',
      ' [B] BULLETINS      [M] MESSAGE BOARDS     [W] WHO IS ON',
      ' [F] FILES          [G] GOODBYE',
    );
    this.ask('COMMAND: ');
  }
  private boards() {
    this.state = 'boards';
    this.print(
      '',
      'MESSAGE BOARDS',
      ...BOARDS.map(
        (board, n) => ` [${n + 1}] ${board.name.padEnd(28)} ${board.posts.length} MESSAGES`,
      ),
    );
    this.ask('BOARD (ENTER FOR MENU): ');
  }
  private posts() {
    this.state = 'posts';
    const board = BOARDS[this.board];
    this.print(
      '',
      `BOARD: ${board.name}`,
      '   #   DATE      FROM           SUBJECT',
      ...board.posts.map(
        (post, n) => ` [${n + 1}] ${post.date}  ${post.from.padEnd(14)} ${post.subject}`,
      ),
    );
    this.ask('READ WHICH (ENTER FOR BOARDS): ');
  }
  private read(index: number) {
    const post = BOARDS[this.board].posts[index];
    this.post = index;
    this.state = 'read';
    if (post.from === 'J. LIND') this.context.note('bbs-lind');
    this.print(
      '',
      `MSG #${post.number}  ${post.date}   FROM: ${post.from}   TO: ${post.to}`,
      `SUBJ: ${post.subject}`,
      '',
      ...post.body,
      '',
    );
    this.ask('[N]EXT  [R]EPLY  [Q]UIT: ');
  }
  protected line(text: string) {
    const input = text.toUpperCase();
    switch (this.state) {
      case 'name':
        this.caller = input.slice(0, 30) || 'GUEST';
        this.print(
          '',
          `WELCOME, ${this.caller}. CALLS TODAY: 3. TIME LEFT: 30 MIN.`,
          this.caller === 'GUEST' ? 'GUESTS MAY READ AND REPLY. FILES ARE FOR MEMBERS.' : '',
        );
        return this.menu();
      case 'menu':
        switch (input[0]) {
          case 'B':
            this.state = 'bulletins';
            this.print(
              '',
              'BULLETINS',
              ...BULLETINS.map((bulletin, n) => ` [${n + 1}] ${bulletin.title}`),
            );
            return this.ask('READ WHICH (ENTER FOR MENU): ');
          case 'M':
            return this.boards();
          case 'W':
            this.print(
              '',
              'NODE  CALLER                    ACTIVITY',
              `  1   ${this.caller.padEnd(24)}  ON LINE`,
            );
            return this.ask('COMMAND: ');
          case 'F':
            this.print('', 'FILES ARE FOR MEMBERS. ASK WALT.');
            return this.ask('COMMAND: ');
          case 'G':
            this.print('', 'THANKS FOR CALLING THE BLACKRIDGE FREE-NET!');
            return this.link.hangup();
          default:
            return this.ask('COMMAND: ');
        }
      case 'bulletins': {
        const bulletin = BULLETINS[Number(input) - 1];
        if (!input) return this.menu();
        if (bulletin) this.print('', ...bulletin.body);
        return this.ask('\r\nREAD WHICH (ENTER FOR MENU): ');
      }
      case 'boards':
        if (!input) return this.menu();
        if (!BOARDS[Number(input) - 1]) return this.ask('BOARD (ENTER FOR MENU): ');
        this.board = Number(input) - 1;
        return this.posts();
      case 'posts':
        if (!input) return this.boards();
        if (!BOARDS[this.board].posts[Number(input) - 1])
          return this.ask('READ WHICH (ENTER FOR BOARDS): ');
        return this.read(Number(input) - 1);
      case 'read':
        if (input[0] === 'N') {
          if (this.post + 1 < BOARDS[this.board].posts.length) return this.read(this.post + 1);
          this.print('END OF BOARD.');
          return this.posts();
        }
        if (input[0] === 'R') {
          this.state = 'write';
          this.draft = [];
          this.print(
            '',
            `REPLY TO ${BOARDS[this.board].posts[this.post].from}. TYPE YOUR MESSAGE.`,
            'A BLANK LINE ENDS IT.',
          );
          return this.ask(' 1: ');
        }
        return this.posts();
      case 'write':
        if (text) {
          this.draft.push(text);
          if (this.draft.length < 12)
            return this.ask(String(this.draft.length + 1).padStart(2) + ': ');
        }
        if (this.draft.length) {
          const post = BOARDS[this.board].posts[this.post];
          this.context.posted(post.from, this.draft.join('\n'));
          this.print('', 'MESSAGE #231 SAVED. THANK YOU.');
        } else this.print('', 'NOTHING TO SAVE.');
        return this.posts();
    }
  }
}
