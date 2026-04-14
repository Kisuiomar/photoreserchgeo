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
  model_state: "not_downloaded" | "downloaded" | "loaded";
  model_loaded: boolean;
  model_downloaded: boolean;
}

const MODEL_STATE_META: Record<
  SystemStatus["model_state"],
  { label: string; dot: string }
> = {
  not_downloaded: {
    label: "Not downloaded",
    dot: "bg-slate-400 dark:bg-slate-500",
  },
  downloaded: {
    label: "Downloaded",
    dot: "bg-blue-400 dark:bg-blue-400 shadow-blue-400/50",
  },
  loaded: {
    label: "Loaded",
    dot: "bg-emerald-400 dark:bg-emerald-400 shadow-emerald-400/50",
  },
};

export default function App() {
  const [mode, setMode] = useState<AppMode>("testing");
  const [unloading, setUnloading] = useState(false);
  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark",
  );
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("onboarding_done_v3"),
  );
  const [showAbout, setShowAbout] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  // Poll the backend for live memory + model state. Backend is only
  // reachable after model.load() finishes on startup, so by the time the
  // frontend is running the model is already downloaded.
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
    localStorage.setItem("onboarding_done_v3", "true");
    setShowOnboarding(false);
  }, []);

  const modelState: SystemStatus["model_state"] =
    sysStatus?.model_state ?? "not_downloaded";
  const modelMeta = MODEL_STATE_META[modelState];

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

          {/* Tab navigation, centered */}
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
          <div className="flex items-center gap-2 justify-self-end">
            {/* System status group (model + RAM) */}
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg">
              {/* Model state pill */}
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${modelMeta.dot} shadow-sm`}
                />
                <span className="text-[11px] font-medium text-gray-700 dark:text-gray-200">
                  {modelMeta.label}
                </span>
                <HelpTip
                  width={300}
                  content={
                    <div className="space-y-2">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-xs">
                        Model states
                      </p>
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 mt-1 flex-shrink-0" />
                          <div>
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              Not downloaded
                            </span>
                            <p className="text-[11px] text-gray-600 dark:text-gray-300">
                              Weights not yet on disk. First prediction will
                              fetch them.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="font-semibold text-blue-500 dark:text-blue-400">
                              Downloaded
                            </span>
                            <p className="text-[11px] text-gray-600 dark:text-gray-300">
                              On disk but not loaded in RAM to save memory.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1 flex-shrink-0" />
                          <div>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              Loaded
                            </span>
                            <p className="text-[11px] text-gray-600 dark:text-gray-300">
                              In RAM, ready to respond instantly.
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
                        Loads on first use, unloads after 10 minutes idle.
                      </p>
                    </div>
                  }
                />
              </div>

              {sysStatus && (
                <>
                  <span className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
                  <div className="flex items-center gap-1">
                    <svg
                      className="w-3 h-3 text-gray-500 dark:text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.25 2.25 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875C3.839 7.5 3 8.34 3 9.375v10.5C3 20.91 3.84 21.75 4.875 21.75h9.75c1.036 0 1.875-.84 1.875-1.875V9.375c0-1.036-.84-1.875-1.875-1.875h-1.875"
                      />
                    </svg>
                    <span className="text-[11px] font-medium tabular-nums text-gray-700 dark:text-gray-200">
                      {sysStatus.memory_used_gb}/{sysStatus.memory_total_gb} GB
                    </span>
                    <HelpTip text="System RAM used vs. total. High usage is expected when the model is loaded. Use the Free RAM button to unload and recover memory." />
                  </div>
                </>
              )}
            </div>

            {/* Free RAM button */}
            <button
              onClick={handleUnload}
              disabled={unloading}
              className="text-[11px] font-medium text-gray-700 dark:text-gray-200 hover:text-red-500 dark:hover:text-red-400 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Unload model to free RAM"
            >
              {unloading ? "Freeing…" : "Free RAM"}
            </button>

            {/* About button */}
            <button
              onClick={() => setShowAbout(true)}
              className="text-[11px] font-medium text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-sm flex items-center gap-1"
              title="About"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                />
              </svg>
              About
            </button>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark((d) => !d)}
              className="p-1.5 rounded-lg text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-transform duration-300 hover:rotate-12 hover:scale-110"
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
