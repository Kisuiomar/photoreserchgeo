import HelpTip from "./HelpTip";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  help?: string;
  disabled?: boolean;
}

export default function Switch({
  checked,
  onChange,
  label,
  description,
  help,
  disabled,
}: Props) {
  return (
    <label
      className={`flex items-start gap-3 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer group"}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex items-center flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-300 ease-out mt-0.5 ${
          checked
            ? "bg-indigo-500 dark:bg-indigo-500"
            : "bg-gray-200 dark:bg-gray-700"
        }`}
      >
        <span
          className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-300 ease-out ${
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5"
          }`}
        />
      </button>
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && (
            <div className="flex items-center">
              <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                {label}
              </span>
              {help && <HelpTip text={help} />}
            </div>
          )}
          {description && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      )}
    </label>
  );
}
