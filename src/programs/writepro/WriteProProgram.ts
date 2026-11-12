import type { Screen } from '../../screen/Screen';
import { MenuBar, type Menu } from '../../screen/widgets';
import { TerminalInput } from '../../terminal/TerminalInput';
import type { KeyEvent, Program, ProgramSystem } from '../Program';
import {
  BOLD,
  BOLD_END,
  PAGE,
  UNDERLINE,
  UNDERLINE_END,
  WpDocument,
  codeName,
  type Token,
} from './Document';
type Prompt =
  | { kind: 'yes'; question: string; yes: boolean; then: (yes: boolean) => void }
  | {
      kind: 'input';
      question: string;
      field: TerminalInput;
      fresh: boolean;
      then: (value: string) => void;
    };
interface Listing {
  directory: string;
  entries: Array<{ name: string; size: number; date: string; time: string; dir: boolean }>;
  pick: number;
}
const menus: Menu[] = [
  {
    title: 'File',
    hotkey: 'F',
    items: [
      { label: 'Retrieve', hotkey: 'R', action: 'retrieve', shortcut: 'Shft-F10' },
      { label: 'Save', hotkey: 'S', action: 'save', shortcut: 'F10' },
      { label: 'List Files', hotkey: 'F', action: 'list', shortcut: 'F5' },
      { label: 'Print', hotkey: 'P', action: 'print', shortcut: 'Shft-F7' },
      { label: '', action: '' },
      { label: 'Exit', hotkey: 'X', action: 'exit', shortcut: 'F7' },
    ],
  },
  {
    title: 'Edit',
    hotkey: 'E',
    items: [
      { label: 'Block', hotkey: 'B', action: 'block', shortcut: 'F12' },
      { label: 'Reveal Codes', hotkey: 'R', action: 'reveal', shortcut: 'F11' },
    ],
  },
  {
    title: 'Search',
    hotkey: 'S',
    items: [
      { label: 'Forward', hotkey: 'F', action: 'search', shortcut: 'F2' },
      { label: 'Backward', hotkey: 'B', action: 'searchBack', shortcut: 'Shft-F2' },
    ],
  },
  {
    title: 'Font',
    hotkey: 'O',
    items: [
      { label: 'Bold', hotkey: 'B', action: 'bold', shortcut: 'F6' },
      { label: 'Underline', hotkey: 'U', action: 'underline', shortcut: 'F8' },
    ],
  },
  {
    title: 'Help',
    hotkey: 'H',
    right: true,
    items: [{ label: 'Template', hotkey: 'T', action: 'help', shortcut: 'F3' }],
  },
];
/** The printed function-key card that sat above the keyboard, as a help screen. */
export const TEMPLATE = [
  'F1   Cancel               F2  Search ->        Shift+F2   <- Search',
  'F3   Help (this card)     F5  List Files       F6         Bold',
  'F7, Esc  Exit             F8  Underline        F10        Save',
  'F11  Reveal Codes         F12 Block            Shift+F10  Retrieve',
  'Alt+=  Pull-down menus    Ins Typeover         Shift+F7   Print',
  'Ctrl+End  Delete to end of line                PgUp/PgDn  Page up / down',
  'Home,Left  Line start     Home,Right  Line end',
  'Home,Home,Up  Top of document                  Home,Home,Down  Bottom',
];
const inches = (value: number, decimals: number) =>
  (Number.isInteger(value) ? String(value) : value.toFixed(decimals)) + '"';
