import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  text: string;
  width?: number;
}

export default function HelpTip({ text, width = 260 }: Props) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(true);
  const ref = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Determine if tooltip should render above or below
  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setAbove(rect.top > 200);
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
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
    <span className="relative inline-flex items-center">
      <button
        ref={ref}
        onClick={toggle}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:text-indigo-500 hover:border-indigo-400 dark:hover:text-indigo-400 dark:hover:border-indigo-500 transition-all duration-200 cursor-help ml-1 flex-shrink-0"
        aria-label="Help"
      >
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={tipRef}
            initial={{ opacity: 0, y: above ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: above ? 4 : -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`absolute z-50 px-3 py-2 text-xs leading-relaxed rounded-xl shadow-lg border pointer-events-auto
              bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700
              ${above ? "bottom-full mb-2" : "top-full mt-2"}`}
            style={{ width, left: "50%", transform: "translateX(-50%)" }}
          >
            {text}
            <div
              className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border bg-white dark:bg-gray-800
                ${above ? "bottom-[-5px] border-b border-r border-gray-200 dark:border-gray-700" : "top-[-5px] border-t border-l border-gray-200 dark:border-gray-700"}`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
