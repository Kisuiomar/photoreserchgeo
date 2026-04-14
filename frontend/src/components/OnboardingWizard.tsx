import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";

interface Props {
  onDismiss: () => void;
}

const STEPS = [
  {
    title: "Welcome to FindMyPhoto",
    body: "This app uses AI to predict where your photos were taken. It can also write GPS coordinates into photos that are missing them. Let's walk through how it works.",
    extra:
      "Your photos never leave your computer. Scanning, inference, and writing all happen locally on this machine. No data is uploaded anywhere.",
    icon: "welcome",
  },
  {
    title: "Explore Mode",
    body: "Drop any photo into the upload zone and the AI will predict its location on a map. If the photo has existing GPS, you'll see a benchmark comparing the prediction to the real location.",
    extra:
      "Great for testing the model's accuracy or satisfying curiosity about a random photo. You can upload up to 50 images at once.",
    icon: "search",
  },
  {
    title: "Overview Mode",
    body: "Scan your entire photo library to see how many photos have GPS, which are missing it, and where they're located on a map. Statistics break down by format, directory, and GPS quality.",
    extra:
      "Use this first to understand your library before running the editor. It's a read-only scan, nothing is modified.",
    icon: "grid",
  },
  {
    title: "Edit Mode: Predict and Write GPS",
    body: "This is the main feature. It scans your library, predicts a location for every photo missing GPS, and lets you review each prediction and decide whether to accept, reject, or enter a manual address.",
    extra:
      "Temporal proximity boosts accuracy: a photo taken 3 minutes after a GPS-tagged photo gets a huge confidence bonus from the neighboring location. Real GPS coordinates from your camera are never touched. Only photos missing GPS are ever modified, and every write creates a backup you can roll back.",
    icon: "edit",
  },
  {
    title: "You're all set!",
    body: "Every button, term, and statistic has a ? icon next to it. Hover or click for an in-depth explanation. Your privacy stays protected: no photo, no metadata, and no prediction ever leaves this machine.",
    extra: null,
    icon: "done",
  },
];

function Icon({ type }: { type: string }) {
  const common = "w-7 h-7 text-white";
  switch (type) {
    case "welcome":
      return (
        <svg
          className={common}
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
      );
    case "search":
      return (
        <svg
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
      );
    case "grid":
      return (
        <svg
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
          />
        </svg>
      );
    case "edit":
      return (
        <svg
          className={common}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
          />
        </svg>
      );
    case "done":
      return (
        <svg
          className={common}
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
      );
    default:
      return null;
  }
}

function iconGradient(type: string): string {
  switch (type) {
    case "welcome":
      return "from-indigo-500 to-blue-600";
    case "search":
      return "from-blue-500 to-cyan-600";
    case "grid":
      return "from-violet-500 to-indigo-600";
    case "edit":
      return "from-fuchsia-500 to-indigo-600";
    case "done":
      return "from-emerald-500 to-teal-600";
    default:
      return "from-indigo-500 to-blue-600";
  }
}

export default function OnboardingWizard({ onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = useCallback(() => {
    if (isLast) {
      onDismiss();
      return;
    }
    setStep(step + 1);
  }, [step, isLast, onDismiss]);

  const prev = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-lg w-full overflow-hidden"
      >
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? "w-6 bg-indigo-500"
                  : i < step
                    ? "w-1.5 bg-indigo-300 dark:bg-indigo-700 hover:bg-indigo-400"
                    : "w-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
              aria-label={`Go to step ${i + 1}`}
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
            <div
              className={`w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${iconGradient(current.icon)} flex items-center justify-center shadow-lg`}
            >
              <Icon type={current.icon} />
            </div>

            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
              {current.title}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 text-center leading-relaxed">
              {current.body}
            </p>
            {current.extra && (
              <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-xl">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed flex gap-2">
                  <svg
                    className="w-4 h-4 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                    />
                  </svg>
                  <span>{current.extra}</span>
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Actions */}
        <div className="px-6 pb-5 flex items-center justify-between">
          <button
            onClick={skip}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Skip intro
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-all"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-medium rounded-xl transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
            >
              {isLast ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
