export function terminalSafe(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\t/g, '    ')
    .replace(/[^\x20-\x7e\n]/gu, '');
}
export function wrapText(text: string, width = 80): string[] {
  if (!Number.isInteger(width) || width < 1) throw new Error('Invalid wrap width');
  const lines: string[] = [];
  for (let line of text.replace(/\r\n?/g, '\n').split('\n')) {
    while ([...line].length > width) {
      const chars = [...line];
      let split = chars.slice(0, width + 1).lastIndexOf(' ');
      if (split <= 0) split = width;
      lines.push(chars.slice(0, split).join(''));
      line = chars.slice(split + (chars[split] === ' ' ? 1 : 0)).join('');
    }
    lines.push(line);
  }
  return lines;
}
