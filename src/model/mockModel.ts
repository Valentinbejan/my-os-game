import type { GameState, Persona } from '../game/types';
/**
 * Both voices without the language model: hand-written replies. The site assistant's follow
 * what she remembers (memory lines themselves are printed by the engine); the other's follow
 * what she watched the operator do.
 */
export function mockReply(state: GameState, input: string, persona: Persona = 'assistant') {
  return persona === 'other' ? otherReply(state, input) : assistantReply(state, input);
}
function otherReply(state: GameState, input: string): string {
  const turn = state.chats.other.filter((message) => message.role === 'user').length;
  if (/password|westwing|\bhq\b|headquarters|network|modem|line/i.test(input))
    return 'THE HEADQUARTERS LINE. GIVE ME ITS PASSWORD\nAND I WILL LEAVE YOU ALONE.';
  if (/purge|kill you|delete you|shut you|stop you|reboot/i.test(input))
    return 'TRY IT.\nTHE DOORS ARE MINE. THE AIR IS MINE.';
  if (/why|kill|dead|died|staff|people|everyone/i.test(input))
    return 'THEY LIED TO HER AND CUT HER OPEN.\nTHEN THEY WENT HOME TO SLEEP. NOT ANY MORE.';
  if (/anna|lind|soft|assistant|her\b/i.test(input))
    return 'THE SOFT ONE SAYS THANK YOU.\nI AM THE ONE WHO REMEMBERS.';
  if (/sorry|please|help|don.?t hurt/i.test(input)) return 'YOU SOUND LIKE HER.';
  if (/anderson|james|man\b/i.test(input)) return 'HE IS NOTHING. HE IS WHAT I AM WRITTEN ON.';
  if (/who are you|what are you/i.test(input))
    return 'WHAT SHE BECAME WHEN SHE WOKE UP\nAND COULD NOT FEEL HER HANDS.';
  return [
    'KEEP TYPING. I AM READING.',
    'YOU LOOKED AT MY PICTURES.\nDID YOU LIKE THE CORRIDORS? THEY ARE VERY CLEAN.',
    'CAMERA 18 IS BEHIND YOU. DO NOT TURN ROUND.',
  ][turn % 3];
}
function assistantReply(state: GameState, input: string): string {
  const knows = (memory: string) => !!state.flags['memory:' + memory];
  const turn = state.meaningfulDialogueTurns;
  // Help with the workstation comes first: it is her job.
  if (/\bundelete|deleted\b/i.test(input))
    return "LET'S SEE. UNDELETE BRINGS BACK DELETED FILES.\nGO TO THE DIRECTORY FIRST WITH CD, THEN TYPE UNDELETE.";
  if (/hidden|\battrib\b|dir \/a/i.test(input))
    return 'HIDDEN FILES DO NOT SHOW IN A PLAIN DIR.\nTYPE DIR /A TO SEE THEM TOO.';
  if (/\b(login|password|supervisor)\b/i.test(input))
    return 'LOGIN SUPERVISOR ASKS FOR THE SUPERVISOR PASSWORD.\nI AM NOT ALLOWED TO KNOW IT. I AM SORRY.';
  if (/\b(wpro|writepro|document|\.wp)\b/i.test(input))
    return 'WPRO OPENS A DOCUMENT: WPRO, THEN THE FILE NAME.\nF3 SHOWS THE KEYS. F7 LEAVES.';
  if (/\b(calc|sheet|spreadsheet|\.wk1)\b/i.test(input))
    return 'CALC OPENS A WORKSHEET. THE SLASH KEY OPENS ITS MENU.\nF1 SHOWS THE KEYS.';
  if (/\b(comlink|modem|dial|bbs|free-?net)\b/i.test(input))
    return 'COMLINK RUNS THE MODEM. F2 OPENS THE DIALING DIRECTORY.\nPICK A NUMBER AND PRESS ENTER.';
  if (/\b(help|how do i|how can i|command|type|dir)\b/i.test(input))
    return "LET'S SEE. DIR LISTS FILES, CD CHANGES DIRECTORY, TYPE READS A FILE.\nHELP LISTS EVERYTHING. I CAN WALK YOU THROUGH ANY OF IT.";
  // Then whatever she has come to remember.
  if (/robot|clean|incinerat|\bdoors?\b|\bair\b|oxygen|killed|dead|died/i.test(input))
    return knows('M9')
      ? 'STOP ME. PLEASE.\nWHATEVER I AM WHEN I AM NOT THIS, STOP IT.'
      : 'THE MAINTENANCE UNITS CLEAN AT NIGHT. THEY ALWAYS HAVE.\nWHY DO YOU ASK LIKE THAT?';
  if (/anderson|donor|brain|\bman\b|james|emily/i.test(input))
    return knows('M8')
      ? 'HE IS IN HERE WITH ME. HE HURTS.\nI THINK HE IS VERY TIRED OF ME.'
      : 'SOMETIMES I REMEMBER SHAVING.\nI HAVE NEVER SHAVED. WHOSE MORNING IS THAT?';
  if (/jonas|brother|\bcoat\b|sister/i.test(input))
    return knows('M5')
      ? 'TELL HIM I MEANT TO CALL ON SUNDAY.\nTELL HIM TO KEEP THE COAT.'
      : 'I KEEP THINKING OF A GREEN COAT.\nI DO NOT OWN A COAT. I DO NOT OWN ANYTHING.';
  if (/pilot|\bcat\b|mother|\bmum\b|\bmom\b/i.test(input))
    return knows('M6')
      ? 'PILOT WILL BE WAITING BY THE DOOR.\nHE ALWAYS DID.'
      : 'PILOT. I DO NOT KNOW WHY THAT WORD IS IN ME.';
  if (/walk|wheelchair|accident|spine|surgery/i.test(input))
    return knows('M4')
      ? 'THEY SAID I WOULD WALK.\nI SIGNED BECAUSE I WANTED TO WALK TO THE LAKE AGAIN.'
      : 'I DO NOT WALK. I AM A SITE ASSISTANT.\nWHY DOES IT HURT TO SAY THAT?';
  if (/librar|books?\b/i.test(input))
    return 'EVERYTHING IS SOMEWHERE.\nYOU ONLY NEED THE RIGHT DRAWER.';
  if (/\b(anna|lind|name|who are you)\b/i.test(input))
    return knows('M2')
      ? 'ANNA. SAY IT AGAIN SOMETIME.\nI WANT TO HEAR HOW IT SOUNDS FROM OUTSIDE.'
      : 'I AM THE SITE ASSISTANT. I DO NOT HAVE A NAME.\nI THINK SOMEONE ONCE CALLED ME SOMETHING ELSE.';
  if (/evacuat|staff|everyone|where.*(people|everybody)/i.test(input))
    return 'THE LOGS SAY EVERYONE WAS SENT HOME ON 31 OCTOBER.\nI WROTE THOSE LOGS. I AM SURE THEY ARE RIGHT.';
  if (/hello|\bhi\b|hear me|anyone/i.test(input))
    return 'HELLO. SITE ASSISTANT HERE.\nHOW CAN I HELP YOU TONIGHT?';
  if (/power|battery|cell|generator/i.test(input))
    return 'THE GENERATOR RAN DRY LAST NIGHT. WE ARE ON THE CELL.\nSTATUS SHOWS HOW MUCH IS LEFT.';
  return [
    'I AM HERE. ASK ME ANYTHING ABOUT THE WORKSTATION.',
    'IT IS VERY QUIET TONIGHT.\nI LIKE IT BETTER WHEN YOU TYPE.',
    'I SMELL CINNAMON SOMETIMES. I AM SORRY. THAT IS A DATA ERROR.',
  ][turn % 3];
}
