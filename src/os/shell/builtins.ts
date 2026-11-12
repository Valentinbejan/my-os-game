import type { FileEntry } from '../fs/FileSystem';
import {
  baseName,
  hasWildcard,
  isRoot,
  join,
  matches,
  parent,
  splitName,
  validName,
} from '../fs/paths';
import { findLines, VERSION, type Command, type Shell } from './Shell';
const LABEL = 'AEGIS';
const SERIAL = '1A2F-0B17';
/** 18:19 becomes " 6:19p", as DOS 5 lists times. */
const clock12 = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}${hours < 12 ? 'a' : 'p'}`;
};
const visible = (entry: FileEntry) => !/[HS]/.test(entry.attrs);
/** Applies a wildcard target name to a source name (COPY *.TXT *.BAK, REN A?.* B?.*). */
export function renameWith(pattern: string, name: string) {
  const [patternBase, patternExtension] = splitName(pattern);
  const [base, extension] = splitName(name);
  const part = (wanted: string, actual: string) => {
    let out = '';
    for (let n = 0; n < wanted.length; n++) {
      if (wanted[n] === '*') return out + actual.slice(n);
      out += wanted[n] === '?' ? (actual[n] ?? '') : wanted[n];
    }
    return out;
  };
  const extensionPart = part(patternExtension, extension);
  return part(patternBase, base) + (extensionPart ? '.' + extensionPart : '');
}
/** A file's bytes as TYPE shows them: text as text, anything binary as garbage up to ^Z. */
export function printable(path: string, entry: FileEntry): string {
  if (entry.kind === 'text' || entry.kind === 'batch')
    return entry.content.endsWith('\n') ? entry.content : entry.content + '\n';
  let seed = [...path].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  const glyphs = '!"#$%&()*+,-./:;<=>?@[]^_{|}~░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬┘┌█▄▌▐▀';
  const next = () => (seed = (seed * 1103515245 + 12345) >>> 0);
  const noise = (length: number) =>
    Array.from({ length }, () =>
      next() % 3 ? glyphs[next() % glyphs.length] : String.fromCharCode(65 + (next() % 26)),
    ).join('');
  const header = entry.kind === 'exe' ? 'MZ' : entry.kind === 'wp' ? 'WPC' : '';
  // Binary files end at the first ^Z byte, so TYPE shows only a short burst.
  const burst = Array.from({ length: 2 + (next() % 3) }, () => noise(40 + (next() % 30)));
  // Readable text inside a binary (a document, a recovery record) follows the header noise;
  // a document's formatting codes show as junk between the words, and a worksheet's labels
  // appear one after another among its cell records.
  const junk = '▒╢╣▓╡░';
  const content =
    entry.kind === 'sheet'
      ? entry.content
          .split('\n')
          .map((line) => /^[A-Z]{1,2}\d{1,4}\|[^|]*\|['"^](.+)$/.exec(line)?.[1])
          .filter(Boolean)
          .map((label) => label + junk[next() % junk.length] + noise(1 + (next() % 3)))
          .join('')
          .replace(/(.{1,72})/g, '$1\n')
      : entry.content;
  const shown = [...content]
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x11 && code <= 0x16 ? junk[code - 0x11] : char === '\t' ? '    ' : char;
    })
    .join('');
  const text = shown ? '\n' + shown.replace(/\n?$/, '\n') : '\n';
  return header + burst.join('\n') + text;
}
/** Resolves a directory argument with an optional file pattern (DIR, DEL, ATTRIB). */
function target(shell: Shell, input = '.') {
  const path = shell.resolve(input, true);
  if (!path) return null;
  if (!hasWildcard(baseName(path)) && shell.fs.isDirectory(path))
    return { directory: path, pattern: '*.*' };
  return { directory: parent(path), pattern: baseName(path) };
}
function select(shell: Shell, directory: string, pattern: string, hidden = false) {
  return shell.fs
    .list(directory)
    .filter(
      ([name, entry]) =>
        (hidden || visible(entry)) &&
        (hasWildcard(pattern) ? matches(pattern, name) : name === pattern),
    );
}
async function notReady(shell: Shell, drive: string) {
  for (;;) {
    await shell.print(`\nNot ready reading drive ${drive}\nAbort, Retry, Fail?`);
    const key = await shell.io.readKey();
    await shell.line(key.length === 1 ? key : '');
    if (key === 'A' || key === 'F') return;
  }
}
const DIR: Command = {
  group: 'Files',
  help: 'Displays a list of files and subdirectories in a directory.',
  usage: 'DIR [drive:][path][filename] [/P] [/W] [/A[[:]attributes]] [/O[[:]order]] [/S] [/B]',
  async run(shell, line) {
    if (line.args[0]?.toUpperCase().startsWith('A:')) return notReady(shell, 'A');
    const where = target(shell, line.args[0]);
    if (!where || !shell.fs.isDirectory(where.directory)) return shell.line('Path not found');
    const flag = (letter: string) => line.switches.find((s) => s[0] === letter);
    const attributes = flag('A')?.slice(1).replace(':', '');
    const order = (flag('O')?.slice(1).replace(':', '') || (flag('O') ? 'N' : '')).replace('-', '');
    const wide = !!flag('W'),
      bare = !!flag('B'),
      paged = !!flag('P'),
      recurse = !!flag('S');
    await shell.io.disk();
    let shown = 0;
    const out = async (text = '') => {
      await shell.line(text);
      if (paged && ++shown % 22 === 0) {
        await shell.print('Press any key to continue . . .');
        await shell.io.readKey();
        await shell.line();
      }
    };
    let files = 0,
      bytes = 0,
      found = false;
    const walk = async (directory: string) => {
      let entries = shell.fs.list(directory).filter(([name, entry]) => {
        if (where.pattern !== '*.*' && !matches(where.pattern, name)) return false;
        if (attributes === undefined) return visible(entry);
        return [...attributes.matchAll(/(-?)([DHSRA])/g)].every(([, not, letter]) => {
          const has = letter === 'D' ? entry.kind === 'dir' : entry.attrs.includes(letter);
          return not ? !has : has;
        });
      });
      if (order) {
        const key = (name: string, entry: FileEntry) =>
          order.includes('G') ? (entry.kind === 'dir' ? '0' : '1') : '';
        const by: Record<string, (a: [string, FileEntry], b: [string, FileEntry]) => number> = {
          N: (a, b) => a[0].localeCompare(b[0]),
          E: (a, b) => splitName(a[0])[1].localeCompare(splitName(b[0])[1]),
          S: (a, b) => shell.fs.size(a[1]) - shell.fs.size(b[1]),
          D: (a, b) => (a[1].date + a[1].time).localeCompare(b[1].date + b[1].time),
        };
        const sort = by[order.replace('G', '')[0]] ?? by.N;
        entries = [...entries].sort((a, b) => key(...a).localeCompare(key(...b)) || sort(a, b));
      }
      const dirEntry = shell.fs.get(directory)!;
      const rows: Array<[string, FileEntry]> =
        isRoot(directory) || bare || where.pattern !== '*.*'
          ? entries
          : [['.', dirEntry], ['..', dirEntry], ...entries];
      if (rows.length) {
        found = true;
        if (!bare) {
          await out(' Directory of ' + directory);
          await out();
        }
        let column = '';
        for (const [name, entry] of rows) {
          const dir = entry.kind === 'dir';
          if (!dir) {
            files++;
            bytes += shell.fs.size(entry);
          }
          if (bare) {
            if (name !== '.' && name !== '..') await out(recurse ? join(directory, name) : name);
          } else if (wide) {
            column += (dir ? `[${name}]` : name).padEnd(16);
            if (column.length >= 80) {
              await out(column.trimEnd());
              column = '';
            }
          } else {
            const [base, extension] = name.startsWith('.') ? [name, ''] : splitName(name);
            const size = dir ? ' <DIR>    ' : String(shell.fs.size(entry)).padStart(10);
            await out(
              `${base.padEnd(8)} ${extension.padEnd(3)}${size} ${entry.date} ${clock12(entry.time).padStart(7)}`,
            );
          }
        }
        if (column) await out(column.trimEnd());
        if (!bare && !recurse)
          await out(`${String(files).padStart(9)} file(s)${String(bytes).padStart(15)} bytes`);
        if (recurse && !bare) await out();
      }
      if (recurse)
        for (const [name, entry] of shell.fs.list(directory))
          if (entry.kind === 'dir') await walk(join(directory, name));
    };
    if (!bare) {
      await out();
      await out(` Volume in drive C is ${LABEL}`);
      await out(` Volume Serial Number is ${SERIAL}`);
    }
    await walk(where.directory);
    if (!found) return out('File not found');
    if (bare) return;
    if (recurse) {
      await out('Total files listed:');
      await out(`${String(files).padStart(9)} file(s)${String(bytes).padStart(15)} bytes`);
    }
    await out(`${String(shell.fs.free()).padStart(29)} bytes free`);
  },
};
const CD: Command = {
  group: 'Files',
  help: 'Displays the name of or changes the current directory.',
  usage: 'CHDIR [drive:][path]\nCHDIR[..]\nCD [drive:][path]\nCD[..]',
  async run(shell, line) {
    const [path] = line.args;
    if (!path) return shell.line(shell.cwd);
    const resolved = shell.resolve(path);
    if (!resolved || !shell.fs.isDirectory(resolved)) return shell.line('Invalid directory');
    shell.cwd = resolved;
  },
};
const MD: Command = {
  group: 'Files',
  help: 'Creates a directory.',
  usage: 'MKDIR [drive:]path\nMD [drive:]path',
  async run(shell, line) {
    const [path] = line.args;
    if (!path) return shell.line('Required parameter missing');
    const resolved = shell.resolve(path);
    if (!resolved || shell.fs.get(resolved) || !shell.fs.isDirectory(parent(resolved)))
      return shell.line('Unable to create directory');
    const now = shell.io.now();
    shell.fs.write(resolved, {
      kind: 'dir',
      content: '',
      date: now.date,
      time: now.time.slice(0, 5),
      attrs: '',
    });
    await shell.io.disk();
  },
};
const RD: Command = {
  group: 'Files',
  help: 'Removes (deletes) a directory.',
  usage: 'RMDIR [drive:]path\nRD [drive:]path',
  async run(shell, line) {
    const [path] = line.args;
    if (!path) return shell.line('Required parameter missing');
    const resolved = shell.resolve(path);
    if (
      !resolved ||
      !shell.fs.isDirectory(resolved) ||
      isRoot(resolved) ||
      shell.fs.list(resolved).length ||
      shell.cwd === resolved ||
      shell.cwd.startsWith(resolved + '\\')
    )
      return shell.line('Invalid path, not directory,\nor directory not empty');
    shell.fs.remove(resolved);
    await shell.io.disk();
  },
};
const TYPE: Command = {
  group: 'Files',
  help: 'Displays the contents of a text file.',
  usage: 'TYPE [drive:][path]filename',
  async run(shell, line) {
    const [name] = line.args;
    if (!name) return shell.line('Required parameter missing');
    if (line.args.length > 1) return shell.line('Too many parameters - ' + line.args[1]);
    if (name.toUpperCase().startsWith('A:')) return notReady(shell, 'A');
    const path = hasWildcard(name) ? null : shell.resolve(name);
    const entry = path ? shell.fs.get(path) : undefined;
    // Hidden files stay out of listings but open by name, as on DOS.
    if (!path || !entry) return shell.line('File not found - ' + name.toUpperCase());
    if (entry.kind === 'dir' || !shell.allowed(entry)) return shell.line('Access denied');
    await shell.io.disk();
    const opened = await shell.open(path);
    if (opened) await shell.print(printable(path, opened));
  },
};
async function copyFromConsole(shell: Shell, name?: string) {
  if (!name) return shell.line('Required parameter missing');
  const path = shell.resolve(name);
  if (!path || !shell.fs.isDirectory(parent(path)) || shell.fs.isDirectory(path))
    return shell.line('File creation error');
  let text = '';
  for (;;) {
    const typed = await shell.io.readLine();
    const end = typed.indexOf('^Z');
    if (end >= 0) {
      text += typed.slice(0, end);
      break;
    }
    text += typed + '\n';
  }
  const now = shell.io.now();
  shell.fs.write(path, {
    kind: 'text',
    content: text,
    date: now.date,
    time: now.time.slice(0, 5),
    attrs: 'A',
  });
  await shell.io.disk();
  await shell.line('        1 file(s) copied');
}
const COPY: Command = {
  group: 'Files',
  help: 'Copies one or more files to another location.',
  usage:
    'COPY source [destination]\nCOPY CON filename    Type the file; end it with Ctrl+Z (or F6), then Enter.',
  async run(shell, line) {
    const [from, to = '.'] = line.args;
    if (!from) return shell.line('Required parameter missing');
    if (from.toUpperCase() === 'CON') return copyFromConsole(shell, line.args[1]);
    if (from.toUpperCase().startsWith('A:') || to.toUpperCase().startsWith('A:'))
      return notReady(shell, 'A');
    const source = shell.resolve(from, true);
    const pattern = source ? baseName(source) : '';
    const sources = !source
      ? []
      : shell.fs.isDirectory(source)
        ? select(shell, source, '*.*').map(([name]) => join(source, name))
        : select(shell, parent(source), pattern)
            .filter(([, entry]) => entry.kind !== 'dir')
            .map(([name]) => join(parent(source), name));
    if (!sources.length) {
      await shell.line('File not found - ' + from.toUpperCase());
      return shell.line('        0 file(s) copied');
    }
    const console = to.toUpperCase() === 'CON';
    const destination = console ? null : shell.resolve(to, true);
    if (!console && !destination) return shell.line('Invalid directory');
    let copied = 0;
    for (const path of sources) {
      if (sources.length > 1 || hasWildcard(from)) await shell.line(baseName(path));
      if (!shell.allowed(shell.fs.get(path)!)) {
        await shell.line('Access denied');
        continue;
      }
      const entry = await shell.open(path);
      if (!entry) break;
      if (console) {
        await shell.print(printable(path, entry));
        copied++;
        continue;
      }
      const into = shell.fs.isDirectory(destination!)
        ? join(destination!, baseName(path))
        : hasWildcard(baseName(destination!))
          ? join(parent(destination!), renameWith(baseName(destination!), baseName(path)))
          : destination!;
      if (!shell.fs.isDirectory(parent(into))) {
        await shell.line('Invalid directory');
        break;
      }
      if (into === path) {
        await shell.line('File cannot be copied onto itself');
        continue;
      }
      if (shell.fs.get(into)?.attrs.includes('R')) {
        await shell.line('Access denied');
        continue;
      }
      shell.fs.write(into, { ...entry, attrs: 'A', damaged: undefined });
      copied++;
    }
    await shell.io.disk();
    await shell.line(`${String(copied).padStart(9)} file(s) copied`);
  },
};
const DEL: Command = {
  group: 'Files',
  help: 'Deletes one or more files.',
  usage: 'DEL [drive:][path]filename [/P]\nERASE [drive:][path]filename [/P]',
  async run(shell, line) {
    const [name] = line.args;
    if (!name) return shell.line('Required parameter missing');
    const where = target(shell, name);
    if (!where || !shell.fs.isDirectory(where.directory)) return shell.line('Path not found');
    if (where.pattern === '*.*' || where.pattern === '*') {
      await shell.print('All files in directory will be deleted!\nAre you sure (Y/N)?');
      if (!/^\s*Y/i.test(await shell.io.readLine())) return;
    }
    const victims = select(shell, where.directory, where.pattern).filter(
      ([, entry]) => entry.kind !== 'dir',
    );
    if (!victims.length) return shell.line('File not found');
    for (const [file, entry] of victims) {
      if (line.switches.includes('P')) {
        await shell.print(`${join(where.directory, file)},    Delete (Y/N)?`);
        const key = await shell.io.readKey();
        await shell.line(key);
        if (key !== 'Y') continue;
      }
      if (entry.attrs.includes('R') || !shell.allowed(entry)) await shell.line('Access denied');
      else shell.fs.remove(join(where.directory, file));
    }
    await shell.io.disk();
  },
};
const REN: Command = {
  group: 'Files',
  help: 'Renames a file or files.',
  usage: 'RENAME [drive:][path]filename1 filename2\nREN [drive:][path]filename1 filename2',
  async run(shell, line) {
    const [from, to] = line.args;
    if (!from || !to) return shell.line('Required parameter missing');
    const where = target(shell, from);
    const names = where ? select(shell, where.directory, where.pattern) : [];
    const clash = (name: string) =>
      !validName(name) || !!shell.fs.get(join(where!.directory, name));
    if (!where || !names.length || /[\\:]/.test(to))
      return shell.line('Duplicate file name or file not found');
    let failed = false;
    for (const [name, entry] of names) {
      const renamed = renameWith(to.toUpperCase(), name);
      if (clash(renamed) || !shell.allowed(entry)) {
        failed = true;
        continue;
      }
      shell.fs.move(join(where.directory, name), join(where.directory, renamed));
    }
    if (failed) await shell.line('Duplicate file name or file not found');
    await shell.io.disk();
  },
};
const ATTRIB: Command = {
  group: 'Files',
  help: 'Displays or changes file attributes.',
  usage:
    'ATTRIB [+R | -R] [+A | -A] [+S | -S] [+H | -H] [[drive:][path]filename]\n  +  Sets an attribute.   -  Clears an attribute.\n  R  Read-only   A  Archive   S  System   H  Hidden',
  async run(shell, line) {
    const changes = line.args
      .filter((arg) => /^[+-][RASH]$/i.test(arg))
      .map((a) => a.toUpperCase());
    const name = line.args.find((arg) => !/^[+-][RASH]$/i.test(arg)) ?? '*.*';
    const where = target(shell, name);
    const found = where
      ? select(shell, where.directory, where.pattern, true).filter(
          ([, entry]) => entry.kind !== 'dir',
        )
      : [];
    if (!found.length) return shell.line('File not found - ' + name.toUpperCase());
    for (const [file, entry] of found) {
      const path = join(where!.directory, file);
      if (!changes.length) {
        const flags = ['A', 'S', 'H', 'R'].map((f) => (entry.attrs.includes(f) ? f : ' '));
        await shell.line(`${flags[0]}    ${flags[1]}${flags[2]}${flags[3]}     ${path}`);
        continue;
      }
      let attrs = entry.attrs;
      for (const change of changes)
        attrs =
          change[0] === '+'
            ? attrs.includes(change[1])
              ? attrs
              : attrs + change[1]
            : attrs.replace(change[1], '');
      shell.fs.write(path, { ...entry, attrs });
    }
    if (changes.length) await shell.io.disk();
  },
};
const TREE: Command = {
  group: 'Files',
  help: 'Graphically displays the directory structure of a drive or path.',
  usage: 'TREE [drive:][path] [/F]',
  async run(shell, line) {
    const start = shell.resolve(line.args[0] ?? '.');
    if (!start || !shell.fs.isDirectory(start))
      return shell.line('Invalid path - ' + (line.args[0] ?? ''));
    const files = line.switches.includes('F');
    await shell.io.disk();
    await shell.line(`Directory PATH listing for Volume ${LABEL}`);
    await shell.line(`Volume Serial Number is ${SERIAL}`);
    await shell.line(start);
    let any = false;
    const walk = async (directory: string, indent: string) => {
      const entries = shell.fs.list(directory).filter(([, entry]) => visible(entry));
      const dirs = entries.filter(([, e]) => e.kind === 'dir');
      if (files)
        for (const [name, entry] of entries)
          if (entry.kind !== 'dir')
            await shell.line(indent + (dirs.length ? '│   ' : '    ') + name);
      if (files && entries.some(([, e]) => e.kind !== 'dir'))
        await shell.line(indent + (dirs.length ? '│' : ''));
      for (let n = 0; n < dirs.length; n++) {
        any = true;
        const last = n === dirs.length - 1;
        await shell.line(indent + (last ? '└───' : '├───') + dirs[n][0]);
        await walk(join(directory, dirs[n][0]), indent + (last ? '    ' : '│   '));
      }
    };
    await walk(start, '');
    if (!any && !files) await shell.line('No subdirectories exist');
  },
};
async function inputText(shell: Shell, path: string) {
  const resolved = shell.resolve(path);
  const entry = resolved ? shell.fs.get(resolved) : undefined;
  if (!resolved || !entry || entry.kind === 'dir' || !shell.allowed(entry)) return null;
  const opened = await shell.open(resolved);
  return opened ? printable(resolved, opened) : '';
}
const FIND: Command = {
  group: 'Files',
  help: 'Searches for a text string in a file or files.',
  usage: 'FIND [/V] [/C] [/N] [/I] "string" [[drive:][path]filename[ ...]]',
  async run(shell, line) {
    const [needle, ...names] = line.args;
    if (needle === undefined || !/"/.test(line.raw))
      return shell.line('FIND: Parameter format not correct');
    if (!names.length && line.input) names.push(line.input);
    if (!names.length) return shell.line('FIND: Required parameter missing');
    await shell.io.disk();
    for (const name of names) {
      const where = target(shell, name);
      const found = where
        ? select(shell, where.directory, where.pattern).filter(([, e]) => e.kind !== 'dir')
        : [];
      if (!found.length) {
        await shell.line('File not found - ' + name.toUpperCase());
        continue;
      }
      for (const [file] of found) {
        const text = await inputText(shell, join(where!.directory, file));
        if (text === null) {
          await shell.line('Access denied - ' + file);
          continue;
        }
        const hits = findLines(text, needle, line.switches);
        const counting = line.switches.includes('C');
        await shell.print(
          `\n---------- ${join(where!.directory, file)}${counting ? ': ' + hits[0] : '\n'}`,
        );
        if (!counting) await shell.print(hits.join(''));
      }
    }
  },
};
const MORE: Command = {
  group: 'Files',
  help: 'Displays output one screen at a time.',
  usage: 'MORE < [drive:][path]filename\ncommand-name | MORE',
  async run(shell, line) {
    if (!line.input) return shell.line('Required parameter missing');
    const text = await inputText(shell, line.input);
    if (text === null) return shell.line('File not found');
    const lines = text.replace(/\n$/, '').split('\n');
    for (let n = 0; n < lines.length; n++) {
      await shell.line(lines[n]);
      if ((n + 1) % 23 === 0 && n + 1 < lines.length) {
        await shell.print('-- More --');
        await shell.io.readKey();
        await shell.line();
      }
    }
  },
};
const ECHO: Command = {
  group: 'System',
  help: 'Displays messages, or turns command echoing on or off.',
  usage: 'ECHO [ON | OFF]\nECHO [message]',
  async run(shell, line) {
    const text = line.raw;
    if (line.name === 'ECHO.') return shell.line(text);
    if (!text.trim()) return shell.line('ECHO is ' + (shell.echo ? 'on' : 'off'));
    if (/^\s*(ON|OFF)\s*$/i.test(text)) shell.echo = /ON/i.test(text);
    else await shell.line(text);
  },
};
const SET: Command = {
  group: 'System',
  help: 'Displays, sets, or removes environment variables.',
  usage: 'SET [variable=[string]]',
  async run(shell, line) {
    const text = line.raw.trim();
    if (!text) {
      for (const [name, value] of Object.entries(shell.state.env))
        await shell.line(`${name}=${value}`);
      return;
    }
    const cut = text.indexOf('=');
    if (cut <= 0) return shell.line('Syntax error');
    const name = text.slice(0, cut).trim().toUpperCase(),
      value = text.slice(cut + 1);
    if (value) shell.state.env[name] = value;
    else delete shell.state.env[name];
  },
};
const PROMPT: Command = {
  group: 'System',
  help: 'Changes the command prompt.',
  usage:
    'PROMPT [text]\n  $P  Current drive and path   $G  > sign   $N  Current drive\n  $D  Current date   $T  Current time   $V  Version   $$  $ sign',
  async run(shell, line) {
    shell.state.env.PROMPT = line.raw.trim() || '$N$G';
  },
};
const PATH: Command = {
  group: 'System',
  help: 'Displays or sets a search path for executable files.',
  usage: 'PATH [[drive:]path[;...]]\nPATH ;',
  async run(shell, line) {
    const text = line.raw.trim();
    if (!text) return shell.line('PATH=' + (shell.state.env.PATH ?? ''));
    shell.state.env.PATH = text === ';' ? '' : text.toUpperCase();
  },
};
const VOL: Command = {
  group: 'System',
  help: 'Displays a disk volume label and serial number.',
  usage: 'VOL [drive:]',
  async run(shell) {
    await shell.line(` Volume in drive C is ${LABEL}`);
    await shell.line(` Volume Serial Number is ${SERIAL}`);
  },
};
const VER: Command = {
  group: 'System',
  help: 'Displays the operating system version.',
  async run(shell) {
    await shell.line();
    await shell.line(VERSION);
    await shell.line('AEGIS RESEARCH CONTROL SYSTEM 7 / REMOTE OPERATIONS BIOS 2.14 / ROM 1987');
  },
};
const MEM: Command = {
  group: 'System',
  help: 'Displays the amount of used and free memory in your system.',
  async run(shell) {
    await shell.line();
    await shell.line('    655360 bytes total conventional memory');
    await shell.line('    655360 bytes available to AEGIS RCS/7');
    await shell.line('    393216 largest executable program size');
    await shell.line();
    await shell.line('   4194304 bytes total contiguous extended memory');
    await shell.line('         0 bytes available contiguous extended memory');
    await shell.line('   4194304 bytes reserved by LIMBIC.SYS / DO NOT RELEASE');
  },
};
const CLS: Command = {
  group: 'System',
  help: 'Clears the screen.',
  async run(shell) {
    await shell.io.clear();
  },
};
const clockCommand = (what: 'date' | 'time'): Command => ({
  group: 'System',
  help: what === 'date' ? 'Displays or sets the date.' : 'Displays or sets the system time.',
  usage: what === 'date' ? 'DATE [date]' : 'TIME [time]',
  async run(shell, line) {
    const ask = what === 'date' ? 'Enter new date (mm-dd-yy): ' : 'Enter new time: ';
    let value = line.raw.trim();
    if (!value) {
      const now = shell.io.now();
      if (what === 'date')
        await shell.line(
          `Current date is ${now.weekday} ${now.date.slice(0, 6)}19${now.date.slice(6)}`,
        );
      else {
        const [hours, minutes, seconds] = now.time.split(':').map(Number);
        await shell.line(
          `Current time is ${hours % 12 || 12}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.00${hours < 12 ? 'a' : 'p'}`,
        );
      }
      await shell.print(ask);
      value = (await shell.io.readLine()).trim();
    }
    // An empty answer keeps the clock; anything else must be a valid setting.
    while (value && !shell.io.setClock(what, value)) {
      await shell.line(what === 'date' ? 'Invalid date' : 'Invalid time');
      await shell.print(ask);
      value = (await shell.io.readLine()).trim();
    }
  },
});
const PAUSE: Command = {
  group: 'System',
  help: 'Suspends processing of a batch program and displays a message.',
  async run(shell) {
    await shell.print('Press any key to continue . . .');
    await shell.io.readKey();
    await shell.line();
  },
};
const REM: Command = {
  group: 'System',
  help: 'Records comments (remarks) in a batch file.',
  hidden: () => true,
  async run() {},
};
const HISTORY: Command = {
  group: 'System',
  help: 'Lists the commands typed this session.',
  async run(shell) {
    for (const entry of shell.history.slice(-12)) await shell.line(entry);
  },
};
const HELP: Command = {
  group: 'System',
  help: 'Lists the available commands.',
  async run(shell) {
    const seen = new Set<Command>();
    const groups = new Map<string, string[]>();
    for (const [name, command] of shell.commands) {
      if (seen.has(command) || command.hidden?.(shell)) continue;
      seen.add(command);
      groups.set(command.group, [...(groups.get(command.group) ?? []), name]);
    }
    await shell.line();
    for (const [group, names] of groups) {
      const words = [...names];
      let row = group.padEnd(10);
      while (words.length) {
        const word = words.shift()!;
        if (row.length + word.length > 78) {
          await shell.line(row.trimEnd());
          row = ' '.repeat(10);
        }
        row += word + '  ';
      }
      await shell.line(row.trimEnd());
    }
    await shell.line();
    await shell.line('Type a command followed by /? for details, for example DIR /?');
    for (const text of shell.helpFooter()) await shell.line(text);
  },
};
/** Registers the DOS commands that COMMAND.COM provides itself. */
export function registerBuiltins(shell: Shell) {
  shell.register(['DIR'], DIR);
  shell.register(['CD', 'CHDIR'], CD);
  shell.register(['MD', 'MKDIR'], MD);
  shell.register(['RD', 'RMDIR'], RD);
  shell.register(['TYPE'], TYPE);
  shell.register(['COPY'], COPY);
  shell.register(['DEL', 'ERASE'], DEL);
  shell.register(['REN', 'RENAME'], REN);
  shell.register(['ATTRIB'], ATTRIB);
  shell.register(['TREE'], TREE);
  shell.register(['FIND'], FIND);
  shell.register(['MORE'], MORE);
  shell.register(['CLS'], CLS);
  shell.register(['DATE'], clockCommand('date'));
  shell.register(['TIME'], clockCommand('time'));
  shell.register(['VER'], VER);
  shell.register(['VOL'], VOL);
  shell.register(['MEM'], MEM);
  shell.register(['SET'], SET);
  shell.register(['PATH'], PATH);
  shell.register(['PROMPT'], PROMPT);
  shell.register(['ECHO', 'ECHO.'], ECHO);
  shell.register(['PAUSE'], PAUSE);
  shell.register(['REM'], REM);
  shell.register(['HISTORY'], HISTORY);
  shell.register(['HELP'], HELP);
  for (const drive of ['A:', 'C:'])
    shell.register([drive], {
      group: 'System',
      help: 'Changes the current drive.',
      hidden: () => true,
      async run(inner) {
        if (drive === 'A:') await notReady(inner, 'A');
      },
    });
}
