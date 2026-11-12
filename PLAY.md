# SIGNAL/91

Run **SIGNAL91.exe**. The first time, press Enter at the display advisory, or R for reduced flicker.

The title screen is drawn on the terminal like everything else. From it you can **resume** the night you left, **begin a new night**, change the **configuration** (display, sound, text speed and the AI model), read the **operator manual** (every command and every program's keys), open the **archive** (the endings, memories and faces you have found over every night) and see the **credits**. **Power off** saves and closes the game.

Each new night opens with a few lines on a dark screen about where you are and what you are there for; any key starts the machine. After an ending, the screen goes dark, the credits roll, and the title returns.

It is 02:14 on 8 December 1991. You are the relief night operator at the Blackridge Annex, evacuated five weeks ago. Your job is to keep the auxiliary bus alive until the decommission crew arrives at 06:00, and to file incident report IR-1103. The workstation is still logged in as OP-17, the operator who was on duty the evening it was evacuated.

## Playing

Everything happens on the computer. Type **HELP** at the prompt. **DIR** lists files, **CD** changes directory, and **TYPE filename** reads a file.

- **Before a night begins you choose how to play.**
  - **SHOW ME WHAT TO DO** puts a TASK line on the strip under the screen: it always says what to do next.
  - **PLAY ON MY OWN** leaves it out, for players who want to find their own way. Stuck? Turn it on under CONFIGURATION → TASK LINE.
  - Either way, the strip shows how many clues you have found, the backup cell, the camera light, and what Esc does.
- **Red text is a clue.** Wherever it appears (a file, a document, a sheet, a bulletin board, a camera picture) it is counted as found. **CLUES** lists them, and so does the pause menu.
- **CONNECT 04** opens a channel to the site assistant. She helps with the computer: ask her how to find hidden files, how to bring back a deleted one, how a program works. Bring up what you have found, in your own words, and she may remember something.
- **CAMS** shows the security camera archive. The pictures load slowly.
- Some things are hidden (**DIR /A**), some are deleted (**UNDELETE**), and some need the supervisor (**LOGIN SUPERVISOR**). Read a file twice if it comes back as zeros.

Later in the night, watch the **CAMERA** light on the strip: OFF, WATCHING, RECORDING, TRACKING. When the strip tells you to protect yourself, **PS** lists the bus processes and **SUSPEND** takes one off the bus. **DOORS** reports the doors.

The machine also has:

- **WPRO** (WRITEPRO 5.1), a word processor. F3 shows its keys; F11 reveals the hidden codes in a document.
- **CALC** (CALCPLAN 2.3), a spreadsheet. The / key opens its menus; F1 shows its keys.
- **COMLINK** (COMLINK PLUS 2.0), a modem program. F2 opens the dialing directory; F1 shows its keys.
- **CAMS**, the camera archive. Arrows and Enter pick a picture; Left and Right move between them.
- **EDIT**, a plain text editor.

## Keys

- **Escape always takes you back a step**, and the strip under the screen says what it will do (`ESC: CLOSE THE CHANNEL`, `ESC: LEAVE WRITEPRO`, `ESC: MENU`):
  - in the chat with the AI (channel 04), it closes the channel; so do typing `EXIT`, `QUIT` or `/EXIT`. A bar at the foot of the chat screen says so too;
  - in a program (EDIT, WRITEPRO, CALCPLAN, COMLINK, CAMS), it leaves the program, asking first when there is something to save. Each program also shows its exit key on its own screen;
  - at the prompt, it pauses the night. The clock and the battery stop while the pause menu is open; from it you can see your clues, change the configuration, read the manual, open the archive, go to the title or power off.
- Page Up / Page Down: scroll back (at the prompt).
- Ctrl+C: interrupt a command or a reply. Ctrl+L: clear the screen.
- F11 at the prompt, or Alt+Enter anywhere: fullscreen.
- Title bar (the top edge of the monitor): drag to move; the buttons minimize, maximize and close.
- Alt+F4: close the application.
- F2: restart after the night ends.

The backup cell drains while you play. Progress saves automatically on this computer. There are six endings.

## The AI

The voices on channel 04 come from a language model running only on this computer: the game tries MiniCPM5-2B first, then the small MiniCPM5-1B if needed. Written replies keep the story playable while a model loads, or without one. Choose another model under **CONFIGURATION → PROCESS 04 → LANGUAGE MODEL**: MiniCPM5-2B, the small MiniCPM5-1B, K2 Horizon, Bonsai (slow), or OFF for written replies only. The game restarts the model in the background and remembers the choice; the title's bottom line shows whether it is loading or ready. With the setting on AUTOMATIC, **Start with small model.cmd**, **Start with Horizon model.cmd** and **Start with Bonsai model.cmd** still choose a model at launch. The game stops its model server when it closes. Keep the **model** folder next to SIGNAL91.exe.

The camera pictures and the clips were made with AI tools and edited for the game.

Windows WebView2 is required. Keep the third-party notices and licenses with redistributed copies.
