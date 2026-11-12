import { useEffect, useState, type MouseEvent } from 'react';
import { isDesktop } from './platform';
type Action = 'minimize' | 'toggleMaximize' | 'close';
const currentWindow = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();
// Window buttons never take focus: the game reads the keyboard globally, and a focused
// button would otherwise turn Space or Enter into a window action.
const keepFocus = (event: MouseEvent) => event.preventDefault();
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!isDesktop) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void currentWindow().then(async (frame) => {
      const sync = async () => {
        const [max, full] = await Promise.all([frame.isMaximized(), frame.isFullscreen()]);
        setMaximized(max);
        setFullscreen(full);
      };
      const unlisten = await frame.onResized(() => void sync());
      if (disposed) unlisten();
      else stop = unlisten;
      await sync();
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  const act = (action: Action) => () => {
    void currentWindow().then((frame) => frame[action]());
  };
  if (fullscreen) return null;
  return (
    <header className="titlebar" data-tauri-drag-region>
      <span className="badge">
        AEGIS<small>OPERATOR DISPLAY M-88</small>
      </span>
      <span className="indicators" aria-hidden="true">
        <span className="indicator">
          <i className="lamp disk" />
          ACCESS
        </span>
        <span className="indicator">
          <i className="lamp" />
          POWER
        </span>
      </span>
      {isDesktop && (
        <nav className="window-controls" aria-label="Window">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Minimize"
            onMouseDown={keepFocus}
            onClick={act('minimize')}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 5.5h8" />
            </svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onMouseDown={keepFocus}
            onClick={act('toggleMaximize')}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              {maximized ? (
                <path d="M1.5 3.5h5v5h-5zM3.5 3.5v-2h5v5h-2" />
              ) : (
                <path d="M1.5 1.5h7v7h-7z" />
              )}
            </svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="close"
            aria-label="Close"
            onMouseDown={keepFocus}
            onClick={act('close')}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
            </svg>
          </button>
        </nav>
      )}
    </header>
  );
}
