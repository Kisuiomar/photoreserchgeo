import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  text?: string;
  content?: React.ReactNode;
  width?: number;
}

interface Placement {
  tipLeft: number; // top-left corner of tooltip in viewport px
  tipTop: number;
  arrowLeft: number; // arrow position relative to tooltip left edge
  above: boolean;
}

const VIEWPORT_MARGIN = 8;

export default function HelpTip({ text, content, width = 260 }: Props) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const recalc = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const btnCenterX = r.left + r.width / 2;

    // Decide whether to go above or below based on available space
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceAbove > 200 && spaceAbove > spaceBelow;

    // Ideal horizontal position: tooltip centered on button
    let tipLeft = btnCenterX - width / 2;
    // Clamp to viewport
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    if (tipLeft < VIEWPORT_MARGIN) tipLeft = VIEWPORT_MARGIN;
    if (tipLeft > maxLeft) tipLeft = maxLeft;

    // Arrow should sit directly under/over the button center
    const arrowLeft = btnCenterX - tipLeft;

    // Vertical position: gap between button and tooltip
    const gap = 8;
    const tipTop = above ? r.top - gap : r.bottom + gap;

    setPlacement({
      tipLeft,
      tipTop,
      arrowLeft,
      above,
    });
  }, [width]);

  useEffect(() => {
    if (!open) return;
    recalc();
    const handler = () => recalc();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, recalc]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target as Node) &&
        tipRef.current &&
        !tipRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Clamp arrow position to keep it visible and inside the bubble
  const clampedArrowLeft = placement
    ? Math.max(12, Math.min(width - 12, placement.arrowLeft))
    : 0;

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-indigo-500 hover:border-indigo-400 dark:hover:text-indigo-400 dark:hover:border-indigo-500 transition-colors duration-200 cursor-help ml-1 flex-shrink-0 align-middle"
        aria-label="Help"
        type="button"
      >
        ?
      </button>
      <AnimatePresence>
        {open && placement && (
          <motion.div
            ref={tipRef}
            initial={{ opacity: 0, y: placement.above ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement.above ? 4 : -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            className="fixed z-[60] px-3 py-2 text-xs leading-relaxed rounded-xl shadow-lg border pointer-events-auto bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700"
            style={{
              width,
              left: placement.tipLeft,
              top: placement.tipTop,
              transform: placement.above ? "translateY(-100%)" : "none",
            }}
          >
            {content ?? text}
            <span
              className={`absolute w-2 h-2 rotate-45 bg-white dark:bg-gray-800 ${
                placement.above
                  ? "border-b border-r border-gray-200 dark:border-gray-700"
                  : "border-t border-l border-gray-200 dark:border-gray-700"
              }`}
              style={{
                left: clampedArrowLeft,
                marginLeft: -4,
                [placement.above ? "bottom" : "top"]: -4,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
