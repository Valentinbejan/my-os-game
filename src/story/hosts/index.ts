import type { Clock } from '../../os/shell/Shell';
import type { DialResult } from '../../programs/comlink/host';
import { FreeNetHost } from './freenet';
import { HqHost } from './hq';
/** What a remote system may learn from, or tell, the story. */
export interface HostContext {
  now(): Clock;
  /** Something the player saw (a mail, a ticket, a post): an evidence event. */
  note(event: string): void;
  /** A file the player sent by Zmodem. */
  uploaded(name: string, content: string): void;
  /** A message the player left on the BBS. */
  posted(to: string, text: string): void;
}
/** Who answers a dialed number. `calls` counts earlier calls to it this session. */
export function answer(number: string, calls: number, context: HostContext): DialResult {
  const digits = number.replace(/\D/g, '');
  if (digits === '5550100' || digits === '15550100') return new HqHost(context);
  if (digits === '5550147' || digits === '15550147') return new FreeNetHost(context);
  if (digits === '210') return 'NO CARRIER';
  if (digits === '5550199') return calls === 0 ? 'BUSY' : 'VOICE';
  if (digits.length <= 4) return 'NO CARRIER';
  return 'NO ANSWER';
}
