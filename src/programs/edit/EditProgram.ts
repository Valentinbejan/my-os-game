import type { Screen } from '../../screen/Screen';
import { MenuBar, buttons, dialog, type Menu } from '../../screen/widgets';
import { TerminalInput } from '../../terminal/TerminalInput';
import type { FileKind } from '../../os/fs/FileSystem';
import type { KeyEvent, Program, ProgramSystem } from '../Program';
import { TextEditor } from './TextEditor';
const TOP = 2;
const ROWS = 21;
const WIDTH = 78;
const menus: Menu[] = [
  {
    title: 'File',
    hotkey: 'F',
    items: [
      { label: 'New', hotkey: 'N', action: 'new' },
      { label: 'Open...', hotkey: 'O', action: 'open' },
      { label: 'Save', hotkey: 'S', action: 'save' },
      { label: 'Save As...', hotkey: 'A', action: 'saveAs' },
      { label: '', action: '' },
      { label: 'Exit', hotkey: 'X', action: 'exit' },
    ],
  },
  {
    title: 'Edit',
    hotkey: 'E',
    items: [
      { label: 'Cut', hotkey: 'T', action: 'cut', shortcut: 'Shift+Del' },
      { label: 'Copy', hotkey: 'C', action: 'copy', shortcut: 'Ctrl+Ins' },
      { label: 'Paste', hotkey: 'P', action: 'paste', shortcut: 'Shift+Ins' },
      { label: 'Clear', hotkey: 'E', action: 'clear', shortcut: 'Del' },
    ],
  },
  {
    title: 'Search',
    hotkey: 'S',
    items: [
      { label: 'Find...', hotkey: 'F', action: 'find' },
      { label: 'Repeat Last Find', hotkey: 'R', action: 'again', shortcut: 'F3' },
    ],
  },
  {
    title: 'Help',
    hotkey: 'H',
    right: true,
    items: [
      { label: 'Keyboard', hotkey: 'K', action: 'keys' },
      { label: 'About...', hotkey: 'A', action: 'about' },
    ],
  },
];
const KEYS = [
  'Arrows, PgUp, PgDn    Move the cursor      Shift+Arrows  Select text',
  'Ctrl+Home, Ctrl+End   Start / end of file  Ctrl+Y        Delete line',
  'Ins                   Insert / overtype    Tab           Next tab stop',
  'Shift+Del  Cut        Ctrl+Ins  Copy       Shift+Ins     Paste',
  'F3  Repeat last find  Alt or F10  Menus    Esc           Close a menu',
];
type Dialog =
  | {
      kind: 'input';
      title: string;
      label: string;
      field: TerminalInput;
      purpose: 'open' | 'saveAs' | 'find';
      /** The field still holds the suggested text, shown selected. */
      fresh: boolean;
      files: string[];
      pick: number;
    }
  | {
      kind: 'message';
      title: string;
      lines: string[];
      choices: string[];
      focus: number;
      done: (choice: string) => void;
    };
