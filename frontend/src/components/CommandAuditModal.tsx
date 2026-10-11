import React, { useState } from 'react';
import {
  Terminal,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Server,
  Play,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  Cpu,
  Layers,
  Code
} from 'lucide-react';
import { Button, ModalShell } from './common';
import { CommandAuditResponse, api } from '../api/client';

export interface CommandExecutionData {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms?: number;
  server_id?: string;
  server_name?: string;
  server_ip?: string;
  context_type?: string;
  title?: string;
}

interface CommandAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  executionData: CommandExecutionData | null;
  onRunFix?: (fixCommand: string) => Promise<void> | void;
}

export const CommandAuditModal: React.FC<CommandAuditModalProps> = ({
  isOpen,
  onClose,
  executionData,
  onRunFix
}) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [copiedFix, setCopiedFix] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<CommandAuditResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'ai' | 'terminal'>('ai');
  const [runningFix, setRunningFix] = useState(false);

  // When executionData changes and modal opens, auto-run or reset AI audit
  React.useEffect(() => {
    if (isOpen && executionData) {
      setAuditResult(null);
      runAiAudit();
    }
  }, [isOpen, executionData?.command, executionData?.exit_code, executionData?.stdout]);

  const runAiAudit = async () => {
    if (!executionData) return;
    setAuditLoading(true);
    try {
      const res = await api.auditCommand({
        command: executionData.command,
        stdout: executionData.stdout || '',
        stderr: executionData.stderr || '',
        exit_code: executionData.exit_code,
        duration_ms: executionData.duration_ms || 0,
        server_id: executionData.server_id,
        server_name: executionData.server_name,
        server_ip: executionData.server_ip,
        context_type: executionData.context_type
      });
      setAuditResult(res);
    } catch (err) {
      console.error('Failed to run AI command audit:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Clipboard copy failed:', e);
    }
  };

  if (!executionData) return null;

  const isSuccess = executionData.exit_code === 0;
  const statusLevel = auditResult?.status_level || (isSuccess ? 'SUCCESS' : 'ERROR');

  const getStatusColor = (level: string) => {
    switch (level) {
      case 'SUCCESS':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'WARNING':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'ERROR':
      default:
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    }
  };

  const handleExecuteFix = async () => {
    if (!auditResult?.suggested_command || !onRunFix) return;
    setRunningFix(true);
    try {
      await onRunFix(auditResult.suggested_command);
    } finally {
      setRunningFix(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={executionData.title || 'Command Output & AI Diagnostic Audit'}
      description={
        executionData.server_name
          ? `Executed on ${executionData.server_name} (${executionData.server_ip || 'node'}) · AI interpretation & root cause analysis`
          : 'Command execution telemetry, real-time stdout/stderr, and automated AI diagnostic analysis.'
      }
      icon={Terminal}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {auditResult && (
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-brand-400" />
                <span>Audited by <strong className="text-slate-200">{auditResult.provider_used}</strong> ({auditResult.model_name})</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {auditResult?.suggested_command && onRunFix && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleExecuteFix}
                isLoading={runningFix}
                leftIcon={<Play size={13} />}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                Execute Fix on VPS
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* Top Status & Metrics Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Exit Code Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                isSuccess
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80'
                  : 'bg-rose-950/60 text-rose-400 border-rose-800/80'
              }`}
            >
              {isSuccess ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              <span>Exit Code {executionData.exit_code} ({isSuccess ? 'Success' : 'Failed'})</span>
            </span>

            {/* AI Status Level Pill */}
            {auditResult && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${getStatusColor(statusLevel)}`}>
                <Sparkles size={11} />
                <span>AI Grade: {statusLevel}</span>
              </span>
            )}

            {/* Duration */}
            {executionData.duration_ms !== undefined && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 px-2 py-1 rounded bg-slate-900 border border-slate-800">
                <Clock size={11} className="text-slate-500" />
                <span>{executionData.duration_ms} ms</span>
              </span>
            )}
          </div>

          {/* Tab Selector */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('ai')}
              className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'ai'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles size={12} className={activeTab === 'ai' ? 'text-white' : 'text-brand-400'} />
              <span>AI Audit & Solution</span>
            </button>
            <button
              onClick={() => setActiveTab('terminal')}
              className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'terminal'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal size={12} />
              <span>Terminal Output</span>
            </button>
          </div>
        </div>

        {/* Command Executed Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Code size={13} className="text-brand-400" />
              <span>Command Executed</span>
            </span>
            <button
              onClick={() => copyToClipboard(executionData.command, setCopiedCmd)}
              className="hover:text-white transition-colors flex items-center gap-1 text-[11px]"
              title="Copy Command"
            >
              {copiedCmd ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copiedCmd ? 'Copied' : 'Copy Command'}</span>
            </button>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-emerald-400 select-all overflow-x-auto whitespace-pre">
            <span className="text-slate-500 mr-2 select-none">$</span>
            {executionData.command}
          </div>
        </div>

        {/* Tab 1: AI Diagnostic Audit & Solution */}
        {activeTab === 'ai' && (
          <div className="space-y-4">
            {auditLoading ? (
              <div className="p-8 text-center rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <RefreshCw size={28} className="animate-spin text-brand-400 mx-auto" />
                <div className="text-sm font-semibold text-white">AI Engine Auditing Command Telemetry...</div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Analyzing stdout/stderr, investigating process identifiers, and compiling root-cause explanations and solutions.
                </p>
              </div>
            ) : auditResult ? (
              <div className="space-y-4">
                {/* Summary Banner */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${getStatusColor(auditResult.status_level)}`}>
                  <div className="p-1.5 rounded-lg bg-black/20 shrink-0 mt-0.5">
                    {auditResult.status_level === 'SUCCESS' ? (
                      <CheckCircle2 size={18} />
                    ) : auditResult.status_level === 'CRITICAL' ? (
                      <AlertOctagon size={18} />
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider opacity-80 mb-0.5">
                      Diagnostic Summary
                    </div>
                    <div className="text-sm font-semibold leading-relaxed">
                      {auditResult.summary}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={runAiAudit}
                    leftIcon={<RefreshCw size={11} />}
                    title="Re-run AI Analysis"
                  >
                    Re-Analyze
                  </Button>
                </div>

                {/* Root Cause & Reason Card */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                    <ShieldAlert size={14} className="text-amber-400 shrink-0" />
                    <span>Reason & Root Cause Analysis</span>
                  </div>
                  <div className="text-xs text-slate-300 leading-relaxed pl-5 whitespace-pre-wrap">
                    {auditResult.reason}
                  </div>
                </div>

                {/* Recommended Solution Card */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Sparkles size={14} className="shrink-0" />
                    <span>Recommended Solution & Actionable Steps</span>
                  </div>
                  <div className="text-xs text-slate-300 leading-relaxed pl-5 whitespace-pre-wrap">
                    {auditResult.solution}
                  </div>
                </div>

                {/* Executable Fix Command (if provided) */}
                {auditResult.suggested_command && (
                  <div className="p-4 rounded-xl bg-brand-950/40 border border-brand-500/30 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-brand-300 flex items-center gap-1.5">
                        <Play size={13} className="text-brand-400" />
                        <span>Executable Remediation Command</span>
                      </span>
                      <button
                        onClick={() => copyToClipboard(auditResult.suggested_command!, setCopiedFix)}
                        className="text-brand-300 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
                      >
                        {copiedFix ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedFix ? 'Copied' : 'Copy Fix'}</span>
                      </button>
                    </div>

                    <div className="p-3 bg-slate-950/90 border border-brand-500/20 rounded-lg font-mono text-xs text-slate-200 select-all overflow-x-auto whitespace-pre">
                      {auditResult.suggested_command}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-xs text-slate-400 mb-3">No diagnostic analysis generated yet.</p>
                <Button variant="primary" size="sm" onClick={runAiAudit} leftIcon={<Sparkles size={13} />}>
                  Run AI Diagnostic Analysis
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Raw Terminal Output */}
        {activeTab === 'terminal' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Terminal size={13} className="text-slate-400" />
                <span>Console Output</span>
              </span>
              <button
                onClick={() =>
                  copyToClipboard(
                    `${executionData.stdout}\n${executionData.stderr}`.trim(),
                    setCopiedOutput
                  )
                }
                className="hover:text-white transition-colors flex items-center gap-1 text-[11px]"
              >
                {copiedOutput ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copiedOutput ? 'Copied' : 'Copy Output'}</span>
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto max-h-[380px] overflow-y-auto space-y-2">
              {executionData.stdout && (
                <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed select-all">
                  {executionData.stdout}
                </pre>
              )}
              {executionData.stderr && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-[10px] text-rose-400 uppercase font-bold tracking-wider mb-1">
                    Standard Error (stderr):
                  </div>
                  <pre className="text-rose-400/90 whitespace-pre-wrap leading-relaxed select-all">
                    {executionData.stderr}
                  </pre>
                </div>
              )}
              {!executionData.stdout && !executionData.stderr && (
                <div className="text-slate-500 italic py-4 text-center">
                  Command completed with zero output printed to stdout or stderr.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
