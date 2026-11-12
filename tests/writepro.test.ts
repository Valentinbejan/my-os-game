import { describe, expect, it } from 'vitest';
import {
  BOLD,
  BOLD_END,
  NOTE,
  NOTE_END,
  WIDTH,
  WpDocument,
  codeName,
} from '../src/programs/writepro/Document';
describe('WRITEPRO document', () => {
  it('wraps words at the right margin and keeps hard returns', () => {
    const words = Array.from({ length: 20 }, (_, n) => 'WORD' + n).join(' ');
    const doc = new WpDocument(words + '\nNEXT');
    const lines = doc.layout();
    expect(
      lines.every((l) => l.glyphs.filter((g) => g.char !== ' ').every((g) => g.col < WIDTH)),
    ).toBe(true);
    const first = lines[0].glyphs
      .map((g) => g.char)
      .join('')
      .trimEnd();
    expect(first.endsWith('WORD')).toBe(false);
    expect(lines[1].glyphs[0].char).toBe('W');
    expect(lines.find((l) => l.hard)).toBeDefined();
    expect(
      lines
        .at(-1)!
        .glyphs.map((g) => g.char)
        .join(''),
    ).toBe('NEXT');
  });
  it('turns bold on and off with F6 and reports the style at the cursor', () => {
    const doc = new WpDocument();
    doc.insert('A ');
    doc.toggle(BOLD, BOLD_END);
    doc.insert('LOUD');
    expect(doc.style().bold).toBe(true);
    doc.toggle(BOLD, BOLD_END);
    doc.insert(' quiet');
    expect(doc.style().bold).toBe(false);
    expect(doc.text).toBe(`A ${BOLD}LOUD${BOLD_END} quiet`);
    expect(doc.plain()).toBe('A LOUD quiet');
    const glyphs = doc.layout()[0].glyphs;
    expect(
      glyphs
        .filter((g) => g.bold)
        .map((g) => g.char)
        .join(''),
    ).toBe('LOUD');
  });
  it('steps over hidden codes in the normal view but not in Reveal Codes', () => {
    const doc = new WpDocument(`AB${NOTE}RECORD THE TIME${NOTE_END}CD`);
    doc.cursor = 2;
    doc.right();
    expect(doc.cursor).toBe(doc.text.length - 1);
    doc.cursor = 2;
    doc.right(true);
    expect(doc.text[doc.cursor]).toBe('C');
    expect(codeName(doc.token(2)!)).toBe('[Comment:RECORD THE TIME]');
    expect(doc.plain()).toBe('ABCD');
    doc.cursor = doc.text.length - 2;
    expect(doc.remove(false)?.kind).toBe('note');
    expect(doc.text).toBe('ABCD');
  });
  it('maps the cursor to lines and columns and back', () => {
    const doc = new WpDocument('ONE\nTWO LINES');
    expect(doc.locate(0)).toEqual({ row: 0, col: 0 });
    expect(doc.locate(8)).toEqual({ row: 1, col: 4 });
    expect(doc.indexAt(1, 2)).toBe(6);
    expect(doc.indexAt(0, 40)).toBe(3);
    doc.cursor = 0;
    expect(doc.find('lines')).toBe(true);
    expect(doc.cursor).toBe(doc.text.length);
  });
});
