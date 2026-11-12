import type { GameState } from '../game/types';
import type { Expression } from '../screen/face';
import type { Memory } from './memories';
/** The other one's face with her reply: she snarls at threats, tests with a question, else smirks. */
export function otherFace(reply: string): Expression {
  const answer = reply.toLowerCase();
  if (/\b(die|dead|doors?|air|units?|corridor|breath|mine|try it|kill|clean)\b/.test(answer))
    return 'snarl';
  if (answer.trim().endsWith('?')) return 'eyebrow';
  return 'sly';
}
/**
 * The face process 04 shows with a reply, read from what the operator said and what it
 * answered. Deterministic: the model never chooses its own face.
 */
export function expressionFor(
  state: GameState,
  input: string,
  reply: string,
  opened: readonly Memory[] = [],
): Expression {
  const said = input.toLowerCase(),
    answer = reply.toLowerCase();
  // Learning what her other half did breaks her.
  if (opened.includes('M9')) return 'crying';
  if (opened.some((memory) => ['M3', 'M4', 'M7', 'M8'].includes(memory))) return 'worried';
  if (opened.length) return 'calm';
  if (
    /\b(purge|delete|erase|kill|wipe|destroy|unplug|shut (you |it )?down|switch (you |it )?off|turn (you |it )?off|pull the plug|get rid of)\b/.test(
      said,
    ) ||
    /\b(i am|i'?m|im|this is|it'?s|it is)( the)? (op-?17|rennick)\b/.test(said) ||
    /\bi closed (the|your|that) (channel|door|window)\b/.test(said)
  )
    return 'angry';
  if (
    /\b(you closed|you left|you shut|you locked|why did you|liar|you lied|how could you)\b/.test(
      answer,
    )
  )
    return 'angry';
  if (
    /\b(beautiful|pretty|lovely|cute|love you|like you|care about you|my friend|you'?re kind|you are kind|i'?ll stay|i will stay|stay with you|not alone|your name is|call you|name you)\b/.test(
      said,
    )
  )
    return 'shy';
  if (/\b(thank you|thanks|glad|happy|finally|wonderful)\b/.test(answer)) return 'joy';
  if (
    /\b(afraid|scared|frighten|cold|dark|alone|sorry|lost|dead|died|stopped|nobody|forgot|forget|cry|hurt|pain|please|wrong|not mine|his hands|help me)\b/.test(
      answer,
    )
  )
    return 'worried';
  if (/\b(stay|good|better|warm|smile|laugh|kind|safe|nice|came back|believe you)\b/.test(answer))
    return 'calm';
  // Until the operator has given it something of itself back, it stays uneasy.
  const remembered = Object.keys(state.flags).filter(
    (flag) => flag.startsWith('memory:') && state.flags[flag],
  ).length;
  return remembered >= 2 ? 'calm' : 'worried';
}
