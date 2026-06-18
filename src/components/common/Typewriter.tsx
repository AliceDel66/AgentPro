import { useEffect, useRef, useState } from "react";

/**
 * Reveals `text` character-by-character while `enabled` is true.
 * When disabled (e.g. historical messages), the full text is shown immediately.
 * `speed` is the approximate milliseconds per character.
 */
export function useTypewriter(text: string, enabled: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState(enabled ? "" : text);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      return undefined;
    }

    setDisplayed("");
    let index = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - lastTime;
      if (elapsed >= speed) {
        // Reveal multiple characters if the frame was delayed, so timing stays steady.
        const step = Math.max(1, Math.floor(elapsed / speed));
        index = Math.min(text.length, index + step);
        setDisplayed(text.slice(0, index));
        lastTime = now;
      }
      if (index < text.length) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [text, enabled, speed]);

  return { displayed, done: displayed.length >= text.length };
}

interface TypewriterTextProps {
  text: string;
  enabled: boolean;
  className?: string;
  speed?: number;
  /** Called on every reveal step — handy for keeping a scroll container pinned to the bottom. */
  onUpdate?: () => void;
}

export function TypewriterText({ text, enabled, className = "", speed, onUpdate }: TypewriterTextProps) {
  const { displayed, done } = useTypewriter(text, enabled, speed);

  useEffect(() => {
    onUpdate?.();
  }, [displayed, onUpdate]);

  return (
    <span className={className}>
      {displayed}
      {enabled && !done ? (
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-agent-caret bg-agent-primary align-middle" />
      ) : null}
    </span>
  );
}
