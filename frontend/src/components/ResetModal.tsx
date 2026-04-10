interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ResetModal({ onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
        <h3 className="text-gray-900 font-medium mb-2">Reset everything?</h3>
        <p className="text-sm text-gray-500 mb-5">
          This will clear all uploaded images and analysis results.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 transition-colors rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
}
