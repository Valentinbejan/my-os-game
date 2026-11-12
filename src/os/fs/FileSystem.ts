import { baseName, isRoot, join, parent } from './paths';
export type FileKind = 'dir' | 'text' | 'wp' | 'sheet' | 'bin' | 'exe' | 'batch';
export interface FileEntry {
  kind: FileKind;
  /** Stored bytes as text; empty for directories and for binaries only known by size. */
  content: string;
  /** Declared size for binaries whose bytes are not stored (programs, memory images). */
  size?: number;
  /** DOS date and time, MM-DD-YY and HH:MM (24-hour). */
  date: string;
  time: string;
  /** Any of R (read-only), H (hidden), S (system), A (archive). */
  attrs: string;
  /** Storage C bad sector: the first read of the session fails. */
  damaged?: boolean;
  /** Readable only after a supervisor login. */
  restricted?: boolean;
}
export interface DeletedEntry {
  path: string;
  entry: FileEntry;
}
export type Changes = Record<string, FileEntry | null>;
/** Capacity of drive C, as reported by DIR and CHKDSK. */
export const DISK_BYTES = 42_366_976;
/**
 * The machine's hard disk: an authored image plus the player's changes on top. Only the
 * changes are saved; `null` marks a base-image entry the player removed.
 */
export class FileSystem {
  constructor(
    private base: Readonly<Record<string, FileEntry>>,
    public changes: Changes = {},
    public deleted: DeletedEntry[] = [],
  ) {}
  get(path: string): FileEntry | undefined {
    if (isRoot(path)) return path === 'C:\\' ? root : undefined;
    const changed = this.changes[path];
    if (changed === null) return undefined;
    return changed ?? this.base[path];
  }
  isDirectory(path: string) {
    return this.get(path)?.kind === 'dir';
  }
  /** Entries of a directory in the order they were created, as DOS lists them. */
  list(directory: string): Array<[string, FileEntry]> {
    const names = new Set<string>();
    for (const path of [...Object.keys(this.base), ...Object.keys(this.changes)])
      if (!isRoot(path) && parent(path) === directory) names.add(path);
    return [...names]
      .map((path) => [path, this.get(path)] as const)
      .filter((pair): pair is readonly [string, FileEntry] => pair[1] !== undefined)
      .map(([path, entry]) => [baseName(path), entry]);
  }
  size(entry: FileEntry) {
    return entry.kind === 'dir' ? 0 : (entry.size ?? entry.content.length);
  }
  write(path: string, entry: FileEntry) {
    this.changes[path] = entry;
  }
  /** Removes a file, keeping it recoverable by UNDELETE until the disk needs the space. */
  remove(path: string) {
    const entry = this.get(path);
    if (!entry) return;
    if (entry.kind !== 'dir') {
      this.deleted = [...this.deleted.filter((d) => d.path !== path), { path, entry }].slice(-50);
    }
    if (this.base[path]) this.changes[path] = null;
    else delete this.changes[path];
  }
  /** Moves an entry and, for a directory, everything inside it. */
  move(from: string, to: string) {
    const entry = this.get(from);
    if (!entry) return;
    if (entry.kind === 'dir')
      for (const [name] of this.list(from)) this.move(join(from, name), join(to, name));
    this.write(to, entry);
    if (this.base[from]) this.changes[from] = null;
    else delete this.changes[from];
  }
  used() {
    let total = 0;
    for (const path of new Set([...Object.keys(this.base), ...Object.keys(this.changes)])) {
      const entry = this.get(path);
      // Allocation happens in 2 KB clusters, as on a 40 MB FAT16 disk.
      if (entry) total += Math.ceil(this.size(entry) / 2048) * 2048;
    }
    return total;
  }
  free() {
    return Math.max(0, DISK_BYTES - this.used());
  }
}
const root: FileEntry = { kind: 'dir', content: '', date: '10-12-91', time: '09:02', attrs: '' };
