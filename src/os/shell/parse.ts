export interface Filter {
  name: string;
  args: string[];
  switches: string[];
}
export interface CommandLine {
  /** Command or program name as typed, upper-case (may be a path such as C:\WRITEPRO\WPRO). */
  name: string;
  /** Everything after the name, untouched, for commands that read it whole (ECHO, SET, DATE). */
  raw: string;
  args: string[];
  /** Upper-case switch letters or words without the slash, e.g. W, P, A:H. */
  switches: string[];
  output?: { path: string; append: boolean };
  input?: string;
  filters: Filter[];
}
/** Splits text on spaces outside double quotes; quotes are removed. */
function words(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/"([^"]*)"?|[^\s"]+/g))
    found.push(match[1] !== undefined ? '"' + match[1] + '"' : match[0]);
  return found;
}
/** Separates `/X` switches, including ones glued to other words (DIR *.TXT/W/P). */
function split(tokens: string[]): { args: string[]; switches: string[] } {
  const args: string[] = [],
    switches: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('"')) {
      args.push(token.slice(1, -1));
      continue;
    }
    const [head, ...rest] = token.split('/');
    if (head) args.push(head);
    for (const part of rest) if (part) switches.push(part.toUpperCase());
  }
  return { args, switches };
}
/** Cuts text at a character that is not inside double quotes. */
function cut(text: string, char: string): [string, string | undefined] {
  let quoted = false;
  for (let n = 0; n < text.length; n++) {
    if (text[n] === '"') quoted = !quoted;
    else if (!quoted && text[n] === char) return [text.slice(0, n), text.slice(n + 1)];
  }
  return [text, undefined];
}
export function parseLine(line: string): CommandLine | null {
  const [command, ...piped] = (() => {
    const stages: string[] = [];
    let rest: string | undefined = line;
    while (rest !== undefined) {
      const [stage, after] = cut(rest, '|');
      stages.push(stage);
      rest = after;
    }
    return stages;
  })();
  let text = command.trim();
  if (!text) return null;
  let output: CommandLine['output'];
  const [beforeOutput, target] = cut(text, '>');
  if (target !== undefined) {
    const append = target.startsWith('>');
    output = { path: (append ? target.slice(1) : target).trim().split(/\s+/)[0] ?? '', append };
    text = beforeOutput.trim();
  }
  let input: string | undefined;
  const [beforeInput, source] = cut(text, '<');
  if (source !== undefined) {
    input = source.trim().split(/\s+/)[0];
    text = beforeInput.trim();
  }
  // The name ends at a space, a switch, a dot-dot or a backslash (CD.., DIR/W, CD\) unless the
  // whole first word is a path to a program.
  const first = text.split(/\s+/)[0];
  const name = /[\\:]/.test(first.replace(/^[A-Z]:$/i, ''))
    ? first
    : (/^[^\s/\\]+?(?=\.\.|[\s/\\]|$)/.exec(text)?.[0] ?? first);
  const raw = text.slice(name.length).replace(/^\s/, '');
  const { args, switches } = split(words(raw));
  const filters = piped.map((stage) => {
    const [filterName, ...rest] = words(stage.trim());
    return { name: (filterName ?? '').toUpperCase(), ...split(rest) };
  });
  return { name: name.toUpperCase(), raw, args, switches, output, input, filters };
}
