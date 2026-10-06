import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  X,
  Play,
  RotateCcw,
  Copy,
  Check,
  Clock,
  HardDrive,
  Cpu,
  Layers,
  Activity,
  History,
  Shield,
  Send
} from 'lucide-react';
import { api } from '../api/client';
import { Server, TerminalLog } from '../types';

interface ServerTerminalModalProps {
  server: Server;
  isOpen: boolean;
  onClose: () => void;
}

interface CommandOutputItem {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  timestamp: string;
}

export const ServerTerminalModal: React.FC<ServerTerminalModalProps> = ({
  server,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'console' | 'history'>('console');
  const [commandInput, setCommandInput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [outputs, setOutputs] = useState<CommandOutputItem[]>([]);
  const [historyLogs, setHistoryLogs] = useState<TerminalLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize terminal banner
  useEffect(() => {
    if (isOpen) {
      if (outputs.length === 0) {
        setOutputs([
          {
            id: 'init-banner',
            command: 'system-connect',
            stdout: `[CONNECTED] Secure Terminal Session Initialized\nTarget Node : ${server.name} (${server.hostname})\nAddress     : ${server.public_ip}:${server.ssh_port || 22} (${server.connection_type || 'SSH'})\nUser        : ${server.ssh_user || 'root'}\nSession     : Direct Interactive Console (Paramiko SSH / Agent Engine)\nType commands below or click Quick Actions for common system inspections.`,
            stderr: '',
            exit_code: 0,
            duration_ms: 1,
            timestamp: new Date().toLocaleTimeString()
          }
        ]);
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, server]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputs]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const logs = await api.getTerminalHistory(server.id);
      setHistoryLogs(logs);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExecute = async (cmdToRun?: string) => {
    const cmd = (cmdToRun || commandInput).trim();
    if (!cmd || executing) return;

    if (cmd.toLowerCase() === 'clear') {
      setOutputs([]);
      setCommandInput('');
      setHistoryIndex(-1);
      return;
    }

    setExecuting(true);
    setCommandInput('');
    setHistoryIndex(-1);

    try {
      const res = await api.executeTerminalCommand(server.id, cmd);
      setOutputs((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          command: cmd,
          stdout: res.stdout,
          stderr: res.stderr,
          exit_code: res.exit_code,
          duration_ms: res.duration_ms,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    } catch (err: any) {
      setOutputs((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          command: cmd,
          stdout: '',
          stderr: err.message || 'Execution failed. Check server network and credentials.',
          exit_code: 1,
          duration_ms: 0,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    } finally {
      setExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleExecute();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const pastCommands = outputs
        .map((o) => o.command)
        .filter((c) => c !== 'system-connect');
      if (pastCommands.length > 0) {
        const nextIdx = historyIndex + 1 < pastCommands.length ? historyIndex + 1 : historyIndex;
        setHistoryIndex(nextIdx);
        setCommandInput(pastCommands[pastCommands.length - 1 - nextIdx] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const pastCommands = outputs
        .map((o) => o.command)
        .filter((c) => c !== 'system-connect');
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommandInput(pastCommands[pastCommands.length - 1 - nextIdx] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommandInput('');
      }
    }
  };

  const copyOutput = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  const quickCommands = [
    { label: 'Uptime', cmd: 'uptime', icon: Clock },
    { label: 'Disk (df -h)', cmd: 'df -h', icon: HardDrive },
    { label: 'Memory (free -m)', cmd: 'free -m', icon: Cpu },
    { label: 'Docker Containers', cmd: 'docker ps', icon: Layers },
    { label: 'Systemctl Status', cmd: 'systemctl status docker', icon: Activity },
    { label: 'Kernel / OS Info', cmd: 'uname -a', icon: Shield },
    { label: 'Who Am I', cmd: 'whoami', icon: TerminalIcon },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-5xl h-[88vh] bg-slate-950 border border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
        {/* Terminal Header */}
        <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
            </div>
            <div className="h-4 w-px bg-slate-800"></div>
            <div className="flex items-center gap-2">
              <TerminalIcon size={14} className="text-emerald-400" />
              <span className="font-semibold text-slate-200">{server.name}</span>
              <span className="text-[11px] text-slate-400 font-mono">
                ({server.ssh_user || 'root'}@{server.public_ip}:{server.ssh_port || 22})
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
              {server.connection_type || 'SSH'} LIVE
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
              <button
                onClick={() => setActiveTab('console')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'console' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Live Console
              </button>
              <button
                onClick={() => {
                  setActiveTab('history');
                  loadHistory();
                }}
                className={`px-3 py-1 rounded text-xs flex items-center gap-1.5 transition-colors ${
                  activeTab === 'history' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History size={12} />
                <span>Audit Logs</span>
              </button>
            </div>

            <button
              onClick={() => setOutputs([])}
              title="Clear screen (or type 'clear')"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              <RotateCcw size={13} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 rounded-lg transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Quick Action Chips Bar */}
        {activeTab === 'console' && (
          <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto scrollbar-thin">
            <span className="text-[11px] text-slate-400 whitespace-nowrap uppercase tracking-wider font-semibold mr-1">
              Quick:
            </span>
            {quickCommands.map((q) => {
              const Icon = q.icon;
              return (
                <button
                  key={q.cmd}
                  onClick={() => handleExecute(q.cmd)}
                  disabled={executing}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 active:bg-brand-900 text-slate-300 hover:text-white border border-slate-800 rounded text-[11px] transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <Icon size={11} className="text-brand-400" />
                  <span>{q.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main Terminal Body */}
        {activeTab === 'console' ? (
          <div
            onClick={() => inputRef.current?.focus()}
            className="flex-1 p-4 bg-slate-950 overflow-y-auto space-y-4 cursor-text selection:bg-brand-700 selection:text-white"
          >
            {outputs.map((item) => (
              <div key={item.id} className="space-y-1.5 group">
                {/* Command Line Prompt */}
                <div className="flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-emerald-400 font-bold">
                      {server.ssh_user || 'root'}@{server.hostname || 'node'}:~#
                    </span>
                    <span className="text-white font-semibold">{item.command}</span>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-slate-400">{item.timestamp}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] ${
                        item.exit_code === 0
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}
                    >
                      exit {item.exit_code} ({item.duration_ms}ms)
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyOutput(item.id, item.stdout || item.stderr);
                      }}
                      className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
                      title="Copy Output"
                    >
                      {copiedId === item.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>

                {/* Command Output */}
                {item.stdout && (
                  <pre className="text-slate-300 font-mono text-[12px] leading-relaxed whitespace-pre-wrap pl-3 border-l-2 border-slate-800 bg-slate-900/20 p-2 rounded">
                    {item.stdout}
                  </pre>
                )}

                {item.stderr && (
                  <pre className="text-rose-400 font-mono text-[12px] leading-relaxed whitespace-pre-wrap pl-3 border-l-2 border-rose-800 bg-rose-950/20 p-2 rounded">
                    {item.stderr}
                  </pre>
                )}
              </div>
            ))}

            {executing && (
              <div className="flex items-center gap-2 text-slate-400 animate-pulse pl-2">
                <span className="text-emerald-400 font-bold">
                  {server.ssh_user || 'root'}@{server.hostname}:~#
                </span>
                <span className="text-brand-300">Executing remote pipeline...</span>
              </div>
            )}

            <div ref={terminalEndRef} />
          </div>
        ) : (
          /* History / Audit View */
          <div className="flex-1 p-5 bg-slate-950 overflow-y-auto">
            {historyLoading ? (
              <div className="text-center py-16 text-slate-400">Loading executed command audits...</div>
            ) : historyLogs.length === 0 ? (
              <div className="text-center py-16 text-slate-400">No terminal commands recorded yet on this server.</div>
            ) : (
              <div className="space-y-2">
                {historyLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-brand-400 font-bold">@{log.username}</span>
                        <span className="text-white font-mono">{log.command}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            log.exit_code === 0 ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                          }`}
                        >
                          exit {log.exit_code} ({log.execution_duration_ms}ms)
                        </span>
                      </div>
                    </div>
                    {log.output && (
                      <pre className="text-slate-400 text-[11px] max-h-24 overflow-y-auto bg-slate-950 p-2 rounded">
                        {log.output}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Command Input Bar */}
        {activeTab === 'console' && (
          <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-3">
            <span className="text-emerald-400 font-bold pl-2 select-none">
              {server.ssh_user || 'root'}@{server.hostname || 'node'}:~#
            </span>
            <input
              ref={inputRef}
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={executing}
              placeholder="Type terminal command (e.g. df -h, docker ps, uptime) and press Enter..."
              className="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder:text-slate-600 font-mono text-xs focus:ring-0"
              autoFocus
            />
            <button
              onClick={() => handleExecute()}
              disabled={executing || !commandInput.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
            >
              <Send size={12} />
              <span>Run</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
