import { useCallback, useState } from "react";

import type { AppMode } from "./types";
import EditMode from "./components/EditMode";
import MonitorMode from "./components/MonitorMode";
import TestingMode from "./components/TestingMode";

const TABS: { key: AppMode; label: string }[] = [
  { key: "testing", label: "Testing" },
  { key: "monitor", label: "Monitor" },
  { key: "edit", label: "Edit" },
];

export default function App() {
  const [mode, setMode] = useState<AppMode>("testing");
  const [unloading, setUnloading] = useState(false);

  const handleUnload = useCallback(async () => {
    setUnloading(true);
    try {
      await fetch("/api/unload-models", { method: "POST" });
    } finally {
      setUnloading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="flex items-center justify-between px-6 py-3 max-w-6xl mx-auto">
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            WhereWasThisTaken?
          </span>

          <nav className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                  mode === t.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <button
            onClick={handleUnload}
            disabled={unloading}
            className="text-xs text-gray-400 hover:text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            title="Unload model to free RAM"
          >
            {unloading ? "Freeing…" : "Free RAM"}
          </button>
        </div>
      </header>

      <div className={mode === "testing" ? "" : "hidden"}>
        <TestingMode />
      </div>
      <div className={mode === "monitor" ? "" : "hidden"}>
        <MonitorMode />
      </div>
      <div className={mode === "edit" ? "" : "hidden"}>
        <EditMode />
      </div>
    </div>
  );
}
