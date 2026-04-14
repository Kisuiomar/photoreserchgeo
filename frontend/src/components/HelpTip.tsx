import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  text?: string;
  content?: React.ReactNode;
  width?: number;
}

export default function HelpTip({ text, content, width = 260 }: Props) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
    above: boolean;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Compute absolute position whenever we open
  const recalc = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const above = r.top > 180;
    const centerX = r.left + r.width / 2;
    setPlacement({
      left: centerX,
      top: above ? r.top - 8 : r.bottom + 8,
      above,
    });
  }, []);

  useEffect(() => {
    if (open) {
      recalc();
      window.addEventListener("scroll", recalc, true);
      window.addEventListener("resize", recalc);
      return () => {
        window.removeEventListener("scroll", recalc, true);
        window.removeEventListener("resize", recalc);
      };
    }
  }, [open, recalc]);

  // Close on outside click
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

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-indigo-500 hover:border-indigo-400 dark:hover:text-indigo-400 dark:hover:border-indigo-500 transition-all duration-200 cursor-help ml-1 flex-shrink-0 align-middle"
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
              left: placement.left,
              top: placement.top,
              transform: `translateX(-50%) ${placement.above ? "translateY(-100%)" : ""}`,
            }}
          >
            {content ?? text}
            <div
              className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 ${
                placement.above
                  ? "bottom-[-5px] border-b border-r"
                  : "top-[-5px] border-t border-l"
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
