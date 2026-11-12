import { terminalSafe, wrapText } from '../terminal/wrapText';
export const hasAnachronism = (value: string) =>
  /\b(smartphone|wi[ -]?fi|usb|chatgpt|social media|cloud computing|windows 95|internet browser|large language model|as an ai)\b/i.test(
    value,
  );
/** A sentence reduced to its words, for comparing a reply with the prompt. */
const words = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
/**
 * A command she spells out for the operator (DIR /A, TYPE SHIFT_17.TXT): her instructions
 * list the same commands, but quoting one is help, not an echo.
 */
const COMMAND =
  /^\/?(DIR|TYPE|CD|COPY|DEL|ERASE|REN|RENAME|MD|RD|TREE|FIND|MORE|ATTRIB|UNDELETE|CHKDSK|LOGIN|LOGOUT|PS|SUSPEND|RESUME|ALLOC|DOORS|USERS|LOG|STATUS|CLUES|CONNECT|DISCONNECT|EXIT|HELP|CLS|VER|MEM|DATE|TIME|REBOOT|EDIT|WPRO|CALC|COMLINK|CAMS)\b/i;
/**
 * Drops sentences a small model copied out of its own instructions ("Respond directly."),
 * keeping everything it actually said, and any command it quotes.
 */
function withoutEcho(text: string, prompt: string) {
  const source = words(prompt);
  return text
    .split('\n')
    .map((line) =>
      line
        .split(/(?<=[.!?])[ \t]+/)
        .filter((sentence) => {
          if (COMMAND.test(sentence.trim())) return true;
          const said = words(sentence);
          return !(said.includes(' ') && source.includes(said));
        })
        .join(' '),
    )
    .join('\n');
}
export function sanitize(text: string, unlockedFacts: readonly string[] = [], prompt = ''): string {
  // Some small models append verbatim system facts after an otherwise good answer.
  // Keep the answer while discarding copied context lines.
  const lines = text.split(/\r?\n/);
  const echo = lines.findIndex(
    (line, index) =>
      index > 0 &&
      unlockedFacts.some((fact) =>
        line.trim().toUpperCase().startsWith(fact.slice(0, 32).toUpperCase()),
      ),
  );
  if (echo > 0) text = lines.slice(0, echo).join('\n');
  const cleaned = text
    .replace(/<think\b[\s\S]*?(?:<\/think\s*>|$)/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^```[^\n]*(?:\n|$)/gm, '')
    .replace(/^\s*(assistant|system|user|limbic process 04)\s*:\s*/gim, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+)/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '');
  return terminalSafe(prompt ? withoutEcho(cleaned, prompt) : cleaned)
    .toUpperCase()
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split('\n')
    .slice(0, 6)
    .join('\n')
    .slice(0, 600);
}
export const displayReply = (text: string) => wrapText(text, 72).join('\n');
