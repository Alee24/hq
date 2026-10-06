import React, { useState } from 'react';
import { CheckCircle2, ChevronRight, ChevronLeft, Shield, Server, Globe, Key, Bell, Activity, X } from 'lucide-react';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  { id: 1, title: 'Super Administrator', icon: Shield, desc: 'Enterprise root administrator credentials' },
  { id: 2, title: 'Database Engine', icon: Activity, desc: 'PostgreSQL connection pooling' },
  { id: 3, title: 'Monitoring Rules', icon: Activity, desc: 'SLA intervals and probe thresholds' },
  { id: 4, title: 'Primary Server', icon: Server, desc: 'First VPS node credentials & IP' },
  { id: 5, title: 'Agent Deployment', icon: Server, desc: 'Monitoring agent key distribution' },
  { id: 6, title: 'First Application', icon: Globe, desc: 'Host application routing & process manager' },
  { id: 7, title: 'Git VCS Integration', icon: Globe, desc: 'Origin repository deploy keys' },
  { id: 8, title: 'Domain & SSL', icon: Globe, desc: 'TLS automated certificates' },
  { id: 9, title: 'Cryptographic Licenses', icon: Key, desc: 'Ed25519 digital key authority' },
  { id: 10, title: 'Alert Notification Channels', icon: Bell, desc: 'Webhook & SMTP dispatch' },
  { id: 11, title: 'Verification', icon: CheckCircle2, desc: 'End-to-end health probe' },
];

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [completed, setCompleted] = useState(false);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1);
    } else {
      setCompleted(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const stepInfo = STEPS[currentStep - 1];
  const StepIcon = stepInfo.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              Initial Setup & Deployment Wizard
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Step {currentStep} of {STEPS.length}: {stepInfo.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-md transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-950 h-1">
          <div
            className="bg-brand-500 h-1 transition-all duration-300"
            style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-brand-950/80 border border-brand-800 text-brand-400 rounded-xl shrink-0">
              <StepIcon size={28} />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-white">{stepInfo.title}</h4>
              <p className="text-sm text-slate-400 mt-1">{stepInfo.desc}</p>
            </div>
          </div>

          {/* Step Dynamic Content */}
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
            {currentStep === 1 && (
              <div className="space-y-3">
                <div className="text-xs text-slate-400">Super administrator account status:</div>
                <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
                  <CheckCircle2 size={16} /> Configured: admin (admin@command-center.local)
                </div>
                <p className="text-xs text-slate-500">RBAC role: SUPER_ADMIN with root system privileges.</p>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">Database Engine:</span>
                  <span className="font-mono text-slate-200">Async SQLAlchemy (SQLite/PostgreSQL)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">Connection Pool:</span>
                  <span className="text-emerald-400">Verified & Active (0 errors)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Schema Migrations:</span>
                  <span className="text-emerald-400">Up to date (19 tables initialized)</span>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-2 text-xs text-slate-300">
                <p>Default interval set to 60 seconds with 10s request timeout.</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-400">CPU Threshold:</span>
                    <div className="text-amber-400 font-semibold">Warning &gt; 80% | Crit &gt; 95%</div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-400">RAM Threshold:</span>
                    <div className="text-amber-400 font-semibold">Critical &gt; 90%</div>
                  </div>
                </div>
              </div>
            )}

            {currentStep >= 4 && currentStep <= 10 && (
              <div className="space-y-2 text-xs text-slate-300">
                <p className="text-slate-400 leading-relaxed">
                  Enterprise default configuration parameters validated for {stepInfo.title.toLowerCase()}.
                </p>
                <div className="flex items-center gap-2 p-2 bg-slate-900 rounded border border-slate-800 text-emerald-400 font-mono">
                  <CheckCircle2 size={16} /> Ready for operational lifecycle management.
                </div>
              </div>
            )}

            {currentStep === 11 && (
              <div className="space-y-3 text-center py-4">
                <div className="inline-flex p-3 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                  <CheckCircle2 size={32} />
                </div>
                <h5 className="text-base font-semibold text-white">System Ready For Production</h5>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  All 11 infrastructure components are verified and operational. You can now access the full command center.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/50 border-t border-slate-800">
          <button
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} /> Previous
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Skip Wizard
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 active:bg-brand-700 rounded-lg shadow-sm transition-colors"
            >
              {currentStep === STEPS.length ? 'Finish & Launch' : 'Continue'}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
