import { FileSystem } from '../fs/FileSystem';
import { baseName, hasWildcard, join, matches, parent, splitName } from '../fs/paths';
import type { Shell } from '../shell/Shell';
import { Machine, processes, type ProcessId } from './Machine';
/** What the AEGIS tools need beyond the shell: the hardware and the machine's own reactions. */
export interface SystemContext {
  machine: Machine;
  /** Appends a line to the event log. */
  log(source: string, text: string): void;
  reboot(): Promise<void>;
  /** CHKDSK /F rewrote the disk; `busActive` if process 04 was running at the time. */
  surfaceRepair(busActive: boolean): Promise<void>;
  /** Something story-relevant the operator has now seen (DOORS). */
  note(event: string): void;
  /** A bus process was suspended or resumed by the operator. */
  changed?(id: ProcessId, state: 'suspended' | 'running'): void;
  /** How the doors stand, for DOORS. */
  doors?(): Array<[string, string]>;
}
const EVENTS = 'C:\\AEGIS\\LOGS\\EVENTS.LOG';
const dots = (label: string, value: string) => (label + ' ').padEnd(34, '.') + ' ' + value;
const stateName = (id: ProcessId, state: string) =>
  state === 'offline' ? (id === '02' ? 'NO CARRIER' : 'NOT LOADED') : state.toUpperCase();
