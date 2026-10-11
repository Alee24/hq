import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ModalShell } from './common/ModalShell';
import { Button } from './common/Button';
import { InputField } from './common/InputField';

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

  const isConfirmDisabled = confirmKeyword ? inputVal.trim() !== confirmKeyword : false;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      icon={AlertTriangle}
      iconClassName={
        isDestructive
          ? 'bg-rose-950/80 text-rose-400 border-rose-800/80'
          : 'bg-amber-950/80 text-amber-400 border-amber-800/80'
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
          >
            {confirmButtonText}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-300 leading-relaxed">{message}</p>

        {confirmKeyword && (
          <div className="space-y-2 pt-1">
            <InputField
              label={`To confirm, type "${confirmKeyword}" below:`}
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value);
                setError(false);
              }}
              placeholder={confirmKeyword}
              errorMessage={
                error
                  ? `Confirmation keyword does not match. Please type exactly '${confirmKeyword}'.`
                  : undefined
              }
              autoFocus
              className="mono"
            />
          </div>
        )}
      </div>
    </ModalShell>
  );
};
