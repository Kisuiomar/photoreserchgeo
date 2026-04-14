import { AnimatePresence, motion } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PYTHON_DEPS = [
  {
    name: "GeoCLIP",
    license: "MIT",
    url: "https://github.com/VicenteVivan/geo-clip",
    desc: "AI geolocation model",
  },
  {
    name: "PyTorch",
    license: "BSD-3-Clause",
    url: "https://pytorch.org",
    desc: "Deep learning framework",
  },
  {
    name: "TorchVision",
    license: "BSD-3-Clause",
    url: "https://pytorch.org",
    desc: "Computer vision library",
  },
  {
    name: "Transformers",
    license: "Apache-2.0",
    url: "https://github.com/huggingface/transformers",
    desc: "HuggingFace model hub",
  },
  {
    name: "FastAPI",
    license: "MIT",
    url: "https://fastapi.tiangolo.com",
    desc: "Web framework",
  },
  {
    name: "Uvicorn",
    license: "BSD-3-Clause",
    url: "https://www.uvicorn.org",
    desc: "ASGI server",
  },
  {
    name: "Pillow",
    license: "HPND",
    url: "https://python-pillow.org",
    desc: "Image processing",
  },
  {
    name: "reverse_geocoder",
    license: "LGPL-3.0",
    url: "https://github.com/thampiman/reverse-geocoder",
    desc: "Offline reverse geocoding",
  },
  {
    name: "pycountry",
    license: "LGPL-2.1",
    url: "https://github.com/pycountry/pycountry",
    desc: "Country database",
  },
  {
    name: "geopy",
    license: "MIT",
    url: "https://github.com/geopy/geopy",
    desc: "Forward geocoding",
  },
  {
    name: "psutil",
    license: "BSD-3-Clause",
    url: "https://github.com/giampaolo/psutil",
    desc: "System monitoring",
  },
];

const JS_DEPS = [
  {
    name: "React",
    license: "MIT",
    url: "https://react.dev",
    desc: "UI framework",
  },
  { name: "Vite", license: "MIT", url: "https://vite.dev", desc: "Build tool" },
  {
    name: "Tailwind CSS",
    license: "MIT",
    url: "https://tailwindcss.com",
    desc: "Utility-first CSS",
  },
  {
    name: "Leaflet",
    license: "BSD-2-Clause",
    url: "https://leafletjs.com",
    desc: "Interactive maps",
  },
  {
    name: "React-Leaflet",
    license: "Hippocratic-2.1",
    url: "https://react-leaflet.js.org",
    desc: "React map components",
  },
  {
    name: "Framer Motion",
    license: "MIT",
    url: "https://www.framer.com/motion",
    desc: "Animation library",
  },
  {
    name: "Inter",
    license: "OFL-1.1",
    url: "https://rsms.me/inter",
    desc: "UI typeface by Rasmus Andersson",
  },
];

const DATA_SOURCES = [
  {
    name: "OpenStreetMap",
    license: "ODbL",
    url: "https://www.openstreetmap.org/copyright",
    desc: "Map data",
  },
  {
    name: "CARTO",
    license: "BSD-3-Clause",
    url: "https://carto.com/attributions",
    desc: "Map tiles (Voyager)",
  },
];

function LicenseBadge({ license }: { license: string }) {
  const color =
    license.includes("MIT") || license.includes("BSD") || license === "HPND"
      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
      : license.includes("Apache")
        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400"
        : license.includes("LGPL")
          ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400";

  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${color}`}>
      {license}
    </span>
  );
}

export default function AboutModal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md">
                    <svg
                      className="w-5 h-5 text-white"
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
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                      FindMyPhoto
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      AI-powered photo geolocation
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {/* Author & License */}
              <section>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Created by{" "}
                      <strong className="text-gray-900 dark:text-gray-100">
                        Maximilian Enzinger
                      </strong>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Licensed under the GNU Affero General Public License v3.0
                    </p>
                  </div>
                  <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-lg">
                    AGPL-3.0
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                  This program is free software: you can redistribute it and/or
                  modify it under the terms of the GNU Affero General Public
                  License as published by the Free Software Foundation, either
                  version 3 of the License, or (at your option) any later
                  version. The complete license text is included in the LICENSE
                  file in the project repository.
                </p>
              </section>

              <hr className="border-gray-100 dark:border-gray-800" />

              {/* Third-party acknowledgements */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Open Source Acknowledgements
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                  This project is built upon the following open source software.
                  We are grateful to all contributors.
                </p>

                <h4 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Python / Backend
                </h4>
                <div className="space-y-1 mb-3">
                  {PYTHON_DEPS.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center justify-between py-1"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
                        >
                          {d.name}
                        </a>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 hidden sm:inline">
                          {d.desc}
                        </span>
                      </div>
                      <LicenseBadge license={d.license} />
                    </div>
                  ))}
                </div>

                <h4 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  JavaScript / Frontend
                </h4>
                <div className="space-y-1 mb-3">
                  {JS_DEPS.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center justify-between py-1"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
                        >
                          {d.name}
                        </a>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 hidden sm:inline">
                          {d.desc}
                        </span>
                      </div>
                      <LicenseBadge license={d.license} />
                    </div>
                  ))}
                </div>

                <h4 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Data Sources
                </h4>
                <div className="space-y-1">
                  {DATA_SOURCES.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center justify-between py-1"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
                        >
                          {d.name}
                        </a>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 hidden sm:inline">
                          {d.desc}
                        </span>
                      </div>
                      <LicenseBadge license={d.license} />
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
                All processing happens locally on your machine. No photos are
                uploaded to any external server.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
