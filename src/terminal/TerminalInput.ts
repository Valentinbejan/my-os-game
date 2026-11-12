import { terminalSafe } from './wrapText';
export class TerminalInput {
  value = '';
  cursor = 0;
  history: string[] = [];
  private index = 0;
  private draft = '';
  insert(text: string, limit = 512) {
    const clean = terminalSafe(text)
      .replace(/\n+/g, ' ')
      .slice(0, Math.max(0, limit - this.value.length));
    this.value = this.value.slice(0, this.cursor) + clean + this.value.slice(this.cursor);
    this.cursor += clean.length;
  }
  key(key: string) {
    if (key === 'Backspace' && this.cursor > 0) {
      this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
      this.cursor--;
    }
    if (key === 'Delete')
      this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
    if (key === 'Home') this.cursor = 0;
    if (key === 'End') this.cursor = this.value.length;
    if (key === 'ArrowLeft') this.cursor = Math.max(0, this.cursor - 1);
    if (key === 'ArrowRight') this.cursor = Math.min(this.value.length, this.cursor + 1);
    if (key === 'ArrowUp' && this.index > 0) {
      if (this.index === this.history.length) this.draft = this.value;
      this.value = this.history[--this.index];
      this.cursor = this.value.length;
    }
    if (key === 'ArrowDown' && this.index < this.history.length) {
      this.value = ++this.index === this.history.length ? this.draft : this.history[this.index];
      this.cursor = this.value.length;
    }
  }
  submit() {
    const value = this.value.trim();
    if (value && value !== this.history.at(-1)) this.history.push(value);
    if (this.history.length > 100) this.history.shift();
    this.reset();
    return value;
  }
  reset() {
    this.value = '';
    this.cursor = 0;
    this.index = this.history.length;
    this.draft = '';
  }
}
