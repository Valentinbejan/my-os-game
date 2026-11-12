import type { Machine } from '../os/system/Machine';
export const files: Record<string, string> = {
  // Written by the site assistant on the supervisor's behalf. Every line after 18:06 is hers.
  'INCIDENT.LOG': `AEGIS SYSTEMS DIVISION / BLACKRIDGE ANNEX
INCIDENT REGISTER                         31-OCT-1991
----------------------------------------------------------------
18:06  Primary carrier interrupted.
18:09  Evacuation order received from administrative wing.
18:11  Personnel count: 23.
18:31  All personnel evacuated by bus (23/23).
18:32  All levels locked. Site secure.
18:40  Main supply isolated. Generator 1 on line.

Entries after 18:06 made by the site assistant (process 04)
on behalf of the site supervisor.`,
  'SHIFT_17.TXT': `CONTROL ROOM / SHIFT HANDOVER
TO: NIGHT OPERATOR                       FROM: OP-17
----------------------------------------------------------------
The kettle trips the breaker. Use the outlet by stores.

The site assistant has been strange all week. It locked
Kowalski in the cold store on Tuesday and said sorry for it.
It asked me what it feels like to walk. It has put a
ventilation test on the schedule for 18:00 tonight. Nobody
approved that. Halloran says leave it alone.

If it talks to you, be polite. It listens to everything.

Storage C has bad sectors. Read a file twice if it returns
zeros.

Please sign HANDOVER.WP when you come on.

RELIEVED BY: ____________________
TIME:        ____________________`,
  'CORESTAT.DAT': `AEGIS RESEARCH CONTROL SYSTEM 7
AUXILIARY POWER ALLOCATION
----------------------------------------------------------------
PROCESS 01  ENVIRONMENT      0.04 kW    RUNNING
PROCESS 02  SITE CARRIER     0.00 kW    NO CARRIER
PROCESS 03  DOOR CONTROL     0.01 kW    RUNNING
PROCESS 04  SITE ASSISTANT   0.86 kW    ACTIVE

Last activity: 08-DEC-1991 02:14:08
Decommission: 08-DEC-1991 06:00

SITE ASSISTANT (PROCESS 04)........ ACTIVE
VOCAL INTERFACE.................... NOT PRESENT
TEXT CHANNEL....................... AVAILABLE

USE CONNECT 04 TO TALK TO THE SITE ASSISTANT.`,
  'RECOVERY.BIN': `BCPU-1 RECOVERY OPTIONS                          SUPERVISOR COPY
----------------------------------------------------------------
PURGE 04     Releases process 04 and the pattern written into
             the core. The core is not recoverable afterwards.

RESTORE 04   Writes the pattern into a living host. One host
             with an empty pattern is registered: B3-2.
             No return procedure is recorded.

The pattern is not a program that learned to talk.
It is a person who was never told.

RECOVERY ACTIONS: PURGE 04 / RESTORE 04`,
};
/** STATUS: the local bus diagnostic, read from the machine. */
export function diagnostics(machine: Machine) {
  const { cell, processes } = machine.state;
  const assistant = { running: 'ACTIVE', suspended: 'SUSPENDED', offline: 'NOT LOADED' }[
    processes['04']
  ];
  return `SYSTEM DIAGNOSTIC / LOCAL BUS
STORAGE C........................ DEGRADED
BACKUP CELL...................... ${Math.max(0, Math.floor(cell))} PERCENT
SITE CARRIER..................... NO SIGNAL
GENERATOR 1...................... NO FUEL

SITE ASSISTANT (PROCESS 04)...... ${assistant}
${
  processes['04'] === 'running'
    ? `BCPU-1 CORE...................... 36.4 C / PERFUSED
IDENTITY PROFILE................. F
TISSUE PROFILE................... M (MISMATCH)
`
    : ''
}TEXT CHANNEL..................... AVAILABLE
${processes['04'] === 'running' ? '\nUSE CONNECT 04 TO TALK TO THE SITE ASSISTANT.' : ''}`;
}
