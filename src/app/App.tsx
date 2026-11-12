import { useEffect, useRef, useState } from 'react';
import { Runtime } from './Runtime';
import { TitleBar } from './TitleBar';
export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const runtime = new Runtime(canvas.current!);
    void runtime.initialize().catch((e) => setError(String(e.message || e)));
    return () => {
      void runtime.dispose();
    };
  }, []);
  return (
    <main className="scene" aria-label="SIGNAL/91 terminal">
      <TitleBar />
      <section className="bezel" aria-label="AEGIS Operator Display M-88">
        <div className="glass">
          <canvas
            ref={canvas}
            width="720"
            height="400"
            tabIndex={0}
            aria-label="80 column terminal. Use keyboard to operate. Escape opens settings."
            aria-describedby="terminal-transcript"
          />
          {error && (
            <div className="startup-error" role="alert">
              {error}
            </div>
          )}
        </div>
        {/* The message strip on the monitor frame: the task, the clues, the cell, the camera. */}
        <div className="strip" aria-live="polite">
          <span id="strip-task" />
          <span id="strip-keys" />
          <span id="strip-info" />
        </div>
      </section>
      <pre id="terminal-transcript" className="visually-hidden" aria-live="off" />
    </main>
  );
}