/** WRITEPRO 5.1: the word processor, with WordPerfect-style codes, keys and screens. */
export class WriteProProgram implements Program {
  private doc = new WpDocument();
  private path: string | null = null;
  private top = 0;
  private reveal = false;
  private typeover = false;
  private block: number | null = null;
  private homes = 0;
  private prompt: Prompt | null = null;
  private note = '';
  private mode: 'edit' | 'list' | 'look' | 'help' = 'edit';
  private listing: Listing | null = null;
  private looking: { path: string; lines: string[]; top: number } | null = null;
  private menu = new MenuBar(menus);
  private lastSearch = '';
  private changes = 0;
  constructor(
    private system: ProgramSystem,
    path: string | null,
  ) {
    this.menu.sound = (cue) => system.cue(cue);
    if (path) this.retrieve(path, true);
  }
  frame() {
    // A line the other one types into the open document by herself, at its end.
    const whisper = this.system.whisper?.();
    if (whisper) {
      const at = this.doc.cursor;
      this.doc.cursor = this.doc.text.length;
      this.doc.insert(
        (this.doc.text && !this.doc.text.endsWith('\n') ? '\n' : '') + whisper + '\n',
      );
      this.doc.cursor = at;
      this.changes++;
    }
    return String(this.changes);
  }
  private say(text: string) {
    // Errors (and the printer that will not answer) sound as they show.
    if (/^(ERROR|Print):/.test(text)) this.system.cue('denied');
    this.note = text;
  }
  private yes(question: string, yes: boolean, then: (yes: boolean) => void) {
    this.prompt = { kind: 'yes', question, yes, then };
  }
  private input(question: string, value: string, then: (value: string) => void) {
    const field = new TerminalInput();
    field.insert(value, 70);
    this.prompt = { kind: 'input', question, field, fresh: !!value, then };
  }
  private retrieve(path: string, fresh = false) {
    const result = this.system.read(path);
    if (result === 'missing') return this.say('ERROR: File not found -- ' + path);
    if (result === 'denied') return this.say('ERROR: Access denied -- ' + path);
    if (result === 'damaged') return this.say('ERROR: Disk read error -- try again');
    if (!fresh) this.system.disk();
    if (this.doc.text && !fresh) {
      this.doc.insert(result.entry.content);
      return;
    }
    this.doc = new WpDocument(result.entry.content);
    this.path = path;
    this.top = 0;
  }
  private saveAs(then?: () => void) {
    this.input('Document to be saved: ', this.path ?? '', (value) => {
      const path = this.system.resolve(value);
      if (!path) return this.say('ERROR: Invalid file name');
      const write = () => {
        const result = this.system.write(path, this.doc.text, 'wp');
        if (result !== 'ok')
          return this.say(
            'ERROR: ' + (result === 'denied' ? 'Access denied' : 'Invalid file name'),
          );
        this.system.disk();
        this.system.cue('saved');
        this.path = path;
        this.doc.dirty = false;
        then?.();
      };
      if (path !== this.path && this.system.stat(path))
        this.yes(`Replace ${path}? `, false, (yes) => (yes ? write() : undefined));
      else write();
    });
  }
  private exit() {
    this.yes(
      `Save document? ${this.doc.dirty ? '' : '(Text was not modified) '}`,
      this.doc.dirty,
      (save) => {
        const leave = () =>
          this.yes('Exit WRITEPRO? ', false, (yes) => {
            if (yes) this.system.exit();
            else {
              this.doc = new WpDocument();
              this.path = null;
              this.top = 0;
            }
          });
        if (save) this.saveAs(leave);
        else leave();
      },
    );
  }
  private openList(directory: string) {
    const pattern = directory.includes('*') ? directory : directory.replace(/\\?$/, '\\*.*');
    const folder = pattern.slice(0, pattern.lastIndexOf('\\')) || 'C:';
    const spec = pattern.slice(pattern.lastIndexOf('\\') + 1);
    const dir = folder.length === 2 ? folder + '\\' : folder;
    const base = dir.replace(/\\$/, '');
    const entry = (name: string, isDir: boolean) => {
      const stat = this.system.stat(base + '\\' + name);
      return {
        name,
        size: stat?.size ?? 0,
        date: stat?.date ?? '',
        time: stat?.time ?? '',
        dir: isDir,
      };
    };
    // As in WordPerfect's list, the current and parent directories come first, then folders.
    const entries = [
      { name: '.', size: 0, date: '', time: '', dir: true },
      ...(dir.length > 3 ? [{ name: '..', size: 0, date: '', time: '', dir: true }] : []),
      ...this.system.folders(dir).map((name) => entry(name, true)),
      ...this.system.list(dir, spec).map((name) => entry(name, false)),
    ];
    this.listing = { directory: base + '\\' + spec, entries, pick: 0 };
    this.mode = 'list';
    this.system.disk();
  }
  private run(action: string) {
    const doc = this.doc;
    switch (action) {
      case 'retrieve':
        return this.input('Document to be retrieved: ', '', (value) => {
          const path = this.system.resolve(value);
          if (!path) return this.say('ERROR: Invalid file name');
          if (this.doc.text)
            this.yes(
              'Retrieve into current document? ',
              false,
              (yes) => yes && this.retrieve(path),
            );
          else this.retrieve(path);
        });
      case 'save':
        return this.saveAs();
      case 'list':
        return this.input('Dir ', this.system.cwd.replace(/\\?$/, '\\*.*'), (value) =>
          this.openList(value.toUpperCase()),
        );
      case 'print':
        return this.say('Print: LPT1 not responding -- printer is off line');
      case 'exit':
        return this.exit();
      case 'block':
        this.block = this.block === null ? doc.cursor : null;
        return;
      case 'reveal':
        this.reveal = !this.reveal;
        return;
      case 'search':
      case 'searchBack':
        return this.input(
          action === 'search' ? '-> Srch: ' : '<- Srch: ',
          this.lastSearch,
          (value) => {
            this.lastSearch = value;
            if (!doc.find(value, action === 'searchBack')) this.say('* Not found *');
          },
        );
      case 'bold':
      case 'underline': {
        const [open, close] = action === 'bold' ? [BOLD, BOLD_END] : [UNDERLINE, UNDERLINE_END];
        doc.toggle(open, close, this.block === null ? undefined : [this.block, doc.cursor]);
        this.block = null;
        return;
      }
      case 'help':
        this.mode = 'help';
        return;
    }
  }
  /** Deleting a code asks first, as WordPerfect did when codes were hidden. */
  private erase(forward: boolean) {
    const doc = this.doc;
    if (this.block !== null) {
      const [from, to] = [this.block, doc.cursor];
      return this.yes('Delete Block? ', false, (yes) => {
        if (yes) doc.removeRange(from, to);
        this.block = null;
      });
    }
    const token: Token | null = forward ? doc.token(doc.cursor) : doc.before(doc.cursor);
    if (!token) return;
    const quiet =
      token.kind === 'char' ||
      (token.kind === 'code' && (token.code === '\n' || token.code === '\t'));
    if (quiet || this.reveal) return void doc.remove(forward);
    this.yes(`Delete ${token.kind === 'note' ? '[Comment]' : codeName(token)}? `, false, (yes) => {
      if (yes) doc.remove(forward);
    });
  }
  private promptKey(event: KeyEvent) {
    const prompt = this.prompt!;
    if (event.key === 'F1' || event.key === 'Escape') {
      this.prompt = null;
      return;
    }
    if (prompt.kind === 'yes') {
      const letter = event.key.toUpperCase();
      if (letter === 'Y' || letter === 'N' || event.key === 'Enter') {
        this.prompt = null;
        prompt.then(event.key === 'Enter' ? prompt.yes : letter === 'Y');
      }
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      this.prompt = null;
      if (prompt.field.value.trim()) prompt.then(prompt.field.value.trim());
      return;
    }
    if (['Backspace', 'Delete', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      if (prompt.fresh && ['Backspace', 'Delete'].includes(event.key)) prompt.field.reset();
      else prompt.field.key(event.key);
    } else if (event.key.length === 1 && !event.ctrl && !event.alt) {
      if (prompt.fresh) prompt.field.reset();
      prompt.field.insert(event.key, 70);
    } else return;
    prompt.fresh = false;
  }
  private listKey(event: KeyEvent) {
    const listing = this.listing!;
    const count = listing.entries.length;
    const chosen = listing.entries[listing.pick];
    const folder = listing.directory.slice(0, listing.directory.lastIndexOf('\\'));
    const full = chosen ? folder + '\\' + chosen.name : '';
    if (['F7', 'F1', 'Escape'].includes(event.key)) {
      this.mode = 'edit';
      return;
    }
    if (event.key === 'ArrowDown' && listing.pick < count - 1) listing.pick++;
    else if (event.key === 'ArrowUp' && listing.pick > 0) listing.pick--;
    else if (event.key === 'ArrowRight' && listing.pick + 15 < count) listing.pick += 15;
    else if (event.key === 'ArrowLeft' && listing.pick >= 15) listing.pick -= 15;
    else if ((event.key === '6' || event.key === 'Enter') && chosen?.dir) {
      // Looking at a directory lists it: '.' stays, '..' climbs to the parent.
      const spec = listing.directory.slice(listing.directory.lastIndexOf('\\') + 1);
      const target =
        chosen.name === '.'
          ? folder
          : chosen.name === '..'
            ? folder.slice(0, folder.lastIndexOf('\\'))
            : full;
      this.openList((target.length === 2 ? target + '\\' : target + '\\') + spec);
    } else if ((event.key === '6' || event.key === 'Enter') && chosen) {
      const result = this.system.read(full);
      if (typeof result !== 'object')
        return this.say(
          result === 'damaged' ? 'ERROR: Disk read error -- try again' : 'ERROR: Access denied',
        );
      this.looking = {
        path: full,
        lines: new WpDocument(result.entry.content).plain().split('\n'),
        top: 0,
      };
      this.mode = 'look';
    } else if (event.key === '1' && chosen && !chosen.dir) {
      this.mode = 'edit';
      if (this.doc.text)
        this.yes('Retrieve into current document? ', false, (yes) => yes && this.retrieve(full));
      else this.retrieve(full);
    } else if (event.key === '7')
      this.input('New directory = ', folder + '\\*.*', (value) =>
        this.openList(value.toUpperCase()),
      );
  }
  key(event: KeyEvent) {
    this.changes++;
    this.note = '';
    if (this.prompt) {
      this.promptKey(event);
      return true;
    }
    if (this.mode === 'help') {
      this.mode = 'edit';
      return true;
    }
    if (this.mode === 'list') {
      this.listKey(event);
      return true;
    }
    if (this.mode === 'look') {
      const look = this.looking!;
      if (event.key === 'ArrowDown' || event.key === 'PageDown')
        look.top = Math.min(
          Math.max(0, look.lines.length - 20),
          look.top + (event.key === 'PageDown' ? 20 : 1),
        );
      else if (event.key === 'ArrowUp' || event.key === 'PageUp')
        look.top = Math.max(0, look.top - (event.key === 'PageUp' ? 20 : 1));
      else this.mode = 'list';
      return true;
    }
    if (this.menu.active) {
      const action = this.menu.key(event);
      if (action) this.run(action);
      return true;
    }
    if (event.alt && event.key === '=') {
      this.menu.activate();
      return true;
    }
    if (this.menu.shortcut(event)) return true;
    const doc = this.doc;
    const { key, shift, ctrl, alt } = event;
    const bindings: Record<string, string> = {
      F2: shift ? 'searchBack' : 'search',
      F3: alt ? 'reveal' : 'help',
      F5: 'list',
      F6: 'bold',
      F7: shift ? 'print' : 'exit',
      F8: 'underline',
      F10: shift ? 'retrieve' : 'save',
      F11: 'reveal',
      F12: 'block',
    };
    if (bindings[key]) {
      this.homes = 0;
      this.run(bindings[key]);
      return true;
    }
    // Esc drops a marked block; otherwise it leaves, asking first, as F7 does.
    if (key === 'Escape' && this.block === null) {
      this.homes = 0;
      this.run('exit');
      return true;
    }
    if (key === 'F1' || key === 'Escape') {
      this.block = null;
      this.homes = 0;
      return true;
    }
    const lines = doc.layout();
    const here = doc.locate();
    const vertical = (row: number) => {
      doc.cursor = doc.indexAt(Math.max(0, Math.min(lines.length - 1, row)), here.col);
    };
    if (key === 'Home') {
      this.homes = Math.min(2, this.homes + 1);
      return true;
    }
    const homes = this.homes;
    this.homes = 0;
    if (homes && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      if (homes === 2 && key === 'ArrowUp') doc.cursor = 0;
      else if (homes === 2 && key === 'ArrowDown') doc.cursor = doc.text.length;
      else if (key === 'ArrowLeft') doc.cursor = lines[here.row].start;
      else if (key === 'ArrowRight') doc.cursor = doc.indexAt(here.row, 999);
      else vertical(here.row + (key === 'ArrowUp' ? -22 : 22));
      return true;
    }
    if (ctrl && key === 'Home') doc.cursor = 0;
    else if (ctrl && key === 'End') {
      const end = doc.indexAt(here.row, 999);
      doc.removeRange(doc.cursor, Math.max(doc.cursor, end));
    } else if (key === 'ArrowLeft') doc.left(this.reveal);
    else if (key === 'ArrowRight') doc.right(this.reveal);
    else if (key === 'ArrowUp') vertical(here.row - 1);
    else if (key === 'ArrowDown') vertical(here.row + 1);
    else if (key === 'End') doc.cursor = doc.indexAt(here.row, 999);
    else if (key === 'PageUp') vertical((Math.ceil(here.row / PAGE) - 1) * PAGE);
    else if (key === 'PageDown') vertical((Math.floor(here.row / PAGE) + 1) * PAGE);
    else if (key === 'Insert') this.typeover = !this.typeover;
    else if (key === 'Backspace') this.erase(false);
    else if (key === 'Delete') this.erase(true);
    else if (key === 'Enter') doc.insert('\n');
    else if (key === 'Tab') doc.insert('\t');
    else if (key.length === 1 && !ctrl && !alt) {
      if (this.typeover && doc.token(doc.cursor)?.kind === 'char' && doc.text[doc.cursor] !== '\n')
        doc.remove(true);
      doc.insert(key);
    }
    return true;
  }
  paste(text: string) {
    if (this.prompt?.kind === 'input') this.prompt.field.insert(text, 70);
    else if (this.mode === 'edit' && !this.menu.active)
      this.doc.insert(text.replace(/\r\n?/g, '\n'));
    this.changes++;
    return true;
  }
  render(screen: Screen) {
    screen.clear();
    screen.cursor = null;
    if (this.mode === 'help') return this.renderHelp(screen);
    if (this.mode === 'list') return this.renderList(screen);
    if (this.mode === 'look') return this.renderLook(screen);
    const rows = this.reveal ? 11 : 24;
    this.renderText(screen, 0, rows);
    this.renderStatus(screen, rows);
    if (this.reveal) this.renderCodes(screen, rows + 1);
    // Like WordPerfect 5.1, the menu bar only appears when called up with Alt+=.
    if (this.menu.active) this.menu.render(screen, 0);
  }
  /** Document rows with page-break lines, the cursor kept in view. */
  private renderText(screen: Screen, y: number, rows: number) {
    const doc = this.doc;
    const lines = doc.layout();
    const view: Array<number | 'break'> = [];
    lines.forEach((_, n) => {
      if (n && n % PAGE === 0) view.push('break');
      view.push(n);
    });
    const here = doc.locate();
    const at = view.indexOf(here.row);
    if (at < this.top) this.top = at;
    if (at >= this.top + rows) this.top = at - rows + 1;
    const [blockFrom, blockTo] =
      this.block === null
        ? [-1, -1]
        : [Math.min(this.block, doc.cursor), Math.max(this.block, doc.cursor)];
    for (let r = 0; r < rows; r++) {
      const item = view[this.top + r];
      if (item === undefined) break;
      if (item === 'break') {
        screen.put(0, y + r, '─'.repeat(80));
        continue;
      }
      for (const glyph of lines[item].glyphs)
        screen.put(glyph.col, y + r, glyph.char, {
          intensity: glyph.bold ? 2 : 1,
          underline: glyph.underline,
          inverse: glyph.index >= blockFrom && glyph.index < blockTo,
        });
    }
    if (!this.prompt && !this.menu.active)
      screen.cursor = {
        x: Math.min(79, here.col),
        y: y + at - this.top,
        shape: this.typeover ? 'block' : 'underline',
      };
  }
  private renderStatus(screen: Screen, y: number) {
    const doc = this.doc;
    const here = doc.locate();
    if (this.prompt) {
      const prompt = this.prompt;
      if (prompt.kind === 'yes') {
        const text = prompt.question + (prompt.yes ? 'Yes (No)' : 'No (Yes)');
        screen.put(0, y, text);
        screen.cursor = { x: text.length, y, shape: 'underline' };
      } else {
        const value = prompt.field.value;
        screen.put(0, y, prompt.question);
        screen.put(prompt.question.length, y, value, { inverse: prompt.fresh });
        screen.cursor = { x: prompt.question.length + prompt.field.cursor, y, shape: 'underline' };
      }
      return;
    }
    const left =
      this.note ||
      (this.block !== null ? 'Block on' : this.typeover ? 'Typeover' : (this.path ?? ''));
    screen.put(0, y, left.slice(0, 42), { blink: this.block !== null && !this.note });
    const style = doc.style();
    // How to get out, and to the key card, while nothing else wants the line.
    const hint = 'Esc or F7 Exit  F3 Help';
    const at = left ? Math.min(left.length, 42) + 3 : 0;
    if (!this.note && this.block === null && at + hint.length < 52) screen.put(at, y, hint);
    const page = Math.floor(here.row / PAGE);
    const line = 1 + (here.row % PAGE) / 6;
    const right = `Doc 1 Pg ${page + 1} Ln ${inches(line, 2)} `;
    const position = `Pos ${inches(1 + here.col / 10, 1)}`;
    const x = 80 - right.length - position.length;
    screen.put(x, y, right);
    screen.put(x + right.length, y, 'Pos', {
      intensity: style.bold ? 2 : 1,
      underline: style.underline,
    });
    screen.put(x + right.length + 3, y, position.slice(3));
  }
  /** Reveal Codes: the text with its codes, a tab ruler above it. */
  private renderCodes(screen: Screen, y: number) {
    const doc = this.doc;
    const ruler = Array.from({ length: 80 }, (_, col) =>
      col === 0 ? '[' : col === 65 ? ']' : col % 5 === 0 && col < 65 ? '▲' : ' ',
    ).join('');
    screen.put(0, y, ruler, { inverse: true });
    const pieces: Array<{ text: string; index: number; code: boolean }> = [];
    const breaks: number[] = [];
    for (const line of doc.layout()) {
      for (let index = line.start; index < line.end;) {
        const token = doc.token(index);
        if (!token) break;
        const code = token.kind !== 'char';
        pieces.push({ text: code ? codeName(token) : token.char, index, code });
        index = token.end;
      }
      if (line.hard) breaks.push(pieces.length);
      else if (line.end < doc.text.length) {
        pieces.push({ text: '[SRt]', index: -1, code: true });
        breaks.push(pieces.length);
      }
    }
    pieces.push({ text: ' ', index: doc.text.length, code: false });
    const rows: Array<Array<{ text: string; index: number; code: boolean; x: number }>> = [[]];
    let x = 0;
    pieces.forEach((piece, n) => {
      if (breaks.includes(n) || x + piece.text.length > 80) {
        rows.push([]);
        x = 0;
      }
      rows[rows.length - 1].push({ ...piece, x });
      x += piece.text.length;
    });
    const cursorRow = rows.findIndex((row) => row.some((p) => p.index === doc.cursor));
    const height = 24 - y - 1;
    const first = Math.max(0, Math.min(cursorRow - Math.floor(height / 2), rows.length - height));
    rows.slice(first, first + height).forEach((row, r) =>
      row.forEach((piece) =>
        screen.put(piece.x, y + 1 + r, piece.text, {
          inverse: piece.index === doc.cursor,
          intensity: piece.code ? 2 : 1,
        }),
      ),
    );
  }
  private renderHelp(screen: Screen) {
    screen.box(0, 2, 80, TEMPLATE.length + 6, 'double');
    screen.put(24, 2, ' WRITEPRO 5.1  KEYBOARD TEMPLATE ');
    TEMPLATE.forEach((line, n) => screen.put(3, 4 + n, line));
    screen.put(
      3,
      5 + TEMPLATE.length,
      'Codes are hidden in the text: use Reveal Codes (F11) to see them.',
    );
    screen.put(0, 24, 'Press any key to return to the document.');
  }
  private renderList(screen: Screen) {
    const listing = this.listing!;
    const now = this.system.now();
    screen.put(1, 0, `${now.date} ${now.time.slice(0, 5)}`);
    screen.put(30, 0, 'Directory ' + listing.directory);
    const used = listing.entries.reduce((sum, e) => sum + e.size, 0);
    screen.put(
      1,
      1,
      `Document size: ${String(this.doc.text.length).padStart(8)}   Used: ${String(used).padStart(10)}   Files: ${String(listing.entries.length).padStart(4)}`,
    );
    screen.put(0, 2, '─'.repeat(80));
    listing.entries.forEach((entry, n) => {
      const column = Math.floor(n / 15),
        row = n % 15;
      if (column > 1) return;
      const [base, ext] =
        entry.name.includes('.') && !entry.name.startsWith('.')
          ? entry.name.split('.')
          : [entry.name, ''];
      const special = { '.': ' .    Current', '..': ' ..   Parent' }[entry.name];
      const text = special
        ? `${special.padEnd(22)}<Dir>`.padEnd(38)
        : ` ${base.padEnd(8)}${entry.dir || !ext ? ' ' : '.'}${ext.padEnd(3)} ${(entry.dir ? '<Dir>' : String(entry.size)).padStart(8)} ${entry.date} ${entry.time} `;
      screen.put(column * 40, 3 + row, text, { inverse: n === listing.pick });
    });
    screen.fill(39, 3, 1, 15, '│');
    screen.put(0, 18, '─'.repeat(80));
    screen.put(0, 23, '1 Retrieve; 6 Look (Enter); 7 Other Directory; Arrows Move;');
    screen.put(0, 24, 'F7 or Esc Return to the document: 6');
    screen.cursor = { x: 35, y: 24, shape: 'underline' };
    this.renderNote(screen);
  }
  private renderLook(screen: Screen) {
    const look = this.looking!;
    screen.put(0, 0, `File: ${look.path}`.padEnd(60) + 'WRITEPRO 5.1', { inverse: true });
    look.lines
      .slice(look.top, look.top + 22)
      .forEach((line, n) => screen.put(0, 2 + n, line.slice(0, 80)));
    screen.put(0, 24, 'Look: Arrows/PgDn scroll; any other key returns to the list');
  }
  private renderNote(screen: Screen) {
    if (this.note) screen.put(0, 22, this.note);
    if (this.prompt) {
      screen.fill(0, 24, 80, 1);
      this.renderStatus(screen, 24);
    }
  }
}