/** EDIT: the DOS full-screen text editor, for notes, batch files and CONFIG.SYS. */
export class EditProgram implements Program {
  private editor: TextEditor;
  private path: string | null;
  private kind: FileKind = 'text';
  private top = 0;
  private left = 0;
  private menu = new MenuBar(menus);
  private dialog: Dialog | null = null;
  private clipboard = '';
  private lastFind = '';
  private changes = 0;
  constructor(
    private system: ProgramSystem,
    path: string | null,
  ) {
    this.editor = new TextEditor();
    this.path = null;
    this.menu.sound = (cue) => system.cue(cue);
    if (path) this.load(path, true);
  }
  frame() {
    return String(this.changes);
  }
  private get name() {
    return this.path ? this.path.slice(this.path.lastIndexOf('\\') + 1) : 'UNTITLED';
  }
  /** Loads a file; a missing one opens as a new, empty file of that name. */
  private load(path: string, fresh = false) {
    const result = this.system.read(path);
    if (result === 'denied') return this.message('Path/File access error');
    if (result === 'damaged') return this.message('Device I/O error. Try again.');
    this.editor = new TextEditor(result === 'missing' ? '' : result.entry.content);
    this.kind =
      result === 'missing' ? (/\.(BAT|SYS)$/.test(path) ? 'batch' : 'text') : result.entry.kind;
    this.path = path;
    this.top = this.left = 0;
    if (!fresh) this.system.disk();
  }
  private save(then?: () => void) {
    if (!this.path) return this.ask('saveAs', then);
    const result = this.system.write(this.path, this.editor.text(), this.kind);
    if (result !== 'ok') return this.message('Path/File access error');
    this.system.disk();
    this.system.cue('saved');
    this.editor.dirty = false;
    then?.();
  }
  private afterSaveAs?: () => void;
  private ask(purpose: 'open' | 'saveAs' | 'find', then?: () => void) {
    const field = new TerminalInput();
    if (purpose === 'find')
      field.insert(this.editor.selectedText().split('\n')[0] || this.lastFind);
    if (purpose === 'saveAs' && this.path) field.insert(this.name);
    if (purpose === 'open') field.insert('*.TXT');
    this.afterSaveAs = then;
    this.system.cue('dialog');
    this.dialog = {
      kind: 'input',
      title: purpose === 'open' ? 'Open' : purpose === 'saveAs' ? 'Save As' : 'Find',
      label: purpose === 'find' ? 'Find What:' : 'File Name:',
      field,
      purpose,
      files: purpose === 'open' ? this.system.list(this.system.cwd, '*.TXT') : [],
      pick: -1,
      fresh: field.value.length > 0,
    };
  }
  private message(
    text: string,
    choices = ['OK'],
    done: (choice: string) => void = () => undefined,
  ) {
    this.system.beep();
    this.dialog = { kind: 'message', title: '', lines: text.split('\n'), choices, focus: 0, done };
  }
  /** Asks to save unsaved work before `then` discards it. */
  private guard(then: () => void) {
    if (!this.editor.dirty) return then();
    this.message('Loaded file is not saved. Save it now?', ['Yes', 'No', 'Cancel'], (choice) => {
      if (choice === 'Yes') this.save(then);
      if (choice === 'No') then();
    });
  }
  private run(action: string) {
    const editor = this.editor;
    switch (action) {
      case 'new':
        return this.guard(() => {
          this.editor = new TextEditor();
          this.path = null;
          this.kind = 'text';
        });
      case 'open':
        return this.guard(() => this.ask('open'));
      case 'save':
        return this.save();
      case 'saveAs':
        return this.ask('saveAs');
      case 'exit':
        return this.guard(() => this.system.exit());
      case 'cut':
        if (editor.selection()) {
          this.clipboard = editor.selectedText();
          editor.deleteSelection();
        }
        return;
      case 'copy':
        if (editor.selection()) this.clipboard = editor.selectedText();
        return;
      case 'paste':
        return editor.type(this.clipboard);
      case 'clear':
        return editor.deleteSelection();
      case 'find':
        return this.ask('find');
      case 'again':
        if (!this.lastFind) return this.ask('find');
        if (!editor.find(this.lastFind)) this.message('Match not found');
        return;
      case 'keys':
        return this.message(KEYS.join('\n'));
      case 'about':
        return this.message(
          'AEGIS RCS/7 Editor\nVersion 1.00\n\nCopyright AEGIS Systems Division 1987-1991',
        );
    }
  }
  private submit(dialog: Extract<Dialog, { kind: 'input' }>) {
    const text = dialog.field.value.trim();
    if (!text) return;
    if (dialog.purpose === 'find') {
      this.dialog = null;
      this.lastFind = text;
      if (!this.editor.find(text)) this.message('Match not found');
      return;
    }
    if (dialog.purpose === 'open' && /[*?]/.test(text)) {
      dialog.files = this.system.list(this.system.cwd, text.toUpperCase());
      dialog.pick = -1;
      return;
    }
    const path = this.system.resolve(text);
    if (!path) return this.message('Bad file name');
    this.dialog = null;
    if (dialog.purpose === 'open') return this.load(path);
    const then = this.afterSaveAs;
    const store = () => {
      this.path = path;
      if (/\.(BAT|SYS)$/.test(path)) this.kind = 'batch';
      this.save(then);
    };
    if (path !== this.path && this.system.stat(path))
      this.message(
        `${path.slice(path.lastIndexOf('\\') + 1)} already exists. Overwrite?`,
        ['Yes', 'No'],
        (choice) => {
          if (choice === 'Yes') store();
        },
      );
    else store();
  }
  private dialogKey(event: KeyEvent) {
    const dialog = this.dialog!;
    if (event.key === 'Escape') {
      this.dialog = null;
      if (dialog.kind === 'message')
        dialog.done(dialog.choices.includes('Cancel') ? 'Cancel' : dialog.choices.at(-1)!);
      return;
    }
    if (dialog.kind === 'message') {
      if (event.key === 'ArrowLeft' || (event.key === 'Tab' && event.shift))
        dialog.focus = (dialog.focus + dialog.choices.length - 1) % dialog.choices.length;
      else if (event.key === 'ArrowRight' || event.key === 'Tab')
        dialog.focus = (dialog.focus + 1) % dialog.choices.length;
      else {
        const letter = dialog.choices.findIndex((c) => c[0] === event.key.toUpperCase());
        if (event.key === 'Enter' || letter >= 0) {
          this.dialog = null;
          dialog.done(dialog.choices[event.key === 'Enter' ? dialog.focus : letter]);
        }
      }
      return;
    }
    if (event.key === 'Enter') return this.submit(dialog);
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && dialog.files.length) {
      dialog.pick = Math.max(
        0,
        Math.min(dialog.files.length - 1, dialog.pick + (event.key === 'ArrowDown' ? 1 : -1)),
      );
      dialog.field.reset();
      dialog.field.insert(dialog.files[dialog.pick]);
      return;
    }
    // The suggested text starts selected: typing replaces it, editing keys keep it.
    if (['Backspace', 'Delete', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      if (dialog.fresh && ['Backspace', 'Delete'].includes(event.key)) dialog.field.reset();
      else dialog.field.key(event.key);
    } else if (event.key.length === 1 && !event.ctrl && !event.alt) {
      if (dialog.fresh) dialog.field.reset();
      dialog.field.insert(event.key, 64);
    } else return;
    dialog.fresh = false;
  }
  key(event: KeyEvent) {
    this.changes++;
    if (this.dialog) {
      this.dialogKey(event);
      return true;
    }
    if (this.menu.active) {
      const action = this.menu.key(event);
      if (action) this.run(action);
      return true;
    }
    if (event.key === 'Alt' || event.key === 'F10') {
      this.menu.activate();
      return true;
    }
    if (this.menu.shortcut(event)) return true;
    // Esc leaves, asking first if the file is not saved (as File, Exit does).
    if (event.key === 'Escape') return (this.run('exit'), true);
    const editor = this.editor;
    const { key, shift, ctrl } = event;
    if (key === 'F1') return (this.run('keys'), true);
    if (key === 'F3') return (this.run('again'), true);
    if (shift && key === 'Delete') return (this.run('cut'), true);
    if (ctrl && key === 'Insert') return (this.run('copy'), true);
    if (shift && key === 'Insert') return (this.run('paste'), true);
    if (key === 'Insert') editor.insert = !editor.insert;
    else if (ctrl && key.toLowerCase() === 'y') this.clipboard = editor.deleteLine();
    else if (ctrl && key === 'Home') editor.move('DocumentStart', shift);
    else if (ctrl && key === 'End') editor.move('DocumentEnd', shift);
    else if (ctrl && key === 'ArrowLeft') editor.move('WordLeft', shift);
    else if (ctrl && key === 'ArrowRight') editor.move('WordRight', shift);
    else if (/^(Arrow|Home$|End$|Page)/.test(key)) editor.move(key, shift, ROWS - 1);
    else if (key === 'Enter') editor.enter();
    else if (key === 'Backspace') editor.backspace();
    else if (key === 'Delete') editor.delete();
    else if (key === 'Tab') editor.tab();
    else if (key.length === 1 && !ctrl && !event.alt) editor.type(key);
    return true;
  }
  paste(text: string) {
    if (this.dialog?.kind === 'input') this.dialog.field.insert(text, 64);
    else if (!this.dialog && !this.menu.active) this.editor.type(text);
    this.changes++;
    return true;
  }
  render(screen: Screen) {
    const editor = this.editor;
    if (editor.row < this.top) this.top = editor.row;
    if (editor.row >= this.top + ROWS) this.top = editor.row - ROWS + 1;
    if (editor.col < this.left) this.left = editor.col;
    if (editor.col >= this.left + WIDTH) this.left = editor.col - WIDTH + 1;
    screen.clear();
    screen.box(0, 1, 80, 23, 'single');
    const title = ` ${this.name} `;
    screen.put(Math.floor((80 - title.length) / 2), 1, title, { inverse: true });
    const range = editor.selection();
    for (let row = 0; row < ROWS; row++) {
      const index = this.top + row;
      const text = editor.lines[index] ?? '';
      screen.put(1, TOP + row, text.slice(this.left, this.left + WIDTH));
      if (range && index >= range.start.row && index <= range.end.row) {
        const from = index === range.start.row ? range.start.col : 0;
        const to = index === range.end.row ? range.end.col : text.length + 1;
        for (let col = Math.max(from, this.left); col < Math.min(to, this.left + WIDTH); col++)
          screen.put(1 + col - this.left, TOP + row, text[col] ?? ' ', { inverse: true });
      }
    }
    // Vertical scroll bar: arrows at the ends, the thumb showing where the cursor is.
    screen.put(79, TOP, '↑');
    screen.fill(79, TOP + 1, 1, ROWS - 2, '░');
    screen.put(79, TOP + ROWS - 1, '↓');
    const thumb = Math.round((editor.row / Math.max(1, editor.lines.length - 1)) * (ROWS - 3));
    screen.put(79, TOP + 1 + thumb, '█');
    this.menu.render(screen, 0);
    const status = this.menu.active
      ? ' F1=Help  Enter=Execute  Esc=Cancel  Arrow=Next Item'
      : ' AEGIS Editor  <F1=Help>  <Esc=Exit>  Press ALT for menus';
    const position = `${String(editor.row + 1).padStart(5, '0')}:${String(editor.col + 1).padStart(3, '0')}`;
    screen.put(0, 24, status.padEnd(80 - position.length - 1) + position + ' ', { inverse: true });
    screen.cursor =
      this.menu.active || this.dialog
        ? null
        : {
            x: 1 + editor.col - this.left,
            y: TOP + editor.row - this.top,
            shape: editor.insert ? 'underline' : 'block',
          };
    if (this.dialog) this.renderDialog(screen);
  }
  private renderDialog(screen: Screen) {
    const box = this.dialog!;
    if (box.kind === 'message') {
      const width = Math.max(30, ...box.lines.map((l) => l.length + 6));
      const height = box.lines.length + 5;
      const x = Math.floor((80 - width) / 2),
        y = Math.floor((25 - height) / 2);
      dialog(screen, x, y, width, height, box.title);
      box.lines.forEach((line, n) =>
        screen.put(x + Math.floor((width - line.length) / 2), y + 2 + n, line),
      );
      buttons(screen, y + height - 2, box.choices, box.focus, x, width);
      return;
    }
    const width = 60,
      listRows = box.files.length ? 8 : 0;
    const height = 7 + listRows;
    const x = 10,
      y = Math.floor((25 - height) / 2);
    dialog(screen, x, y, width, height, box.title);
    screen.put(x + 2, y + 2, box.label);
    screen.box(x + 14, y + 1, width - 16, 3, 'single');
    const value = box.field.value;
    const shown = value.slice(Math.max(0, value.length - (width - 20)));
    screen.put(x + 15, y + 2, shown, { inverse: box.fresh });
    screen.cursor = {
      x: x + 15 + Math.min(box.field.cursor, shown.length),
      y: y + 2,
      shape: 'underline',
    };
    if (listRows) {
      screen.put(x + 2, y + 4, 'Files in ' + this.system.cwd);
      const first = Math.max(0, box.pick - listRows + 1);
      box.files
        .slice(first, first + listRows - 1)
        .forEach((name, n) =>
          screen.put(x + 4, y + 5 + n, ' ' + name.padEnd(14), { inverse: first + n === box.pick }),
        );
    }
    buttons(screen, y + height - 2, ['OK', 'Cancel'], -1, x, width);
  }
}
