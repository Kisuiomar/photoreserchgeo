import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AppMode } from "./types";
import AboutModal from "./components/AboutModal";
import EditMode from "./components/EditMode";
import HelpTip from "./components/HelpTip";
import MonitorMode from "./components/MonitorMode";
import OnboardingWizard from "./components/OnboardingWizard";
import TestingMode from "./components/TestingMode";

const TABS: { key: AppMode; label: string; icon: string; desc: string }[] = [
  {
    key: "testing",
    label: "Explore",
    icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
    desc: "Upload photos and see where the AI thinks they were taken",
  },
  {
    key: "monitor",
    label: "Overview",
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
    desc: "Scan your photo library to see GPS coverage and statistics",
  },
  {
    key: "edit",
    label: "Edit",
    icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
    desc: "Predict and write GPS coordinates to photos without location data",
  },
];

interface SystemStatus {
  memory_used_gb: number;
  memory_total_gb: number;
  memory_percent: number;
  model_state: string;
  model_loaded: boolean;
}

export default function App() {
  const [mode, setMode] = useState<AppMode>("testing");
  const [unloading, setUnloading] = useState(false);
  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark",
  );
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("onboarding_done_v2"),
  );
  const [showAbout, setShowAbout] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  // Poll system status
  const pollSystemStatus = useCallback(() => {
    fetch("/api/system-status")
      .then((r) => r.json())
      .then(setSysStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    pollSystemStatus();
    pollRef.current = setInterval(pollSystemStatus, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollSystemStatus]);

  const handleUnload = useCallback(async () => {
    setUnloading(true);
    try {
      await fetch("/api/unload-models", { method: "POST" });
      pollSystemStatus();
    } finally {
      setUnloading(false);
    }
  }, [pollSystemStatus]);

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem("onboarding_done_v2", "true");
    setShowOnboarding(false);
  }, []);

  const modelDot = sysStatus?.model_loaded
    ? "bg-emerald-400 shadow-emerald-400/50"
    : "bg-gray-400 dark:bg-gray-600";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-300">
      {/* Onboarding wizard overlay */}
      {showOnboarding && <OnboardingWizard onDismiss={dismissOnboarding} />}

      {/* About modal */}
      <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />

      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30 transition-colors duration-300">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-2.5 max-w-6xl mx-auto gap-4">
          {/* Logo */}
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent select-none justify-self-start">
            WhereWasThisTaken?
          </span>

          {/* Tab navigation — centered */}
          <nav className="relative flex gap-0.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl justify-self-center">
            {TABS.map((t) => {
              const active = mode === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setMode(t.key)}
                  className={`relative flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    active
                      ? "text-indigo-700 dark:text-indigo-300"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="tab-bg"
                      className="absolute inset-0 bg-white dark:bg-gray-700 rounded-lg shadow-sm"
                      transition={{
                        type: "spring",
                        bounce: 0.15,
                        duration: 0.4,
                      }}
                    />
                  )}
                  <svg
                    className="w-4 h-4 relative z-10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={t.icon}
                    />
                  </svg>
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right side: status + controls */}
          <div className="flex items-center gap-3 justify-self-end">
            {/* Model status indicator */}
            <div className="flex items-center gap-2">
              <div className="relative flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${modelDot} ${sysStatus?.model_loaded ? "animate-pulse" : ""} shadow-sm`}
                />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 hidden sm:inline">
                  {sysStatus?.model_loaded ? "Model ready" : "Model idle"}
                </span>
                <HelpTip
                  width={320}
                  text="Model states: ⚪ Gray = not downloaded yet (first use will download). ⚪ Gray = downloaded but not loaded in RAM (saves memory). 🟢 Green solid = loaded in RAM, ready. 🟢 Green pulsing = loaded and actively running inference. The model loads automatically on the first prediction and unloads after 10 minutes of idle time."
                />
              </div>

              {sysStatus && (
                <div className="flex items-center">
                  <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500 hidden sm:inline">
                    {sysStatus.memory_used_gb}/{sysStatus.memory_total_gb} GB
                  </span>
                  <HelpTip text="System RAM: used / total. High usage is normal when the model is loaded. Click Free RAM to unload the model and recover memory." />
                </div>
              )}
            </div>

            {/* Free RAM button */}
            <button
              onClick={handleUnload}
              disabled={unloading}
              className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-all disabled:opacity-50"
              title="Unload model to free RAM"
            >
              {unloading ? "Freeing…" : "Free RAM"}
            </button>

            {/* About button */}
            <button
              onClick={() => setShowAbout(true)}
              className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              title="About"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                />
              </svg>
            </button>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark((d) => !d)}
              className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {mode === "testing" && <TestingMode />}
          {mode === "monitor" && <MonitorMode />}
          {mode === "edit" && <EditMode />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
