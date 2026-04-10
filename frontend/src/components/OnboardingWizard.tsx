import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";

import type { AppMode } from "../types";

interface Props {
  onDismiss: () => void;
  onSelectTab: (tab: AppMode) => void;
}

const STEPS = [
  {
    title: "Welcome to WhereWasThisTaken?",
    body: "This app uses AI to predict where your photos were taken — and can even write GPS coordinates into photos that are missing them. Let's walk through the three modes.",
    highlight: null,
  },
  {
    title: "Explore Mode",
    body: "Upload any photo and the AI will predict its location on a map. Great for testing how well the model works, or just for fun. Photos with existing GPS data will show a benchmark comparing the prediction to the real location.",
    highlight: "testing" as AppMode,
  },
  {
    title: "Overview Mode",
    body: "Scan your entire photo library to see how many photos have GPS data, which ones don't, and where they're located on a map. Useful for understanding your library before running the editor.",
    highlight: "monitor" as AppMode,
  },
  {
    title: "Edit Mode",
    body: "The main feature: predict GPS locations for all photos without coordinates and write them into the files. Works in rounds — each round uses your accepted predictions to help locate more photos. Real GPS data is never modified.",
    highlight: "edit" as AppMode,
  },
  {
    title: "You're all set!",
    body: "You can revisit this guide anytime by clearing your browser's local storage. Hover over any question mark icon throughout the app for detailed explanations.",
    highlight: null,
  },
];

export default function OnboardingWizard({ onDismiss, onSelectTab }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = useCallback(() => {
    if (isLast) {
      onDismiss();
      return;
    }
    const nextStep = step + 1;
    setStep(nextStep);
    if (STEPS[nextStep].highlight) {
      onSelectTab(STEPS[nextStep].highlight!);
    }
  }, [step, isLast, onDismiss, onSelectTab]);

  const skip = useCallback(() => {
    if (
      confirm(
        "Skip the introduction? You can hover over ? icons throughout the app for help.",
      )
    ) {
      onDismiss();
    }
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full mx-4 overflow-hidden"
      >
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? "w-6 bg-indigo-500"
                  : i < step
                    ? "w-1.5 bg-indigo-300 dark:bg-indigo-700"
                    : "w-1.5 bg-gray-200 dark:bg-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="p-6 pt-4"
          >
            {/* Icon for first/last step */}
            {step === 0 && (
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900">
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
              </div>
            )}

            {isLast && (
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-emerald-900">
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </div>
            )}

            {/* Tab highlight indicator */}
            {current.highlight && (
              <div className="flex justify-center mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  Currently showing this tab
                </span>
              </div>
            )}

            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
              {current.title}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 text-center leading-relaxed">
              {current.body}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Actions */}
        <div className="px-6 pb-5 flex items-center justify-between">
          <button
            onClick={skip}
            className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Skip intro
          </button>
          <button
            onClick={next}
            className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-medium rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            {isLast ? "Get Started" : "Next"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