function processId(shell: Shell, text: string | undefined): ProcessId | null {
  const id = text?.padStart(2, '0');
  return id && id in processes ? (id as ProcessId) : null;
}
export function registerSystem(shell: Shell, system: SystemContext) {
  const { machine } = system;
  shell.register(['PS'], {
    group: 'AEGIS',
    help: 'Lists the processes on the auxiliary bus.',
    async run(inner) {
      await inner.line('PID  PROCESS          STATE        DRAW');
      for (const id of Object.keys(processes) as ProcessId[]) {
        const state = machine.state.processes[id];
        const draw = state === 'running' ? processes[id].kilowatts : 0;
        await inner.line(
          `${id}   ${processes[id].name.padEnd(16)} ${stateName(id, state).padEnd(12)} ${draw.toFixed(2)} kW`,
        );
      }
      await inner.line(`${' '.repeat(22)}${'TOTAL'.padEnd(12)} ${machine.load().toFixed(2)} kW`);
    },
  });
  for (const verb of ['SUSPEND', 'RESUME'] as const)
    shell.register([verb], {
      group: 'AEGIS',
      help:
        verb === 'SUSPEND'
          ? 'Suspends a bus process to save power.'
          : 'Resumes a suspended bus process.',
      usage: verb + ' pid          e.g. ' + verb + ' 01',
      async run(inner, line) {
        const id = processId(inner, line.args[0]);
        if (!id) return inner.line('NO SUCH PROCESS. USE PS FOR A LIST.');
        const result = verb === 'SUSPEND' ? machine.suspend(id) : machine.resume(id);
        if (result === 'offline')
          return inner.line(`PROCESS ${id} IS ${stateName(id, 'offline')}.`);
        if (result === 'already')
          return inner.line(
            `PROCESS ${id} IS ALREADY ${machine.state.processes[id].toUpperCase()}.`,
          );
        system.log('BUS', `PROCESS ${id} ${result.toUpperCase()} BY ${machine.state.user}`);
        // The bus's relay bank: a heavy latch taking a process off, a lighter one putting it back.
        inner.io.cue?.(result === 'suspended' ? 'relay-bank' : 'relay-release');
        await inner.line(`PROCESS ${id} ${processes[id].name} ${result.toUpperCase()}.`);
        await inner.line(`BUS LOAD NOW ${machine.load().toFixed(2)} kW.`);
        system.changed?.(id, result);
      },
    });
  shell.register(['ALLOC'], {
    group: 'AEGIS',
    help: 'Reports the backup cell and the load on the auxiliary bus.',
    async run(inner) {
      const minutes = machine.runtime();
      const runtime = Number.isFinite(minutes)
        ? `${Math.floor(minutes / 60)} H ${String(Math.floor(minutes % 60)).padStart(2, '0')} MIN`
        : 'NO LOAD';
      inner.io.relays?.(500);
      await inner.line('AUXILIARY BUS / POWER ALLOCATION');
      await inner.line(dots('BACKUP CELL', machine.state.cell.toFixed(2) + ' PERCENT'));
      await inner.line(dots('BUS LOAD', machine.load().toFixed(2) + ' kW'));
      await inner.line(dots('ESTIMATED RUNTIME', runtime));
      if (machine.state.cell < 5) {
        inner.io.cue?.('cell-low');
        await inner.line('\nWARNING: BACKUP CELL LOW. SUSPEND NON-ESSENTIAL PROCESSES.');
      }
    },
  });
  shell.register(['DOORS'], {
    group: 'AEGIS',
    help: 'Reports the doors that door control (process 03) holds.',
    async run(inner) {
      system.note('doors');
      const control = machine.state.processes['03'];
      await inner.line(dots('DOOR CONTROL (03)', control.toUpperCase()));
      for (const [door, state] of system.doors?.() ?? [])
        await inner.line(dots(door, control === 'running' ? state : 'MANUAL'));
      if (control !== 'running')
        await inner.line('\nDOOR CONTROL IS OFF THE BUS. EVERY DOOR OPENS BY HAND.');
    },
  });
  shell.register(['USERS'], {
    group: 'AEGIS',
    help: 'Lists the accounts on this workstation.',
    async run(inner) {
      await inner.line('ACCOUNT      NAME          AUTHORITY     LAST LOGIN');
      await inner.line(
        `OP-17        M. RENNICK    OPERATOR      10-31-91 17:30${machine.state.user === 'OP-17' ? '  (SESSION)' : ''}`,
      );
      await inner.line(
        `SUPERVISOR   D. HALLORAN   SUPERVISOR    10-31-91 18:14${machine.supervisor ? '  (SESSION)' : ''}`,
      );
    },
  });
  shell.register(['LOGIN'], {
    group: 'AEGIS',
    help: 'Changes the account this session runs under.',
    usage: 'LOGIN [account]',
    async run(inner, line) {
      let account = line.args[0];
      if (!account) {
        await inner.print('ACCOUNT: ');
        account = await inner.io.readLine();
      }
      if (account.toUpperCase() === 'OP-17') {
        machine.login('OP-17', '');
        inner.io.cue?.('relay');
        return inner.line('SESSION RETURNED TO OP-17.');
      }
      await inner.print('PASSWORD: ');
      const password = await inner.io.readLine(true);
      if (!machine.login(account, password)) {
        system.log('CONSOLE', `LOGIN FAILED (${account.toUpperCase().slice(0, 12)})`);
        inner.io.cue?.('denied');
        return inner.line('LOGIN INCORRECT.');
      }
      system.log('CONSOLE', 'SUPERVISOR LOGIN');
      inner.io.cue?.('granted');
      await inner.line('SUPERVISOR AUTHORITY GRANTED.');
    },
  });
  shell.register(['LOGOUT'], {
    group: 'AEGIS',
    help: 'Returns the session to the operator account.',
    hidden: () => !machine.supervisor,
    async run(inner) {
      machine.login('OP-17', '');
      inner.io.cue?.('relay');
      await inner.line('SESSION RETURNED TO OP-17.');
    },
  });
  shell.register(['LOG'], {
    group: 'AEGIS',
    help: 'Shows the most recent entries in the machine event log.',
    usage: 'LOG [/N:lines]',
    async run(inner, line) {
      const count = Number(/^N:?(\d+)$/.exec(line.switches[0] ?? '')?.[1] ?? 12);
      const text = inner.fs.get(EVENTS)?.content ?? '';
      const entries = text
        .trimEnd()
        .split('\n')
        .filter((l) => /^\d\d-\d\d-\d\d/.test(l));
      await inner.io.disk();
      for (const entry of entries.slice(-Math.max(1, Math.min(count, 200))))
        await inner.line(entry);
    },
  });
  shell.register(['CHKDSK'], {
    group: 'Files',
    help: 'Checks a disk and displays a status report.',
    usage: 'CHKDSK [drive:] [/F]\n  /F  Fixes errors on the disk.',
    async run(inner, line) {
      const fix = line.switches.includes('F');
      const fs = inner.fs;
      let files = 0,
        directories = 0,
        hidden = 0,
        fileBytes = 0,
        hiddenBytes = 0;
      const damaged: string[] = [];
      const walk = (directory: string) => {
        for (const [name, entry] of fs.list(directory)) {
          const path = join(directory, name);
          if (entry.kind === 'dir') {
            directories++;
            walk(path);
            continue;
          }
          const size = Math.ceil(fs.size(entry) / 2048) * 2048;
          if (/[HS]/.test(entry.attrs)) {
            hidden++;
            hiddenBytes += size;
          } else {
            files++;
            fileBytes += size;
          }
          if (entry.damaged) damaged.push(path);
        }
      };
      walk('C:\\');
      inner.io.relays?.(1400);
      await inner.io.disk();
      await inner.io.disk();
      await inner.line('Volume AEGIS        created 10-12-1991 9:02a');
      await inner.line('Volume Serial Number is 1A2F-0B17');
      await inner.line();
      for (const path of damaged) await inner.line(`${path}\n   Bad sector in allocation chain`);
      if (damaged.length && !fix) {
        await inner.line('\nErrors found, F parameter not specified');
        await inner.line('Corrections will not be written to disk\n');
      }
      const total = 42_366_976;
      await inner.line(String(total).padStart(12) + ' bytes total disk space');
      await inner.line(String(hiddenBytes).padStart(12) + ` bytes in ${hidden} hidden files`);
      await inner.line(
        String(directories * 2048).padStart(12) + ` bytes in ${directories} directories`,
      );
      await inner.line(String(fileBytes).padStart(12) + ` bytes in ${files} user files`);
      await inner.line(String(fs.free()).padStart(12) + ' bytes available on disk');
      await inner.line();
      await inner.line('      2048 bytes in each allocation unit');
      await inner.line(String(total / 2048).padStart(10) + ' total allocation units on disk');
      await inner.line(
        String(Math.floor(fs.free() / 2048)).padStart(10) + ' available allocation units on disk',
      );
      await inner.line();
      await inner.line('    655360 total bytes memory');
      await inner.line('    393216 bytes free');
      if (!fix) return;
      for (const path of damaged) fs.write(path, { ...fs.get(path)!, damaged: false });
      if (damaged.length) {
        inner.io.cue?.('saved');
        await inner.line(`\n${damaged.length} bad sector chain(s) relocated.`);
      }
      system.log('STORAGE', `SURFACE REPAIR (CHKDSK /F) BY ${machine.state.user}`);
      await system.surfaceRepair(machine.state.processes['04'] === 'running');
    },
  });
  shell.register(['UNDELETE'], {
    group: 'Files',
    help: 'Recovers files which have been deleted.',
    usage: 'UNDELETE [[drive:][path]filename] [/LIST | /ALL]',
    async run(inner, line) {
      const spec = line.args[0] ?? '*.*';
      const path = inner.resolve(spec, true);
      if (!path) return inner.line('Invalid path');
      const directory =
        !hasWildcard(baseName(path)) && inner.fs.isDirectory(path) ? path : parent(path);
      const pattern = directory === path ? '*.*' : baseName(path);
      const candidates = inner.fs.deleted.filter(
        (d) => parent(d.path) === directory && matches(pattern, baseName(d.path)),
      );
      inner.io.relays?.(700);
      await inner.io.disk();
      await inner.line(`\nDirectory: ${directory}\nFile Specifications: ${pattern}\n`);
      await inner.line('    Deletion-tracking file not found.\n');
      await inner.line(
        `    Directory contains ${String(candidates.length).padStart(4)} deleted files.`,
      );
      await inner.line(
        `    Of those, ${String(candidates.length).padStart(4)} files may be recovered.\n`,
      );
      if (!candidates.length) return inner.line('No entries found.');
      for (const { path: original, entry } of candidates) {
        const [base, extension] = splitName(baseName(original));
        const masked = '?' + base.slice(1);
        await inner.print(
          `      ${masked.padEnd(8)} ${extension.padEnd(3)} ${String(inner.fs.size(entry)).padStart(9)}  ${entry.date}  ${entry.time}  ...A`,
        );
        if (line.switches.includes('LIST')) {
          await inner.line();
          continue;
        }
        await inner.print('  Undelete (Y/N)?');
        const answer = await inner.io.readKey();
        await inner.line(answer.length === 1 ? answer.toLowerCase() : '');
        if (answer !== 'Y') continue;
        let first = base[0];
        if (!line.switches.includes('ALL')) {
          await inner.print(`      Please type the first character for ${masked}.${extension}: `);
          first = await inner.io.readKey();
          await inner.line(first.toLowerCase());
          if (!/^[A-Z0-9_$#-]$/.test(first)) {
            await inner.line('Invalid character. File not undeleted.');
            continue;
          }
        }
        const restored = join(
          directory,
          first + base.slice(1) + (extension ? '.' + extension : ''),
        );
        if (inner.fs.get(restored)) {
          await inner.line('File already exists. File not undeleted.');
          continue;
        }
        inner.fs.write(restored, entry);
        inner.fs.deleted = inner.fs.deleted.filter((d) => d.path !== original);
        await inner.line('\nFile successfully undeleted.\n');
      }
    },
  });
  shell.register(['REBOOT'], {
    group: 'System',
    help: 'Restarts the workstation (CONFIG.SYS and AUTOEXEC.BAT run again).',
    async run(inner) {
      await inner.print('Restart the workstation? Unsaved work in programs is lost (Y/N)?');
      const answer = await inner.io.readKey();
      await inner.line(answer.length === 1 ? answer : '');
      if (answer === 'Y') await system.reboot();
    },
  });
}
/** Appends a timestamped line to the event log file. */
export function appendEvent(fs: FileSystem, stamp: string, source: string, text: string) {
  const entry = fs.get(EVENTS);
  if (!entry) return;
  fs.write(EVENTS, {
    ...entry,
    content: entry.content + `${stamp}  ${source.padEnd(18)} ${text}\n`,
    date: stamp.slice(0, 8),
    time: stamp.slice(9, 14),
  });
}
