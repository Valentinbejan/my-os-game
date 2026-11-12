/** What a Hayes command line asks the modem to do beyond answering OK. */
export type ModemAction =
  | { kind: 'dial'; number: string }
  | { kind: 'hangup' }
  | { kind: 'answer' }
  | { kind: 'online' }
  | { kind: 'reset' };
export type ModemResult =
  | 'OK'
  | 'CONNECT 2400'
  | 'RING'
  | 'NO CARRIER'
  | 'ERROR'
  | 'NO DIALTONE'
  | 'BUSY'
  | 'NO ANSWER'
  | 'VOICE';
const CODES: Record<ModemResult, string> = {
  OK: '0',
  'CONNECT 2400': '10',
  RING: '2',
  'NO CARRIER': '3',
  ERROR: '4',
  'NO DIALTONE': '6',
  BUSY: '7',
  'NO ANSWER': '8',
  VOICE: '8',
};
const INFO = ['2400', '9D', 'AEGIS DATAMODEM 2400 / HAYES COMPATIBLE', 'ROM 1.12 04-19-89'];
/** A Hayes-compatible 2400 bps modem: the AT command set as far as a night operator needs. */
export class Modem {
  echo = true;
  verbose = true;
  quiet = false;
  speaker = 1;
  private last = '';
  /** Formats a result code as the modem sends it (words, digits, or nothing in quiet mode). */
  result(result: ModemResult): string {
    if (this.quiet) return '';
    return this.verbose ? '\r\n' + result + '\r\n' : CODES[result] + '\r';
  }
  /**
   * Runs a typed command line. Returns the text the modem answers with and, for dialing,
   * answering, hanging up or going back on line, the action the caller must carry out.
   */
  command(input: string): { reply: string; action?: ModemAction } {
    let line = input.trim().toUpperCase();
    if (line === 'A/') line = this.last;
    if (!line) return { reply: '' };
    if (!line.startsWith('AT')) return { reply: this.result('ERROR') };
    this.last = line;
    let rest = line.slice(2).replace(/\s+/g, '');
    let reply = '';
    let action: ModemAction | undefined;
    while (rest) {
      const letter = rest[0];
      if (letter === 'D') {
        const number = rest
          .slice(1)
          .replace(/^[TP]/, '')
          .replace(/[^0-9*#,W@!;]/g, '');
        return { reply, action: { kind: 'dial', number: number.replace(/[,W@!;]/g, '') } };
      }
      const match = /^(&?[A-Z])(\d*)(=\d*)?/.exec(rest);
      if (!match) return { reply: this.result('ERROR') };
      rest = rest.slice(match[0].length);
      const value = match[2] === '' ? 0 : Number(match[2]);
      switch (match[1]) {
        case 'E':
          this.echo = value === 1;
          break;
        case 'V':
          this.verbose = value === 1;
          break;
        case 'Q':
          this.quiet = value === 1;
          break;
        case 'M':
          this.speaker = value;
          break;
        case 'H':
          action = { kind: 'hangup' };
          break;
        case 'A':
          return { reply, action: { kind: 'answer' } };
        case 'O':
          return { reply, action: { kind: 'online' } };
        case 'Z':
        case '&F':
          this.echo = true;
          this.verbose = true;
          this.quiet = false;
          this.speaker = 1;
          action = { kind: 'reset' };
          break;
        case 'I':
          if (value > 3) return { reply: this.result('ERROR') };
          reply += '\r\n' + INFO[value];
          break;
        case 'S':
        case 'X':
        case 'L':
        case 'B':
        case '&C':
        case '&D':
        case '&W':
          break;
        default:
          return { reply: this.result('ERROR') };
      }
    }
    return { reply: reply + this.result('OK'), action };
  }
}
