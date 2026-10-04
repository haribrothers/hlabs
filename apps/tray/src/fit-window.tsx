// The menu window is exactly as big as the menu, so nothing shows around it (no box, no shadow beyond the menu's own
// rounded glass). It grows and shrinks with the menu as its state changes.
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function FitWindow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        void getCurrentWindow()
          .setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)))
          .catch(() => {});
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="tray-fit">
      {children}
    </div>
  );
}
