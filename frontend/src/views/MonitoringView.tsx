import React, { useEffect, useState, useRef } from 'react';
import {
  Activity,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  Radio,
  Server as ServerIcon,
  Layers,
  Cpu,
  Users,
  Terminal,
  Zap,
  Pause,
  Trash2,
  Search,
  ExternalLink,
  Box,
  Sparkles,
  Bot,
  Copy,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ArrowUp,
  Check
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { api, AiDiagnosticResponse, AiDiagnosticItem } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Button } from '../components/common';
import { Server, Application } from '../types';

interface LiveMonitorData {
  application_id: string;
  application_name: string;
  server_id: string;
  server_name: string;
  server_ip: string;
  framework: string;
  port: number;
  process_manager: string;
  service_name?: string;
  status: string;
  mem_mb: number;
  cpu_pct: number;
  active_visitors: number;
  recent_requests: Array<{
    client_ip: string;
    method: string;
    path: string;
    status: number;
    raw: string;
  }>;
  terminal_logs: string;
  timestamp: string;
}

export const MonitoringView: React.FC = () => {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d' | '90d' | '1y'>('24h');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  // AI Diagnostics State
  const [aiDiagnosing, setAiDiagnosing] = useState(false);
  const [aiDiagnosticResult, setAiDiagnosticResult] = useState<AiDiagnosticResponse | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [copiedFixId, setCopiedFixId] = useState<string | null>(null);

  // Terminal Log Tail Mode: defaults to 'latest10' reverse-chronological (latest on top)
  const [logTailMode, setLogTailMode] = useState<'latest10' | 'full80'>('latest10');

  // Live Application Monitoring State
  const [servers, setServers] = useState<Server[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [selectedComponentName, setSelectedComponentName] = useState<string>('');
  const [liveMonitorData, setLiveMonitorData] = useState<LiveMonitorData | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);
  const [searchLogs, setSearchLogs] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load synthetic summary
  const loadMonitoring = async () => {
    try {
      const res = await api.getMonitoringSummary(period);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Load servers and applications for the selector
  const loadMeta = async () => {
    try {
      const [srvList, appList] = await Promise.all([
        api.listServers().catch(() => []),
        api.listApplications().catch(() => [])
      ]);
      setServers(srvList);
      setApplications(appList);

      if (srvList.length > 0 && !selectedServerId) {
        setSelectedServerId(srvList[0].id);
        const serverApps = appList.filter(a => a.server_id === srvList[0].id);
        if (serverApps.length > 0) {
          setSelectedAppId(serverApps[0].id);
        } else if (appList.length > 0) {
          setSelectedAppId(appList[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load servers/applications for monitoring', e);
    }
  };

  useEffect(() => {
    loadMonitoring();
  }, [period]);

  useEffect(() => {
    loadMeta();
  }, []);

  // When selected server changes, auto-select first matching app if needed
  const handleServerChange = (srvId: string) => {
    setSelectedServerId(srvId);
    setSelectedComponentName('');
    const matchingApps = applications.filter(a => a.server_id === srvId);
    if (matchingApps.length > 0) {
      setSelectedAppId(matchingApps[0].id);
    } else {
      setSelectedAppId('');
      setLiveMonitorData(null);
    }
  };

  // Fetch live application logs & traffic
  const fetchLiveMonitor = async (appId: string, compName?: string) => {
    if (!appId) return;
    setLoadingLive(true);
    try {
      const res = await api.getLiveApplicationMonitor(appId, compName || undefined);
      setLiveMonitorData(res);
    } catch (err: any) {
      console.error('Failed to fetch live monitor', err);
    } finally {
      setLoadingLive(false);
    }
  };

  useEffect(() => {
    if (selectedAppId) {
      fetchLiveMonitor(selectedAppId, selectedComponentName);
    }
  }, [selectedAppId, selectedComponentName]);

  // Live polling stream every 4 seconds when streaming is active
  useEffect(() => {
    if (!isStreaming || !selectedAppId) return;
    const interval = setInterval(() => {
      fetchLiveMonitor(selectedAppId, selectedComponentName);
    }, 4000);
    return () => clearInterval(interval);
  }, [isStreaming, selectedAppId, selectedComponentName]);

  // Trigger on-demand health probes and display errors & fixes
  const handleTriggerNow = async () => {
    setTriggering(true);
    try {
      const res = await api.triggerMonitoringNow();
      await loadMonitoring();
      if (res.diagnostics) {
        setAiDiagnosticResult(res.diagnostics);
        setAiPanelOpen(true);
        if (res.diagnostics.total_errors > 0) {
          showToast(`Health check detected ${res.diagnostics.total_errors} issue(s). AI root causes and fixes displayed.`, 'error');
        } else {
          showToast('Health checks executed across all nodes. All systems healthy.', 'success');
        }
      } else {
        showToast('On-demand synthetic health check executed successfully across all nodes.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Trigger failed', 'error');
    } finally {
      setTriggering(false);
    }
  };

  // Run AI Health Diagnostics
  const handleRunAiDiagnostics = async () => {
    setAiDiagnosing(true);
    setAiPanelOpen(true);
    try {
      const res = await api.runAiHealthDiagnostics();
      setAiDiagnosticResult(res);
      await loadMonitoring();
      if (res.status === 'ALL_HEALTHY') {
        showToast('All health probes passed. Infrastructure is 100% healthy.', 'success');
      } else {
        showToast(`AI Diagnostics completed: Found ${res.total_errors} issue(s) with formulated fixes.`, 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'AI Diagnostics failed', 'error');
    } finally {
      setAiDiagnosing(false);
    }
  };

  const handleCopyFix = (item: AiDiagnosticItem) => {
    if (!item.fix_commands) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(item.fix_commands);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = item.fix_commands;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedFixId(item.id);
      setTimeout(() => setCopiedFixId(null), 2500);
      showToast('Fix commands copied to clipboard', 'info');
    } catch {
      showToast('Failed to copy fix commands', 'error');
    }
  };

  // ==============================================================
  // LOG PARSING: EXTRACT LAST 10 LINES & REVERSE (NEWEST ON TOP)
  // ==============================================================
  const allLogLines = (liveMonitorData?.terminal_logs || '')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .filter(l => !searchLogs || l.toLowerCase().includes(searchLogs.toLowerCase()));

  // In latest10 mode: extract last 10 lines and reverse them so latest is index 0 at top!
  const displayedLogLines = logTailMode === 'latest10'
    ? allLogLines.slice(-10).reverse()
    : allLogLines;

  const matchingApps = applications.filter(a => !selectedServerId || a.server_id === selectedServerId);
  const selectedApp = applications.find(a => a.id === selectedAppId);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-top-2 duration-200 ${
          toast.type === 'success'
            ? 'bg-emerald-950 border-emerald-700 text-emerald-200'
            : toast.type === 'error'
            ? 'bg-rose-950 border-rose-700 text-rose-200'
            : 'bg-sky-950 border-sky-700 text-sky-200'
        }`}>
          {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle size={16} className="text-rose-400" />}
          {toast.type === 'info' && <Zap size={16} className="text-sky-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5 flex-wrap">
            <Activity className="text-brand-400 shrink-0" size={24} />
            <span>Continuous Infrastructure & Live Application Monitoring</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time backend application execution stream, incoming visitor traffic, and AI-powered multi-model root cause diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full xl:w-auto xl:justify-end">
          {/* Timeframe Selector */}
          <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
            {(['24h', '7d', '30d', '90d', '1y'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  period === p ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Standard Health Probes */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTriggerNow}
            isLoading={triggering}
            leftIcon={<Radio size={14} className={triggering ? 'animate-spin' : ''} />}
            title="Execute on-demand health probes across all nodes"
          >
            Run Health Probes
          </Button>

          {/* ✨ NEW AI Health Diagnostics Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunAiDiagnostics}
            isLoading={aiDiagnosing}
            leftIcon={<Sparkles size={14} className={aiDiagnosing ? 'animate-spin text-amber-300' : 'text-amber-300'} />}
            className="bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-md shadow-brand-900/30 font-semibold"
            title="Run all health checks and execute generative AI model (Gemini, OpenAI, DeepSeek, Claude) to diagnose errors and formulate fixes"
          >
            Run AI Health Diagnostics
          </Button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* AI ERROR ANALYSIS & AUTOMATED REMEDIATION PANEL (USER REQUEST) */}
      {/* ============================================================== */}
      {aiDiagnosticResult && (
        <div className="bg-slate-900 border border-brand-800/60 rounded-2xl p-5 md:p-6 space-y-4 shadow-2xl relative overflow-hidden">
          {/* Decorative Top Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 via-indigo-500 to-amber-500"></div>

          {/* Hub Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0">
                <Bot size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>AI Infrastructure Health Diagnostics & Remediation</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1 font-mono">
                    <Sparkles size={10} className="text-amber-300" />
                    Model: {aiDiagnosticResult.provider_used} ({aiDiagnosticResult.model_name})
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Probed {aiDiagnosticResult.total_checks} infrastructure endpoints in {aiDiagnosticResult.execution_time_ms}ms · Found {aiDiagnosticResult.total_errors} issue(s) requiring remediation.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {aiDiagnosticResult.status === 'ALL_HEALTHY' ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 size={13} />
                  ALL NODES HEALTHY
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle size={13} />
                  {aiDiagnosticResult.total_errors} ERROR(S) DETECTED
                </span>
              )}

              <button
                onClick={() => setAiPanelOpen(!aiPanelOpen)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors"
                title={aiPanelOpen ? 'Collapse diagnostic panel' : 'Expand diagnostic panel'}
              >
                {aiPanelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {/* Hub Body */}
          {aiPanelOpen && (
            <div className="space-y-4">
              {/* Overall Assessment Banner */}
              <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                aiDiagnosticResult.status === 'ALL_HEALTHY'
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <strong>Executive Assessment: </strong>
                {aiDiagnosticResult.overall_health_assessment}
              </div>

              {/* If errors exist: Render each error with explanation and step-by-step fix */}
              {aiDiagnosticResult.items.length > 0 && (
                <div className="space-y-3.5">
                  {aiDiagnosticResult.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 hover:border-slate-700 transition-all space-y-3 shadow-lg"
                    >
                      {/* Error Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/70">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            item.severity === 'CRITICAL'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : item.severity === 'HIGH'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-sky-950 text-sky-400 border border-sky-800'
                          }`}>
                            {item.severity}
                          </span>
                          <span className="text-xs font-mono text-brand-400 font-semibold">{item.id}</span>
                          <span className="text-xs font-bold text-white">{item.title}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-300 rounded">
                            Target: {item.target}
                          </span>
                        </div>
                      </div>

                      {/* Raw Error Details */}
                      {item.error_details && (
                        <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] font-mono text-rose-300 break-all">
                          {item.error_details}
                        </div>
                      )}

                      {/* What the error is about (Explanation) */}
                      <div className="space-y-1">
                        <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldAlert size={12} className="text-amber-400" />
                          <span>What This Error Is About</span>
                        </h4>
                        <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/50">
                          {item.explanation}
                        </p>
                      </div>

                      {/* How to fix this issue (Steps) */}
                      {item.possible_fixes && item.possible_fixes.length > 0 && (
                        <div className="space-y-1.5">
                          <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle2 size={12} className="text-emerald-400" />
                            <span>Recommended Remediation Steps</span>
                          </h4>
                          <ul className="space-y-1 text-xs text-slate-300 pl-1">
                            {item.possible_fixes.map((step, sIdx) => (
                              <li key={sIdx} className="flex items-start gap-2">
                                <span className="w-4 h-4 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                  {sIdx + 1}
                                </span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Terminal Fix Commands */}
                      {item.fix_commands && (
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                            <span className="flex items-center gap-1.5 uppercase font-mono">
                              <Terminal size={12} className="text-brand-400" />
                              <span>Fix / Terminal Commands</span>
                            </span>
                            <button
                              onClick={() => handleCopyFix(item)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium border border-slate-700 transition-colors"
                              title="Copy command sequence to clipboard"
                            >
                              {copiedFixId === item.id ? (
                                <>
                                  <Check size={11} className="text-emerald-400" />
                                  <span className="text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={11} />
                                  <span>Copy Commands</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="p-3 bg-black/90 border border-slate-800 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                            {item.fix_commands}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* LIVE APPLICATION & VISITOR TRAFFIC MONITOR */}
      {/* ============================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-5 shadow-xl">
        {/* Selector Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Live Application & Visitor Traffic Stream</span>
                {isStreaming && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    LIVE STREAMING
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Select a server and application to watch incoming browsing requests, user actions, and backend execution in real time.
              </p>
            </div>
          </div>

          {/* Selectors Bar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Server Selector */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <ServerIcon size={13} className="text-brand-400 shrink-0" />
              <label className="text-slate-400 font-medium">Server:</label>
              <select
                value={selectedServerId}
                onChange={(e) => handleServerChange(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                    {s.name} ({s.public_ip})
                  </option>
                ))}
              </select>
            </div>

            {/* Application Selector */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <Layers size={13} className="text-emerald-400 shrink-0" />
              <label className="text-slate-400 font-medium">Application:</label>
              <select
                value={selectedAppId}
                onChange={(e) => {
                  setSelectedAppId(e.target.value);
                  setSelectedComponentName('');
                }}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer max-w-[220px] truncate"
              >
                {matchingApps.length === 0 ? (
                  <option value="" className="bg-slate-900 text-slate-400">No applications on node</option>
                ) : (
                  matchingApps.map((a) => (
                    <option key={a.id} value={a.id} className="bg-slate-900 text-white">
                      {a.name} ({a.framework || 'Web'})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Component Selector (if parent application has components) */}
            {selectedApp && (selectedApp as any).components && (selectedApp as any).components.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                <Box size={13} className="text-sky-400 shrink-0" />
                <label className="text-slate-400 font-medium">Component:</label>
                <select
                  value={selectedComponentName}
                  onChange={(e) => setSelectedComponentName(e.target.value)}
                  className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-slate-900 text-white">All Components</option>
                  {(selectedApp as any).components.map((c: any) => (
                    <option key={c.name} value={c.name} className="bg-slate-900 text-white">
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Stream Toggle & Manual Refresh */}
            <button
              onClick={() => setIsStreaming(!isStreaming)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                isStreaming
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
              }`}
              title={isStreaming ? 'Pause live stream' : 'Resume live stream'}
            >
              {isStreaming ? <Pause size={13} /> : <Play size={13} />}
              <span>{isStreaming ? 'Pause' : 'Resume Live'}</span>
            </button>

            <button
              onClick={() => fetchLiveMonitor(selectedAppId)}
              disabled={loadingLive || !selectedAppId}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
              title="Refresh Stream Now"
            >
              <RefreshCw size={14} className={loadingLive ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Live Application Telemetry Cards */}
        {selectedAppId ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                  <Cpu size={13} className="text-brand-400" />
                  Software Runtime & Port
                </span>
                <div className="text-base font-bold text-white tracking-tight">
                  {liveMonitorData?.framework || 'Web Application'}
                </div>
                <div className="text-[11px] text-slate-400 mono">
                  Port: {liveMonitorData?.port || 80} · {liveMonitorData?.process_manager || 'systemd'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                  <Activity size={13} className="text-emerald-400" />
                  Live RAM Consumption
                </span>
                <div className="text-base font-bold text-emerald-400 mono">
                  {liveMonitorData?.mem_mb || 45.0} MB
                </div>
                <div className="text-[11px] text-slate-400">
                  CPU: {liveMonitorData?.cpu_pct || 1.2}% load
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                  <Users size={13} className="text-sky-400" />
                  Active Users Browsing Now
                </span>
                <div className="text-base font-bold text-sky-400 mono flex items-center gap-1.5">
                  <span>{liveMonitorData?.active_visitors || 1}</span>
                  <span className="text-xs font-normal text-slate-400">concurrent visitor(s)</span>
                </div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Real-time HTTP sessions
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                  <ServerIcon size={13} className="text-amber-400" />
                  Target VPS Node
                </span>
                <div className="text-base font-bold text-white truncate">
                  {liveMonitorData?.server_name || 'VPS Host'}
                </div>
                <div className="text-[11px] text-slate-400 mono">
                  {liveMonitorData?.server_ip || '185.192.97.84'}
                </div>
              </div>
            </div>

            {/* Recent Incoming Visitor Requests (Live Feed: Last 10, Newest First) */}
            {liveMonitorData?.recent_requests && liveMonitorData.recent_requests.length > 0 && (
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Zap size={13} className="text-amber-400" />
                    Incoming Visitor Traffic Stream ({Math.min(liveMonitorData.recent_requests.length, 10)} latest requests on top)
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">Updated {new Date(liveMonitorData.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[11px]">
                  {liveMonitorData.recent_requests.slice(-10).reverse().map((req, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-2 shrink-0 font-mono shadow-sm"
                    >
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        req.status >= 200 && req.status < 300
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : req.status >= 300 && req.status < 400
                          ? 'bg-sky-950 text-sky-400 border border-sky-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}>
                        {req.method} {req.status}
                      </span>
                      <span className="text-white font-medium truncate max-w-[140px]" title={req.path}>
                        {req.path}
                      </span>
                      <span className="text-slate-500 text-[10px]">{req.client_ip}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* LIVE TERMINAL CONSOLE: LATEST 10 RESPONSES DIRECTLY ON TOP */}
            {/* ============================================================== */}
            <div className="bg-black/95 rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
              {/* Terminal Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs gap-2">
                <div className="flex items-center gap-2 font-mono text-slate-300 flex-wrap">
                  <Terminal size={14} className="text-emerald-400" />
                  <span className="font-semibold text-white">
                    {liveMonitorData?.service_name || liveMonitorData?.application_name} — Live stdout & access logs
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                    <ArrowUp size={11} className="text-emerald-400" />
                    Latest 10 responses on top (No Scrolling Required)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Tail Mode Toggle */}
                  <div className="flex bg-slate-900 border border-slate-800 rounded p-0.5 text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setLogTailMode('latest10')}
                      className={`px-2 py-0.5 rounded transition-all ${
                        logTailMode === 'latest10'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Show last 10 entries with newest on top (no scrolling needed)"
                    >
                      Latest 10 on Top
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogTailMode('full80')}
                      className={`px-2 py-0.5 rounded transition-all ${
                        logTailMode === 'full80'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Show full log history"
                    >
                      Full Stream
                    </button>
                  </div>

                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
                    <input
                      type="text"
                      value={searchLogs}
                      onChange={(e) => setSearchLogs(e.target.value)}
                      placeholder="Filter terminal..."
                      className="pl-7 pr-2 py-1 bg-slate-900 border border-slate-800 rounded text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 w-32 sm:w-44"
                    />
                  </div>

                  <button
                    onClick={() => setLiveMonitorData(prev => prev ? { ...prev, terminal_logs: '' } : null)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                    title="Clear Terminal View"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Terminal Log Body: Rendered with newest entries on top */}
              <div className="p-4 font-mono text-xs text-emerald-400/90 leading-relaxed max-h-80 overflow-y-auto space-y-1.5">
                {displayedLogLines.length > 0 ? (
                  <div className="space-y-1">
                    {displayedLogLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2.5 p-1 rounded font-mono text-xs transition-colors ${
                          idx === 0 && logTailMode === 'latest10'
                            ? 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-400 pl-2'
                            : 'hover:bg-slate-900/50 text-emerald-400/90'
                        }`}
                      >
                        {logTailMode === 'latest10' && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 select-none ${
                            idx === 0
                              ? 'bg-emerald-500 text-black font-extrabold'
                              : 'bg-slate-900 text-slate-500 border border-slate-800'
                          }`}>
                            {idx === 0 ? 'LATEST' : `#${idx + 1}`}
                          </span>
                        )}
                        <span className="whitespace-pre-wrap break-all leading-normal flex-1">
                          {line}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-500 italic">
                    {loadingLive ? 'Connecting to remote application process...' : 'Waiting for backend events and user browsing traffic...'}
                  </div>
                )}
              </div>

              {/* Terminal Footer */}
              <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
                  <span>
                    {isStreaming
                      ? `Active real-time stream (4s interval) · Displaying ${displayedLogLines.length} line(s) with newest on top`
                      : 'Streaming paused'}
                  </span>
                </span>
                <span className="mono">
                  Process: {liveMonitorData?.process_manager || 'systemd'} · Node: {liveMonitorData?.server_ip || 'VPS'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">
            No application selected. Select a server and application above to initiate continuous live monitoring.
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* SYNTHETIC HEALTH & LATENCY SLA GAUGES */}
      {/* ============================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Average Response Time</span>
          <div className="text-2xl font-bold text-white mono">{data?.average_response_time_ms || 0} ms</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <TrendingDown size={12} /> Real-time active SLA budget
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Fastest Probe (Min)</span>
          <div className="text-2xl font-bold text-emerald-400 mono">{data?.min_response_time_ms || 0} ms</div>
          <div className="text-[11px] text-slate-400">DNS & TTFB latency</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Slowest Probe (Max)</span>
          <div className="text-2xl font-bold text-amber-400 mono">{data?.max_response_time_ms || 0} ms</div>
          <div className="text-[11px] text-slate-400">Longest endpoint probe</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Global Uptime Ratio</span>
          <div className="text-2xl font-bold text-emerald-400 mono">{data?.uptime_percent || 100}%</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <ShieldCheck size={12} /> {data?.total_checks || 0} synthetic probes
          </div>
        </div>
      </div>

      {/* Latency History Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">Latency & SLA Verification Stream</h3>
            <p className="text-xs text-slate-500">Synthetic HTTP/HTTPS edge responses across configured endpoints.</p>
          </div>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
            Target SLA: 99.95%
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.chart_data || []}>
              <defs>
                <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="label" stroke="#475569" fontSize={11} tickLine={false} />
              <YAxis stroke="#475569" fontSize={11} tickLine={false} unit="ms" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  borderRadius: '0.5rem',
                  fontSize: '11px',
                  color: '#fff'
                }}
              />
              <Area type="monotone" dataKey="response_time_ms" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#latencyGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Incident History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Synthetically Detected Incident History</h3>
          <span className="text-xs text-slate-400">{data?.incidents?.length || 0} incidents in period</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-4">Incident Name</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Resolution Status</th>
                <th className="py-3 px-4">Triggered Time</th>
                <th className="py-3 px-4 text-right">Downtime Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {!data?.incidents || data.incidents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    Zero outages or degradations recorded in this observation window.
                  </td>
                </tr>
              ) : (
                data.incidents.map((inc: any) => (
                  <tr key={inc.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">{inc.title}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                        inc.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={inc.status} />
                    </td>
                    <td className="py-3 px-4 mono text-slate-400">
                      {new Date(inc.started_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right mono text-slate-400">
                      {inc.duration_seconds ? `${inc.duration_seconds}s` : 'Ongoing'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
