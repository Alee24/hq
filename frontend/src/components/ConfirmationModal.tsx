import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmKeyword?: string; // e.g. "RESTART", "ROLLBACK", "REVOKE"
  confirmButtonText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmKeyword,
  confirmButtonText = 'Confirm Action',
  isDestructive = true,
  onConfirm,
  onClose,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (confirmKeyword && inputVal.trim() !== confirmKeyword) {
      setError(true);
      return;
    }
    setError(false);
    setInputVal('');
    onConfirm();
  };

  const handleClose = () => {
    setInputVal('');
    setError(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDestructive ? 'bg-rose-950/80 text-rose-400 border border-rose-800/80' : 'bg-amber-950/80 text-amber-400 border border-amber-800/80'}`}>
              <AlertTriangle size={20} />
            </div>
            <h3 id="modal-title" className="text-base font-semibold text-slate-100">
              {title}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            {message}
          </p>

          {confirmKeyword && (
            <div className="space-y-2 pt-2">
              <label htmlFor="confirm-input" className="block text-xs font-medium text-slate-400">
                To confirm, type <span className="mono font-semibold text-rose-400 px-1 py-0.5 bg-rose-950/50 rounded border border-rose-900">{confirmKeyword}</span> below:
              </label>
              <input
                id="confirm-input"
                type="text"
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  setError(false);
                }}
                placeholder={confirmKeyword}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 mono ${
                  error
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-slate-700 focus:border-brand-500 focus:ring-brand-500'
                }`}
                autoFocus
              />
              {error && (
                <p className="text-xs text-rose-400 mt-1">
                  Confirmation keyword does not match. Please type exactly '{confirmKeyword}'.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-950/50 border-t border-slate-800">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmKeyword ? inputVal.trim() !== confirmKeyword : false}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700'
                : 'bg-brand-600 hover:bg-brand-500 active:bg-brand-700'
            }`}
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};
