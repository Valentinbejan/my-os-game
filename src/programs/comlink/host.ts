import type { FileKind } from '../../os/fs/FileSystem';
/** A file a remote system offers for Zmodem download. */
export interface OfferedFile {
  name: string;
  content: string;
  kind: FileKind;
}
/** The caller's end of a connection, as a remote system sees it. */
export interface HostLink {
  /** Sends characters to the caller's screen, at line speed. */
  send(text: string): void;
  /** Drops carrier; the caller sees NO CARRIER. */
  hangup(): void;
  /** Starts a Zmodem send; COMLINK begins receiving on its own. */
  offer(file: OfferedFile): void;
  /** Waits for the caller to send a file (PgUp); `receive` gets it when the transfer ends. */
  expectUpload(receive: (name: string, content: string) => void): void;
}
/** What happens when a number is dialed: a remote system answers, or the call fails. */
export type DialResult = Host | 'BUSY' | 'NO ANSWER' | 'NO CARRIER' | 'VOICE';
/** A remote system reached by dialing: scripted, deterministic, never the language model. */
export interface Host {
  connect(link: HostLink): void;
  /** A character typed by the caller: printable, '\r' for Enter or '\b' for Backspace. */
  key(char: string): void;
}
/**
 * A host that reads whole lines: it echoes what the caller types (or nothing, for a
 * password), handles Backspace, and acts on Enter.
 */
export abstract class LineHost implements Host {
  protected link!: HostLink;
  private buffer = '';
  private secret = false;
  connect(link: HostLink) {
    this.link = link;
    this.start();
  }
  key(char: string) {
    if (char === '\r') {
      const text = this.buffer;
      this.buffer = '';
      this.secret = false;
      this.link.send('\r\n');
      this.line(text.trim());
    } else if (char === '\b') {
      if (!this.buffer) return;
      this.buffer = this.buffer.slice(0, -1);
      if (!this.secret) this.link.send('\b \b');
    } else if (char >= ' ' && this.buffer.length < 76) {
      this.buffer += char;
      if (!this.secret) this.link.send(char);
    }
  }
  protected abstract start(): void;
  protected abstract line(text: string): void;
  /** Sends lines, each ending in CR LF. */
  protected print(...lines: string[]) {
    this.link.send(lines.map((line) => line + '\r\n').join(''));
  }
  /** Sends a prompt and waits for the next line; a secret prompt does not echo. */
  protected ask(prompt: string, secret = false) {
    this.secret = secret;
    this.link.send(prompt);
  }
}
