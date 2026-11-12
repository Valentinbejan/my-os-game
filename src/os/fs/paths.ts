/** DOS path handling: drive-letter paths, 8.3 names and * / ? wildcards. */
const nameCharacter = /^[A-Z0-9!#$%&'()\-@^_`{}~]+$/;
/** Splits NAME.EXT into its two parts. */
export function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? [name, ''] : [name.slice(0, dot), name.slice(dot + 1)];
}
/** True for a valid 8.3 file or directory name (no wildcards). */
export function validName(name: string): boolean {
  if (name === '.' || name === '..') return false;
  const [base, extension] = splitName(name);
  return (
    base.length >= 1 &&
    base.length <= 8 &&
    extension.length <= 3 &&
    nameCharacter.test(base) &&
    (!extension || nameCharacter.test(extension)) &&
    name.split('.').length <= 2
  );
}
/**
 * A typed name cut to 8.3 the way DOS cuts it, without a word: TYPE PROCEDURE.WP opens
 * PROCEDUR.WP, and COPY CON LONGFILENAME.TXT makes LONGFILE.TXT.
 */
export function shortName(name: string) {
  if (name === '.' || name === '..' || name.split('.').length > 2) return name;
  const [base, extension] = splitName(name);
  return base.slice(0, 8) + (name.includes('.') ? '.' + extension.slice(0, 3) : '');
}
export const hasWildcard = (text: string) => /[*?]/.test(text);
/** DOS wildcard match: `*` fills the rest of the name or extension, `?` one or no character. */
export function matches(pattern: string, name: string): boolean {
  const [patternBase, patternExtension] = splitName(
    pattern.includes('.') ? pattern : pattern + '.*',
  );
  const [base, extension] = splitName(name);
  const part = (wanted: string, actual: string, width: number) => {
    for (let n = 0; n < width; n++) {
      const want = wanted[n];
      if (want === '*') return true;
      if (want === undefined) return actual[n] === undefined;
      if (want === '?') continue;
      if (want !== actual[n]) return false;
    }
    return true;
  };
  // "NAME." explicitly means no extension; "NAME" alone means any extension.
  if (pattern.endsWith('.') && extension) return false;
  return part(patternBase, base, 8) && part(patternExtension, extension, 3);
}
export const isRoot = (path: string) => /^[A-Z]:\\$/.test(path);
export function parent(path: string): string {
  if (isRoot(path)) return path;
  const cut = path.lastIndexOf('\\');
  return cut <= 2 ? path.slice(0, 3) : path.slice(0, cut);
}
export function baseName(path: string): string {
  return isRoot(path) ? '' : path.slice(path.lastIndexOf('\\') + 1);
}
export function join(directory: string, name: string): string {
  return isRoot(directory) ? directory + name : directory + '\\' + name;
}
/**
 * Resolves a typed path against the current directory: `C:\A\B`, `\A`, `..\A`, `A`, `C:`.
 * Names longer than 8.3 are cut short, as DOS cuts them. Returns an absolute upper-case
 * path, or null when a component is not a valid name.
 * The final component may contain wildcards when `wildcards` is set.
 */
export function resolvePath(cwd: string, input: string, wildcards = false): string | null {
  let text = input.trim().toUpperCase().replace(/\//g, '\\');
  if (!text) return null;
  let drive = cwd.slice(0, 2);
  const lettered = /^([A-Z]):/.exec(text);
  if (lettered) {
    drive = lettered[1] + ':';
    text = text.slice(2);
  }
  const absolute = text.startsWith('\\');
  const start =
    absolute || drive !== cwd.slice(0, 2) ? [] : cwd.slice(3).split('\\').filter(Boolean);
  const parts = text.split('\\').filter(Boolean);
  const stack = [...start];
  for (let n = 0; n < parts.length; n++) {
    const part = shortName(parts[n]);
    if (part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    const last = n === parts.length - 1;
    if (
      !validName(part) &&
      !(wildcards && last && hasWildcard(part) && validName(part.replace(/[*?]/g, 'X')))
    )
      return null;
    stack.push(part);
  }
  return drive + '\\' + stack.join('\\');
}
