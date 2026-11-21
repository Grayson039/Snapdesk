# Snapdesk (desktop app)

Free, offline screenshot capture and annotation for Windows. Built on Electron; the editor is the same Snapdesk web editor.

## Use
- **Ctrl+Shift+X** anywhere: the screen freezes, drag a region, and it opens in the editor.
- **Ctrl+Shift+Z**: capture the whole screen (the monitor under your mouse).
- **PrintScreen**: also captures a region. Tray > "PrintScreen" explains and opens the Windows setting if Snipping Tool is in the way; the app retries on its own.
  (Settings > Accessibility > Keyboard > "Use the Print screen button to open screen capture" must be off.)
- Space in the capture overlay = whole screen. Esc or right-click = cancel.
- The app lives in the system tray. Closing the editor window does not quit it; use tray > Quit.
- Tray > "Auto-save every capture" keeps the untouched original in Pictures\Snapdesk.
- Copy sends the finished image straight to the Windows clipboard. Save opens a normal Save dialog.

## Privacy
No network access: every http(s)/ws request is cancelled in the app's network layer, and no remote page is ever loaded.
The editor window has no Node access (context isolation + sandbox) and talks to the app through six narrow functions.

## Build (on any machine with Node)
    npm install
    npm start            # run it
    npm run dist         # Windows installer into dist/   (cross-building from Linux/Mac needs Wine for the NSIS installer)
    npm test             # Linux only: xvfb + Playwright, exercises real capture against a known pixel pattern

## Honest limits
- Not code-signed, so Windows SmartScreen shows "unknown publisher" on first run (More info > Run anyway).
- Tested on Linux/X11 against a virtual screen; not yet on real Windows hardware, HDR or fractional display scaling.
- No scrolling capture or video yet.
