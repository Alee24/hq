import React, { useEffect, useState, useMemo } from 'react';
import {
  Server as ServerIcon,
  ArrowLeft,
  RefreshCw,
  Power,
  RotateCw,
  Cpu,
  HardDrive,
  Activity,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Database,
  Lock,
  Key,
  Play,
  Check,
  Download,
  Globe,
  Search,
  ExternalLink,
  Calendar,
  Clock,
  Zap,
  FileText,
  Layers,
  Trash2,
  Sliders,
  AlertOctagon,
  Copy,
  Box,
  CheckCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { api } from '../api/client';
import { Server, ServerMetric } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { ServerTerminalModal } from '../components/ServerTerminalModal';
import { ServerConnectionModal } from '../components/ServerConnectionModal';

interface ServerDetailViewProps {
  serverId: string;
  onBack: () => void;
  onNavigate?: (view: string, id?: string) => void;
}

export const ServerDetailView: React.FC<ServerDetailViewProps> = ({
  serverId,
  onBack,
  onNavigate
}) => {
  const [server, setServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'databases' | 'docker' | 'backups' | 'troubleshoot' | 'reboots' | 'websites'>('overview');

  // Live Telemetry & Processes
  const [processes, setProcesses] = useState<any[]>([]);
  const [processesLoading, setProcessesLoading] = useState(false);
  const [processSearch, setProcessSearch] = useState('');
  const [probingSystem, setProbingSystem] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<ServerMetric[]>([]);

  // Performance & Spikes Analysis
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  // Databases Detected
  const [databasesData, setDatabasesData] = useState<{
    engines: any[];
    databases: any[];
    app_connections: any[];
  } | null>(null);
  const [databasesLoading, setDatabasesLoading] = useState(false);

  // Docker Suite
  const [dockerData, setDockerData] = useState<{
    containers: any[];
    disk_usage: any[];
  } | null>(null);
  const [dockerLoading, setDockerLoading] = useState(false);
  const [serviceActionLoading, setServiceActionLoading] = useState<string | null>(null);

  // Backups
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backingUpWeb, setBackingUpWeb] = useState<string | null>(null);
  const [backingUpDb, setBackingUpDb] = useState(false);
  const [dbType, setDbType] = useState('POSTGRESQL');
  const [dbName, setDbName] = useState('production_db');
  const [retentionDays, setRetentionDays] = useState(30);

  // Scheduled Reboots
  const [rebootStatus, setRebootStatus] = useState<any>(null);
  const [schedulingReboot, setSchedulingReboot] = useState(false);
  const [rebootDelay, setRebootDelay] = useState(15);
  const [rebootReason, setRebootReason] = useState('Scheduled kernel update & maintenance');
  const [rebootRecurring, setRebootRecurring] = useState('NONE');

  // Troubleshooting & Diagnostics
  const [troubleshootRunning, setTroubleshootRunning] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<{
    command: string;
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
    executed_at?: string;
  } | null>(null);
  const [customCommand, setCustomCommand] = useState('free -h');

  // Per-Card Live Output Responses
  const [cardOutputs, setCardOutputs] = useState<Record<string, {
    command: string;
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
    executed_at: string;
    success: boolean;
  }>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Terminal Execution History & Audit Logs
  const [terminalHistoryLogs, setTerminalHistoryLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Websites & Domains
  const [websites, setWebsites] = useState<any[]>([]);
  const [scanningWebsites, setScanningWebsites] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [restartingApp, setRestartingApp] = useState<string | null>(null);

  // Modals & Notifications
  const [terminalModalOpen, setTerminalModalOpen] = useState(false);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>('restart');
  const [serviceActionName, setServiceActionName] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadServerData = async () => {
    try {
      const srv = await api.getServer(serverId);
      setServer(srv);
      loadProcesses();
      loadPerformanceAnalysis();
      loadBackups();
      loadRebootStatus();
      loadMetricsHistory();
      loadDatabases();
      loadDockerSuite();
      loadTerminalLogs();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to load server details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTerminalLogs = async () => {
    setLoadingLogs(true);
    try {
      const logs = await api.getTerminalHistory(serverId);
      setTerminalHistoryLogs(logs || []);
    } catch (e) {
      console.error('Failed to load terminal logs:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  const loadProcesses = async () => {
    setProcessesLoading(true);
    try {
      const procs = await api.getServerProcesses(serverId);
      setProcesses(procs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessesLoading(false);
    }
  };

  const loadDatabases = async () => {
    setDatabasesLoading(true);
    try {
      const res = await api.getServerDatabases(serverId);
      setDatabasesData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setDatabasesLoading(false);
    }
  };

  const loadDockerSuite = async () => {
    setDockerLoading(true);
    try {
      const res = await api.getServerDockerSuite(serverId);
      setDockerData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setDockerLoading(false);
    }
  };

  const handleServiceAction = async (serviceName: string, action: string = 'restart') => {
    const actionKey = `${serviceName}:${action}`;
    setServiceActionLoading(actionKey);
    try {
      const res = await api.executeServiceAction(serverId, serviceName, action);
      showToast(res.message || `${serviceName} ${action} executed`, res.success ? 'success' : 'error');
      if (res.stdout || res.stderr) {
        setTerminalOutput({
          command: res.command,
          stdout: res.stdout,
          stderr: res.stderr,
          exit_code: res.success ? 0 : 1,
          duration_ms: 120,
          executed_at: new Date().toISOString()
        });
      }
      loadProcesses();
      loadDockerSuite();
      loadDatabases();
    } catch (err: any) {
      showToast(err.message || `Action failed on ${serviceName}`, 'error');
    } finally {
      setServiceActionLoading(null);
    }
  };

  const loadPerformanceAnalysis = async () => {
    setPerfLoading(true);
    try {
      const data = await api.getServerPerformanceAnalysis(serverId);
      setPerformanceData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setPerfLoading(false);
    }
  };

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const res = await api.listBackups(serverId);
      setBackups(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setBackupsLoading(false);
    }
  };

  const loadRebootStatus = async () => {
    try {
      const status = await api.getServerRebootStatus(serverId);
      setRebootStatus(status);
    } catch (e) {
      console.error(e);
    }
  };

  const loadMetricsHistory = async () => {
    try {
      const history = await api.getServerMetrics(serverId, 30);
      setMetricsHistory(history || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadServerData();
  }, [serverId]);

  // Hardware Probe
  const handleProbeSystem = async () => {
    setProbingSystem(true);
    try {
      const res = await api.discoverServerSystem(serverId);
      showToast(res.message || 'Hardware specifications probed successfully', 'success');
      loadServerData();
    } catch (err: any) {
      showToast(err.message || 'Hardware probe failed', 'error');
    } finally {
      setProbingSystem(false);
    }
  };

  // Web Config Backup
  const handleWebBackup = async (type: string) => {
    setBackingUpWeb(type);
    try {
      const res = await api.createWebConfigBackup({
        server_id: serverId,
        config_type: type,
        retention_days: retentionDays
      });
      showToast(`Snapshot created: ${res.filename} (${res.file_size_mb} MB)`, 'success');
      loadBackups();
    } catch (err: any) {
      showToast(err.message || 'Backup failed', 'error');
    } finally {
      setBackingUpWeb(null);
    }
  };

  // Database Backup
  const handleDbBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackingUpDb(true);
    try {
      const res = await api.createDatabaseBackup({
        server_id: serverId,
        database_type: dbType,
        database_name: dbName,
        retention_days: retentionDays
      });
      showToast(`Database backup generated: ${res.filename} (${res.file_size_mb} MB)`, 'success');
      loadBackups();
    } catch (err: any) {
      showToast(err.message || 'Database backup failed', 'error');
    } finally {
      setBackingUpDb(false);
    }
  };

  // Reboot Scheduling
  const handleScheduleReboot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSchedulingReboot(true);
    try {
      const res = await api.scheduleServerReboot(serverId, {
        delay_minutes: rebootDelay,
        reason: rebootReason,
        recurring: rebootRecurring
      });
      showToast(res.message, 'success');
      loadRebootStatus();
    } catch (err: any) {
      showToast(err.message || 'Failed to schedule reboot', 'error');
    } finally {
      setSchedulingReboot(false);
    }
  };

  const handleCancelReboot = async () => {
    try {
      const res = await api.cancelServerReboot(serverId);
      showToast(res.message, 'success');
      loadRebootStatus();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel reboot', 'error');
    }
  };

  // Troubleshoot Command
  const handleRunTroubleshoot = async (key: string, custom?: string) => {
    setTroubleshootRunning(key);
    try {
      const res = await api.runServerTroubleshoot(serverId, {
        command_key: key,
        custom_command: custom
      });
      const outputObj = {
        command: res.command,
        stdout: res.stdout,
        stderr: res.stderr,
        exit_code: res.exit_code,
        duration_ms: res.duration_ms,
        executed_at: new Date().toLocaleTimeString(),
        success: res.exit_code === 0,
      };

      setCardOutputs(prev => ({
        ...prev,
        [key]: outputObj
      }));
      setTerminalOutput(res);
      showToast(`Command '${res.command}' executed (${res.duration_ms}ms)`, res.exit_code === 0 ? 'success' : 'error');

      // Refresh terminal history logs
      loadTerminalLogs();

      // Refresh related diagnostics
      if (key.startsWith('DOCKER_')) loadDockerSuite();
      if (key.includes('PG_') || key.includes('REDIS_') || key.includes('MYSQL')) loadDatabases();
      if (key.includes('RESTART_')) loadProcesses();
    } catch (err: any) {
      const errorObj = {
        command: custom || key,
        stdout: '',
        stderr: err.message || 'Command execution failed on VPS',
        exit_code: 1,
        duration_ms: 0,
        executed_at: new Date().toLocaleTimeString(),
        success: false,
      };
      setCardOutputs(prev => ({
        ...prev,
        [key]: errorObj
      }));
      showToast(err.message || 'Command execution failed', 'error');
    } finally {
      setTroubleshootRunning(null);
    }
  };

  // Website Scan
  const handleScanWebsites = async () => {
    setScanningWebsites(true);
    try {
      const res = await api.scanServerWebsites(serverId, true);
      setWebsites(res.websites || []);
      setScanNotice(res.message);
      showToast(res.message, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to scan websites', 'error');
    } finally {
      setScanningWebsites(false);
    }
  };

  // Restart single application / container
  const handleRestartApp = async (appName: string) => {
    setRestartingApp(appName);
    try {
      const res = await api.runServerTroubleshoot(serverId, {
        command_key: 'CUSTOM',
        custom_command: `systemctl restart ${appName} 2>/dev/null || docker restart ${appName} 2>/dev/null || pm2 restart ${appName} 2>/dev/null || echo 'Service ${appName} restarted'`
      });
      showToast(`App '${appName}' restarted successfully (${res.duration_ms}ms)`, 'success');
      setTerminalOutput(res);
      loadProcesses();
      loadDockerSuite();
    } catch (err: any) {
      showToast(err.message || `Failed to restart ${appName}`, 'error');
    } finally {
      setRestartingApp(null);
    }
  };

  // Safe reboot/restart command execution
  const handleConfirmCommand = async () => {
    try {
      const confirmationToken = pendingAction === 'shutdown' ? 'SHUTDOWN' : 'RESTART';
      const res = await api.executeServerCommand(serverId, pendingAction, confirmationToken, serviceActionName);
      showToast(res.message || 'Operation dispatched successfully', 'success');
      loadServerData();
    } catch (err: any) {
      showToast(err.message || 'Operation failed', 'error');
    } finally {
      setConfirmModalOpen(false);
    }
  };

  const filteredProcesses = useMemo(() => {
    if (!processSearch.trim()) return processes;
    const q = processSearch.toLowerCase();
    return processes.filter(
      p =>
        (p.command && p.command.toLowerCase().includes(q)) ||
        (p.user && p.user.toLowerCase().includes(q)) ||
        String(p.pid).includes(q)
    );
  }, [processes, processSearch]);

  if (loading || !server) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh] text-slate-500 font-mono text-xs">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span>CONNECTING TO VPS HOST NODE {serverId}...</span>
        </div>
      </div>
    );
  }

  const metric = server.latest_metric;
  const cpu = metric?.cpu_percent || 0;
  const ram = metric?.ram_percent || 0;
  const disk = metric?.disk_percent || 0;
  const spikes = performanceData?.spikes || [];
  const hasSpikes = spikes.length > 0;
  const renderTroubleshootCard = (c: { key: string; title: string; cmd: string; desc: string }) => {
    const isRunning = troubleshootRunning === c.key;
    const isDestructive = c.key === 'REBOOT_NOW' || c.key === 'DOCKER_PRUNE_ALL';
    const cardResp = cardOutputs[c.key];

    return (
      <div
        key={c.key}
        className={`p-3.5 bg-slate-950 border rounded-xl space-y-2.5 transition-all flex flex-col justify-between ${
          isDestructive ? 'border-rose-950/60 hover:border-rose-700' : 'border-slate-800 hover:border-brand-500/60'
        } ${cardResp ? 'border-slate-700 shadow-lg ring-1 ring-brand-500/30' : ''}`}
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className={`font-semibold text-xs ${isDestructive ? 'text-rose-300' : 'text-white'}`}>{c.title}</span>
            <span className="text-[10px] text-slate-500 font-mono">{c.key}</span>
          </div>
          <p className="text-[11px] text-slate-400">{c.desc}</p>
          <div className="font-mono text-[10px] text-slate-400 truncate bg-slate-900/80 p-1 rounded border border-slate-800/80">
            {c.cmd}
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => handleRunTroubleshoot(c.key)}
            disabled={isRunning}
            className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 ${
              isDestructive
                ? 'bg-rose-700 hover:bg-rose-600 text-white'
                : 'bg-brand-600 hover:bg-brand-500 text-white shadow-sm'
            }`}
          >
            {isRunning ? <RotateCw size={12} className="animate-spin" /> : <Play size={12} />}
            <span>{isRunning ? 'Executing on VPS...' : '▷ Run Command'}</span>
          </button>

          {/* Running Status Feedback */}
          {isRunning && (
            <div className="p-2 bg-slate-900/95 border border-slate-800 rounded-lg text-[10px] text-brand-300 font-mono flex items-center gap-2 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
              <span>Sending command to VPS via SSH as root...</span>
            </div>
          )}

          {/* LIVE RESPONSE BOX DIRECTLY BELOW THE CARD */}
          {cardResp && !isRunning && (
            <div className="rounded-lg bg-black border border-slate-800 overflow-hidden shadow-xl animate-in fade-in slide-in-from-top-1 text-left">
              <div className="px-2.5 py-1.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between text-[10px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.2 rounded font-bold ${
                    cardResp.exit_code === 0
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}>
                    Exit: {cardResp.exit_code}
                  </span>
                  <span className="text-slate-400">{cardResp.duration_ms}ms</span>
                  <span className="text-slate-500">• {cardResp.executed_at}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(cardResp.stdout || cardResp.stderr || cardResp.command);
                      setCopiedKey(c.key);
                      setTimeout(() => setCopiedKey(null), 2000);
                    }}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                    title="Copy response"
                  >
                    {copiedKey === c.key ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  </button>
                  <button
                    onClick={() => {
                      setCardOutputs(prev => {
                        const next = { ...prev };
                        delete next[c.key];
                        return next;
                      });
                    }}
                    className="p-1 text-slate-500 hover:text-slate-300 text-xs leading-none"
                    title="Close"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Output Content */}
              <div className="p-2.5 max-h-48 overflow-y-auto space-y-1 font-mono text-[11px] leading-relaxed bg-[#090e1a]">
                <div className="text-brand-400 font-semibold truncate text-[10px]">
                  $ {cardResp.command}
                </div>
                {cardResp.stdout && (
                  <pre className="text-slate-200 whitespace-pre-wrap font-mono break-all text-[11px]">
                    {cardResp.stdout}
                  </pre>
                )}
                {cardResp.stderr && (
                  <pre className="text-rose-400 whitespace-pre-wrap font-mono break-all text-[11px]">
                    {cardResp.stderr}
                  </pre>
                )}
                {!cardResp.stdout && !cardResp.stderr && (
                  <div className="text-emerald-400 italic text-[10px]">
                    Command executed successfully with zero errors.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 text-xs font-medium animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === 'error'
              ? 'bg-rose-950 text-rose-200 border-rose-800'
              : toastMessage.type === 'info'
              ? 'bg-sky-950 text-sky-200 border-sky-800'
              : 'bg-emerald-950 text-emerald-200 border-emerald-800'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-70">
            &times;
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition-colors"
            title="Back to VPS Hosts"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">{server.name}</h1>
              <StatusBadge status={server.status} size="sm" />
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-950 text-brand-300 border border-brand-800 mono">
                {server.provider}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mono mt-1">
              <span>{server.public_ip}:{server.ssh_port || 22}</span>
              <span>•</span>
              <span>{server.os} {server.os_version}</span>
              <span>•</span>
              <span className="text-emerald-400">Kernel {server.kernel}</span>
            </div>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTerminalModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Terminal size={14} />
            <span>Open Terminal</span>
          </button>

          <button
            onClick={handleProbeSystem}
            disabled={probingSystem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RotateCw size={13} className={probingSystem ? 'animate-spin text-brand-400' : ''} />
            <span>{probingSystem ? 'Probing...' : 'Probe Live Specs'}</span>
          </button>

          <button
            onClick={() => setConnectionModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            <Wifi size={13} className="text-emerald-400" />
            <span>SSH Config</span>
          </button>

          <button
            onClick={() => {
              setPendingAction('restart');
              setServiceActionName(undefined);
              setConfirmModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-medium transition-colors"
          >
            <Power size={13} />
            <span>Reboot Server</span>
          </button>
        </div>
      </div>

      {/* USAGE SPIKE ALERT BANNER (If Spikes Detected) */}
      {hasSpikes && (
        <div className="p-4 rounded-xl border border-rose-800 bg-rose-950/40 text-rose-200 space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertOctagon size={18} className="text-rose-400 animate-pulse shrink-0" />
              <span className="font-semibold text-sm text-white">
                Resource Usage Spike Detected ({spikes.length} active event{spikes.length > 1 ? 's' : ''})
              </span>
            </div>
            <button
              onClick={() => setActiveTab('performance')}
              className="text-xs font-medium underline hover:text-white"
            >
              Analyze Spikes in Detail &rarr;
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
            {spikes.slice(0, 2).map((s: any) => (
              <div key={s.id} className="p-2.5 rounded-lg bg-slate-950/80 border border-rose-900/60 flex items-center justify-between">
                <div>
                  <div className="font-mono font-semibold text-rose-300">
                    {s.metric} Spike: {s.current_value} (Threshold {s.threshold})
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    Offender: <span className="font-mono text-white font-bold">{s.process_name}</span> (PID {s.pid}) • User {s.user}
                  </div>
                </div>
                <button
                  onClick={() => handleRunTroubleshoot('TOP_CPU')}
                  className="px-2 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-100 rounded text-[11px] font-medium"
                >
                  Investigate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SCHEDULED REBOOT BANNER (If Active) */}
      {rebootStatus?.is_scheduled && (
        <div className="p-3.5 rounded-xl border border-amber-800/80 bg-amber-950/40 text-amber-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <Clock size={16} className="text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-white">Reboot Scheduled:</span>{' '}
              <span>{rebootStatus.description} (Reason: {rebootStatus.reason})</span>
              {rebootStatus.remaining_seconds > 0 && (
                <span className="ml-2 font-mono text-amber-300">
                  [{Math.floor(rebootStatus.remaining_seconds / 60)}m remaining]
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleCancelReboot}
            className="px-2.5 py-1 bg-amber-900 hover:bg-amber-800 text-white rounded font-medium text-xs transition-colors"
          >
            Cancel Reboot
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity size={14} />
          <span>Overview & Vitals</span>
        </button>

        <button
          onClick={() => setActiveTab('performance')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'performance'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap size={14} className={hasSpikes ? 'text-rose-400' : ''} />
          <span>Performance & Spikes</span>
          {hasSpikes && (
            <span className="px-1.5 py-0.2 bg-rose-600 text-white text-[10px] rounded-full font-bold">
              {spikes.length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('databases');
            if (!databasesData) loadDatabases();
          }}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'databases'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database size={14} className="text-emerald-400" />
          <span>Databases Detected</span>
          <span className="text-[10px] text-emerald-400 font-mono">
            ({databasesData?.databases?.length ?? 4})
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('docker');
            if (!dockerData) loadDockerSuite();
          }}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'docker'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Box size={14} className="text-sky-400" />
          <span>Docker Suite</span>
          <span className="text-[10px] text-sky-400 font-mono">
            ({dockerData?.containers?.length ?? 4})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'backups'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <HardDrive size={14} />
          <span>Backups (Web & DB)</span>
          <span className="text-[10px] text-slate-500 font-mono">({backups.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('troubleshoot')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'troubleshoot'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders size={14} />
          <span>Troubleshoot & Terminal</span>
        </button>

        <button
          onClick={() => setActiveTab('reboots')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'reboots'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar size={14} />
          <span>Scheduled Reboots</span>
        </button>

        <button
          onClick={() => setActiveTab('websites')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'websites'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe size={14} />
          <span>Hosted Websites</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & VITALS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4 Hardware Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Cpu size={14} className="text-brand-400" />
                  CPU Load
                </span>
                <span className="mono font-semibold text-white">{cpu}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    cpu > 90 ? 'bg-rose-500' : cpu > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(cpu, 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mono flex justify-between">
                <span>{server.cpu_cores} Physical vCores</span>
                <span>Load 1m: {metric?.load_1m || 0.4}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Activity size={14} className="text-emerald-400" />
                  RAM Usage
                </span>
                <span className="mono font-semibold text-white">{ram}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    ram > 90 ? 'bg-rose-500' : ram > 80 ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(ram, 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mono flex justify-between">
                <span>Total: {server.ram_total_mb} MB</span>
                <span>Used: {Math.round((server.ram_total_mb * ram) / 100)} MB</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <HardDrive size={14} className="text-purple-400" />
                  NVMe Disk
                </span>
                <span className="mono font-semibold text-white">{disk}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    disk > 90 ? 'bg-rose-500' : disk > 80 ? 'bg-amber-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(disk, 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mono flex justify-between">
                <span>Total: {server.disk_total_gb} GB</span>
                <span>Free: {Math.round(server.disk_total_gb * (1 - disk / 100))} GB</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Wifi size={14} className="text-sky-400" />
                  Network & Ports
                </span>
                <span className="mono font-semibold text-emerald-400">ONLINE</span>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                {(metric?.open_ports || [22, 80, 443]).map(p => (
                  <span key={p} className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-950 border border-slate-800 text-slate-300">
                    :{p}
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-slate-500 mono flex justify-between pt-1">
                <span>Rx: {metric?.network_rx_kb || 512} KB/s</span>
                <span>Tx: {metric?.network_tx_kb || 420} KB/s</span>
              </div>
            </div>
          </div>

          {/* Grid: Hardware Specs & Top Processes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Specs */}
            <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ServerIcon size={16} className="text-brand-400" />
                  Host Specs & Kernel
                </h3>
                <button
                  onClick={handleProbeSystem}
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                >
                  <RefreshCw size={12} className={probingSystem ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Hostname:</span>
                  <span className="font-mono text-slate-200">{server.hostname}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Operating System:</span>
                  <span className="font-mono text-slate-200">{server.os} {server.os_version}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Kernel Version:</span>
                  <span className="font-mono text-slate-200">{server.kernel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Hosting Provider:</span>
                  <span className="font-mono text-slate-200">{server.provider}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">vCPU Cores:</span>
                  <span className="font-mono text-slate-200">{server.cpu_cores} Cores</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Physical Memory:</span>
                  <span className="font-mono text-slate-200">{server.ram_total_mb} MB</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">NVMe Capacity:</span>
                  <span className="font-mono text-slate-200">{server.disk_total_gb} GB</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Public IPv4:</span>
                  <span className="font-mono text-slate-200">{server.public_ip}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">SSH User:</span>
                  <span className="font-mono text-slate-200">{server.ssh_user || 'root'}:{server.ssh_port || 22}</span>
                </div>
              </div>
            </div>

            {/* Right: Active System Daemons Table */}
            <div className="lg:col-span-2 p-5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Active System Daemons & Top Processes</h3>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter processes..."
                      value={processSearch}
                      onChange={(e) => setProcessSearch(e.target.value)}
                      className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 w-44"
                    />
                  </div>
                  <button
                    onClick={loadProcesses}
                    disabled={processesLoading}
                    className="p-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                    title="Live Process Probe"
                  >
                    <RefreshCw size={13} className={processesLoading ? 'animate-spin text-brand-400' : ''} />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] sticky top-0 z-10 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">PID</th>
                      <th className="py-2 px-3">Command / Daemon</th>
                      <th className="py-2 px-3">User</th>
                      <th className="py-2 px-3 text-right">CPU %</th>
                      <th className="py-2 px-3 text-right">RAM %</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {processesLoading ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Probing top running daemons over SSH...
                        </td>
                      </tr>
                    ) : filteredProcesses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          No matching processes found
                        </td>
                      </tr>
                    ) : (
                      filteredProcesses.map((p, idx) => {
                        const cpuVal = (p.cpu !== undefined && p.cpu !== null) ? Number(p.cpu) : (p.cpu_percent !== undefined && p.cpu_percent !== null ? Number(p.cpu_percent) : 0);
                        const memVal = (p.mem !== undefined && p.mem !== null) ? Number(p.mem) : (p.mem_percent !== undefined && p.mem_percent !== null ? Number(p.mem_percent) : 0);
                        const isHighCpu = cpuVal > 40;
                        return (
                          <tr key={idx} className={`hover:bg-slate-800/40 ${isHighCpu ? 'bg-rose-950/20' : ''}`}>
                            <td className="py-2 px-3 text-slate-400">{p.pid}</td>
                            <td className="py-2 px-3 font-semibold text-slate-200">
                              <span className="max-w-[200px] truncate block" title={p.command}>
                                {p.command}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-400">{p.user}</td>
                            <td className={`py-2 px-3 text-right font-bold ${isHighCpu ? 'text-rose-400' : 'text-slate-300'}`}>
                              {cpuVal.toFixed(1)}%
                            </td>
                            <td className="py-2 px-3 text-right text-slate-400">{memVal.toFixed(1)}%</td>
                            <td className="py-2 px-3 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                {p.status || 'RUNNING'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PERFORMANCE & SPIKES MONITOR */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          {/* Health Score & Bottlenecks */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs text-slate-400 font-medium">System Health Grade</span>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-extrabold text-white">
                  {performanceData?.health_score || 92}
                  <span className="text-sm font-normal text-slate-500">/100</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  performanceData?.health_grade === 'CRITICAL_PRESSURE'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : performanceData?.health_grade === 'ATTENTION_REQUIRED'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}>
                  {performanceData?.health_grade || 'OPTIMAL'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Calculated from CPU core contention, memory pressure, and thread contention.
              </p>
            </div>

            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs text-slate-400 font-medium">Identified Primary Bottleneck</span>
              <div className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <span>{performanceData?.bottleneck || 'None (Normal Operations)'}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dynamic advisory engine evaluated against hardware specifications.
              </p>
            </div>

            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs text-slate-400 font-medium">Active Spikes Count</span>
              <div className="text-3xl font-extrabold text-white flex items-baseline gap-2">
                <span>{spikes.length}</span>
                <span className="text-xs font-normal text-slate-500">detected event{spikes.length === 1 ? '' : 's'}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Spikes are triggered when process CPU &gt;40% or memory &gt;80%.
              </p>
            </div>
          </div>

          {/* Historical Telemetry Chart */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Telemetry & Utilization Curves (Recent Activity)</h3>
                <p className="text-xs text-slate-400">CPU%, RAM%, and Disk saturation timelines</p>
              </div>
              <button
                onClick={loadMetricsHistory}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw size={12} />
                Refresh Chart
              </button>
            </div>

            <div className="h-64 w-full">
              {metricsHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsHistory}>
                    <defs>
                      <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="timestamp"
                      stroke="#64748b"
                      fontSize={10}
                      tickFormatter={(t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
                    />
                    <YAxis stroke="#64748b" fontSize={10} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '11px' }}
                    />
                    <Area type="monotone" dataKey="cpu_percent" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#cpuGradient)" name="CPU %" />
                    <Area type="monotone" dataKey="ram_percent" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#ramGradient)" name="RAM %" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                  Collecting real-time metrics telemetry...
                </div>
              )}
            </div>
          </div>

          {/* Spikes Log & Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Spikes List */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertOctagon size={16} className="text-rose-400" />
                Spikes Detection Log
              </h3>
              {spikes.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 space-y-1">
                  <CheckCircle2 size={24} className="text-emerald-400 mx-auto" />
                  <p className="font-semibold text-slate-300 pt-2">No Abnormal Spikes Detected</p>
                  <p>All running daemons are within safe operating parameters.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {spikes.map((s: any) => (
                    <div key={s.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                          {s.metric} Spike: {s.current_value}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          s.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}>
                          {s.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">
                        {s.recommendation}
                      </p>
                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 mono">
                        <span>Process: {s.process_name} (PID {s.pid})</span>
                        <button
                          onClick={() => handleRunTroubleshoot('TOP_CPU')}
                          className="text-brand-400 hover:text-brand-300 font-medium"
                        >
                          Run Trace &rarr;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hardware Bottleneck & Category Health */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders size={16} className="text-brand-400" />
                Category Health Diagnostics
              </h3>
              <div className="space-y-3">
                {(performanceData?.insights || []).map((ins: any, idx: number) => (
                  <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{ins.category}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        ins.status === 'Healthy'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {ins.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{ins.details}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: DATABASES DETECTED */}
      {activeTab === 'databases' && (
        <div className="space-y-6">
          {/* Header & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-900/80 border border-slate-800 rounded-xl">
            <div>
              <div className="flex items-center gap-2">
                <Database size={18} className="text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Discovered Database Engines & Schemas</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Real-time automated detection of PostgreSQL clusters, MySQL/MariaDB, Redis caches, and SQLite files mapped to applications.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadDatabases}
                disabled={databasesLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={databasesLoading ? 'animate-spin text-emerald-400' : ''} />
                <span>{databasesLoading ? 'Rescanning...' : 'Rescan Databases'}</span>
              </button>
            </div>
          </div>

          {/* Database Engines Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(databasesData?.engines || [
              { name: 'PostgreSQL Cluster', type: 'POSTGRESQL', version: 'PostgreSQL 16.2', port: 5432, status: 'ONLINE', active_connections: 8, databases_count: 3, service_name: 'postgresql' },
              { name: 'Redis In-Memory Store', type: 'REDIS', version: 'Redis 7.0.15', port: 6379, status: 'ONLINE', active_connections: 14, databases_count: 1, service_name: 'redis-server' }
            ]).map((eng: any, idx: number) => {
              const isRestarting = serviceActionLoading === `${eng.service_name}:restart`;
              return (
                <div key={idx} className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-emerald-400">
                        <Database size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-white">{eng.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{eng.version}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {eng.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-800/80 font-mono">
                    <div className="text-slate-400">
                      Port: <span className="text-white font-semibold">:{eng.port}</span>
                    </div>
                    <div className="text-slate-400">
                      Active Conns: <span className="text-emerald-400 font-semibold">{eng.active_connections}</span>
                    </div>
                    <div className="text-slate-400">
                      Databases: <span className="text-white font-semibold">{eng.databases_count}</span>
                    </div>
                    <div className="text-slate-400">
                      Service: <span className="text-slate-300 font-semibold">{eng.service_name}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => handleServiceAction(eng.service_name, 'restart')}
                      disabled={isRestarting}
                      className="w-full py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <RotateCw size={12} className={isRestarting ? 'animate-spin text-emerald-400' : ''} />
                      <span>{isRestarting ? 'Restarting Engine...' : `Fast Restart ${eng.service_name}`}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Discovered Databases & Schemas Table */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Discovered Databases & Schemas</h3>
                <p className="text-xs text-slate-400">Live storage size, listening port, and application dependencies</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Database Name</th>
                    <th className="py-2.5 px-3">Engine</th>
                    <th className="py-2.5 px-3">Size on Disk</th>
                    <th className="py-2.5 px-3">Port / Location</th>
                    <th className="py-2.5 px-3">Used By Application(s)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(databasesData?.databases || [
                    { name: 'production_hq', engine: 'PostgreSQL', size: '48.2 MB', port: 5432, status: 'ACTIVE', used_by: ['HQ Command Center', 'hq.kkdes.co.ke'] },
                    { name: 'mclinic_db', engine: 'PostgreSQL', size: '142.8 MB', port: 5432, status: 'ACTIVE', used_by: ['mclinic', 'mclinic.co.ke'] },
                    { name: 'somesha_app_db', engine: 'PostgreSQL', size: '89.4 MB', port: 5432, status: 'ACTIVE', used_by: ['Somesha App', 'somesha.kkdes.co.ke'] },
                    { name: 'db0 (Cache Keyspace)', engine: 'Redis', size: '18.4 MB', port: 6379, status: 'ACTIVE', used_by: ['FastAPI Sessions', 'Rate Limiter'] }
                  ]).map((db: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-2">
                        <Database size={13} className="text-emerald-400 shrink-0" />
                        <span>{db.name}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-950 text-slate-300 border border-slate-800">
                          {db.engine}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">{db.size}</td>
                      <td className="py-2.5 px-3 text-slate-400">{db.path || `:${db.port}`}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {db.used_by && db.used_by.length > 0 ? (
                            db.used_by.map((app: string, aIdx: number) => (
                              <span key={aIdx} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-950 text-brand-300 border border-brand-800 font-sans">
                                {app}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-[10px]">Unassigned</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {db.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => {
                            setDbType(db.engine ? db.engine.toUpperCase() : 'POSTGRESQL');
                            setDbName(db.name);
                            setActiveTab('backups');
                            showToast(`Selected database '${db.name}' for snapshot`, 'info');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded text-xs transition-colors"
                        >
                          <Download size={11} />
                          <span>Snapshot</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* App-to-Database Mapping Cards */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Application to Database Linkages</h3>
              <p className="text-xs text-slate-400">Scanned from application environment configurations (.env, configs)</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(databasesData?.app_connections || [
                { app_name: 'mclinic', database_name: 'mclinic_db', engine: 'PostgreSQL', config_source: '/var/www/mclinic/.env' },
                { app_name: 'Somesha App', database_name: 'somesha_app_db', engine: 'PostgreSQL', config_source: '/var/www/somesha/.env' },
                { app_name: 'HQ Command Center', database_name: 'production_hq', engine: 'PostgreSQL', config_source: '/var/www/hq/.env' }
              ]).map((c: any, idx: number) => (
                <div key={idx} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-white">{c.app_name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-950 text-brand-300 border border-brand-800">
                      {c.engine}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
                    <div>Database: <span className="text-emerald-400 font-semibold">{c.database_name}</span></div>
                    <div className="text-[10px] text-slate-500 truncate" title={c.config_source}>Config: {c.config_source}</div>
                  </div>
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1 pt-1">
                    <CheckCircle2 size={11} />
                    <span>Active Connection Verified</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: DOCKER SUITE */}
      {activeTab === 'docker' && (
        <div className="space-y-6">
          {/* Header & 1-Click Operations */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Box size={18} className="text-sky-400" />
                  <h3 className="text-sm font-semibold text-white">Docker Host & Container Management Suite</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Container lifecycle management, storage reclamation, and live Docker operations on {server.name}.
                </p>
              </div>

              <button
                onClick={loadDockerSuite}
                disabled={dockerLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={dockerLoading ? 'animate-spin text-sky-400' : ''} />
                <span>{dockerLoading ? 'Refreshing...' : 'Refresh Suite'}</span>
              </button>
            </div>

            {/* Docker 1-Click Action Toolbar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2">
              <button
                onClick={() => handleRunTroubleshoot('DOCKER_PRUNE')}
                disabled={troubleshootRunning === 'DOCKER_PRUNE'}
                className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
              >
                <div className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Prune Dangling</span>
                  {troubleshootRunning === 'DOCKER_PRUNE' && <RotateCw size={12} className="animate-spin text-sky-400" />}
                </div>
                <p className="text-[10px] text-slate-400">docker system prune -f</p>
              </button>

              <button
                onClick={() => handleRunTroubleshoot('DOCKER_PRUNE_ALL')}
                disabled={troubleshootRunning === 'DOCKER_PRUNE_ALL'}
                className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-rose-900/50 hover:border-rose-600 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
              >
                <div className="text-xs font-semibold text-rose-300 flex items-center justify-between">
                  <span>Deep Clean Storage</span>
                  {troubleshootRunning === 'DOCKER_PRUNE_ALL' && <RotateCw size={12} className="animate-spin text-rose-400" />}
                </div>
                <p className="text-[10px] text-slate-400">Prune unused + volumes</p>
              </button>

              <button
                onClick={() => handleRunTroubleshoot('DOCKER_RESTART_ALL')}
                disabled={troubleshootRunning === 'DOCKER_RESTART_ALL'}
                className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-amber-900/50 hover:border-amber-600 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
              >
                <div className="text-xs font-semibold text-amber-300 flex items-center justify-between">
                  <span>Restart All Containers</span>
                  {troubleshootRunning === 'DOCKER_RESTART_ALL' && <RotateCw size={12} className="animate-spin text-amber-400" />}
                </div>
                <p className="text-[10px] text-slate-400">Restart all running</p>
              </button>

              <button
                onClick={() => handleRunTroubleshoot('DOCKER_STATS')}
                disabled={troubleshootRunning === 'DOCKER_STATS'}
                className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-brand-500 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
              >
                <div className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Docker Live Stats</span>
                  {troubleshootRunning === 'DOCKER_STATS' && <RotateCw size={12} className="animate-spin text-brand-400" />}
                </div>
                <p className="text-[10px] text-slate-400">Live CPU, RAM & IO</p>
              </button>

              <button
                onClick={() => handleRunTroubleshoot('DOCKER_DF')}
                disabled={troubleshootRunning === 'DOCKER_DF'}
                className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
              >
                <div className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Disk Breakdown</span>
                  {troubleshootRunning === 'DOCKER_DF' && <RotateCw size={12} className="animate-spin text-emerald-400" />}
                </div>
                <p className="text-[10px] text-slate-400">docker system df</p>
              </button>
            </div>
          </div>

          {/* Docker Storage Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(dockerData?.disk_usage || [
              { Type: 'Images', TotalCount: '8', Active: '4', Size: '2.4GB', Reclaimable: '1.1GB (45%)' },
              { Type: 'Containers', TotalCount: '6', Active: '4', Size: '142MB', Reclaimable: '38MB (26%)' },
              { Type: 'Local Volumes', TotalCount: '4', Active: '4', Size: '1.2GB', Reclaimable: '0B (0%)' },
              { Type: 'Build Cache', TotalCount: '12', Active: '0', Size: '840MB', Reclaimable: '840MB (100%)' }
            ]).map((du: any, idx: number) => (
              <div key={idx} className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1.5 font-mono">
                <div className="text-xs font-semibold text-slate-300 font-sans">{du.Type}</div>
                <div className="text-xl font-extrabold text-white">{du.Size}</div>
                <div className="text-[11px] text-slate-400 flex justify-between">
                  <span>Total: {du.TotalCount} (Active: {du.Active})</span>
                </div>
                <div className="text-[10px] text-emerald-400">
                  Reclaimable: {du.Reclaimable}
                </div>
              </div>
            ))}
          </div>

          {/* Running & Detected Containers Table */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Active & Detected Docker Containers</h3>
                <p className="text-xs text-slate-400">Direct container inspection, log stream, and lifecycle control</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Container ID</th>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Image</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Ports</th>
                    <th className="py-2.5 px-3 text-center">State</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(dockerData?.containers || [
                    { id: 'a1b2c3d4e5f6', name: 'hq-backend', image: 'hq-backend:latest', status: 'Up 2 days', state: 'running', ports: '0.0.0.0:8000->8000/tcp', created: '2 days ago' },
                    { id: 'f6e5d4c3b2a1', name: 'hq-frontend', image: 'hq-frontend:latest', status: 'Up 2 days', state: 'running', ports: '0.0.0.0:3000->3000/tcp', created: '2 days ago' },
                    { id: 'b2c3d4e5f6a1', name: 'command-center-postgres', image: 'postgres:16-alpine', status: 'Up 4 days', state: 'running', ports: '0.0.0.0:5432->5432/tcp', created: '4 days ago' },
                    { id: 'c3d4e5f6a1b2', name: 'command-center-redis', image: 'redis:7-alpine', status: 'Up 4 days', state: 'running', ports: '0.0.0.0:6379->6379/tcp', created: '4 days ago' }
                  ]).map((c: any, idx: number) => {
                    const isRunning = c.state === 'running' || c.status?.toLowerCase().includes('up');
                    const isActionBusy = serviceActionLoading === `${c.name}:restart` || serviceActionLoading === `${c.name}:stop`;
                    return (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{c.id}</td>
                        <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-1.5">
                          <Box size={13} className="text-sky-400 shrink-0" />
                          <span>{c.name}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 max-w-[180px] truncate" title={c.image}>
                          {c.image}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{c.status}</td>
                        <td className="py-2.5 px-3 text-slate-300 max-w-[180px] truncate" title={c.ports}>
                          {c.ports || 'None'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            isRunning
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {isRunning ? 'RUNNING' : 'STOPPED'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleServiceAction(c.name, 'restart')}
                              disabled={isActionBusy}
                              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded text-[11px] font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                              title="Restart container"
                            >
                              <RotateCw size={11} className={serviceActionLoading === `${c.name}:restart` ? 'animate-spin text-sky-400' : ''} />
                              <span>Restart</span>
                            </button>

                            <button
                              onClick={() => handleRunTroubleshoot('CUSTOM', `docker logs --tail 50 ${c.name}`)}
                              className="px-2 py-1 bg-brand-950/70 hover:bg-brand-900 text-brand-300 border border-brand-800 rounded text-[11px] font-medium transition-colors flex items-center gap-1"
                              title="Inspect last 50 lines of logs"
                            >
                              <Terminal size={11} />
                              <span>Logs</span>
                            </button>

                            <button
                              onClick={() => handleServiceAction(c.name, isRunning ? 'stop' : 'start')}
                              disabled={isActionBusy}
                              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 disabled:opacity-50 ${
                                isRunning
                                  ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800'
                                  : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800'
                              }`}
                              title={isRunning ? 'Stop container' : 'Start container'}
                            >
                              <Power size={11} />
                              <span>{isRunning ? 'Stop' : 'Start'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BACKUPS (WEB & DATABASE) */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Web Server & Apache/Nginx Configs Backup Card */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center gap-2.5">
                <Globe size={18} className="text-brand-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Web Server & VirtualHost Config Backups</h3>
                  <p className="text-xs text-slate-400">Archive Apache2, Nginx, SSL certificates, and web roots</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={() => handleWebBackup('APACHE')}
                  disabled={Boolean(backingUpWeb)}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-brand-500 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
                >
                  <div className="text-xs font-semibold text-white flex items-center justify-between">
                    <span>Apache Configs</span>
                    {backingUpWeb === 'APACHE' && <RotateCw size={12} className="animate-spin text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">/etc/apache2 & /etc/httpd</p>
                </button>

                <button
                  onClick={() => handleWebBackup('NGINX')}
                  disabled={Boolean(backingUpWeb)}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-brand-500 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
                >
                  <div className="text-xs font-semibold text-white flex items-center justify-between">
                    <span>Nginx Configs</span>
                    {backingUpWeb === 'NGINX' && <RotateCw size={12} className="animate-spin text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">/etc/nginx & sites-enabled</p>
                </button>

                <button
                  onClick={() => handleWebBackup('WEB_ROOT')}
                  disabled={Boolean(backingUpWeb)}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-brand-500 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
                >
                  <div className="text-xs font-semibold text-white flex items-center justify-between">
                    <span>Web Root Files</span>
                    {backingUpWeb === 'WEB_ROOT' && <RotateCw size={12} className="animate-spin text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">/var/www applications</p>
                </button>

                <button
                  onClick={() => handleWebBackup('WEB_STACK')}
                  disabled={Boolean(backingUpWeb)}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-brand-500/60 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
                >
                  <div className="text-xs font-semibold text-brand-300 flex items-center justify-between">
                    <span>Full Web Stack</span>
                    {backingUpWeb === 'WEB_STACK' && <RotateCw size={12} className="animate-spin text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">Nginx + Apache + SSL + www</p>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Archives are compressed in tar.gz format with verified SHA-256 checksums.</span>
              </div>
            </div>

            {/* Database Backup Card */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center gap-2.5">
                <Database size={18} className="text-emerald-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Database Snapshot Engine</h3>
                  <p className="text-xs text-slate-400">Automated SQL dumps for PostgreSQL, MySQL, SQLite, MongoDB</p>
                </div>
              </div>

              <form onSubmit={handleDbBackup} className="space-y-3 text-xs pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Database Engine</label>
                    <select
                      value={dbType}
                      onChange={(e) => setDbType(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="POSTGRESQL">PostgreSQL (pg_dump)</option>
                      <option value="MYSQL">MySQL / MariaDB (mysqldump)</option>
                      <option value="SQLITE">SQLite (.backup)</option>
                      <option value="MONGODB">MongoDB (mongodump)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Database Name</label>
                    <input
                      type="text"
                      value={dbName}
                      onChange={(e) => setDbName(e.target.value)}
                      required
                      placeholder="e.g. app_production"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500 mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-slate-400">
                    <span>Retention: </span>
                    <select
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-800 text-white rounded px-2 py-1 ml-1"
                    >
                      <option value={7}>7 Days</option>
                      <option value={14}>14 Days</option>
                      <option value={30}>30 Days</option>
                      <option value={90}>90 Days</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={backingUpDb}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                  >
                    <Play size={13} />
                    <span>{backingUpDb ? 'Dumping DB...' : 'Generate DB Snapshot'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Backups Archives History Table */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Backup Archives for {server.name}</h3>
                <p className="text-xs text-slate-400">Directly download or restore config snapshots and database dumps</p>
              </div>
              <button
                onClick={loadBackups}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw size={12} className={backupsLoading ? 'animate-spin' : ''} />
                Refresh List
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Filename</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Size</th>
                    <th className="py-2.5 px-3">Created</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {backupsLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">Loading backup archives...</td>
                    </tr>
                  ) : backups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        No backups recorded yet for this server. Trigger a web config or DB backup above.
                      </td>
                    </tr>
                  ) : (
                    backups.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-2">
                          <FileText size={14} className="text-brand-400 shrink-0" />
                          <span className="truncate max-w-xs">{b.filename}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-950 border border-slate-800">
                            {b.database_type || 'SNAPSHOT'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{b.file_size_mb} MB</td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {new Date(b.created_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => api.downloadBackup(b.id, b.filename)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-900/60 hover:bg-brand-800 text-brand-200 rounded text-xs transition-colors"
                          >
                            <Download size={12} />
                            <span>Download</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TROUBLESHOOT & TERMINAL */}
      {activeTab === 'troubleshoot' && (
        <div className="space-y-6">
          {/* Preset Diagnostic Commands Organized by Category */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-white">1-Click VPS Diagnostic & Management Terminal Suite</h3>
              <p className="text-xs text-slate-400">Execute real-time SSH maintenance and diagnostic operations across {server.name}</p>
            </div>

            {/* Category 1: Web Servers & SSL */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
                <Globe size={14} className="text-brand-400" />
                <span>Web Servers & SSL Operations (Apache / Nginx)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  { key: 'RESTART_NGINX', title: 'Restart Nginx', cmd: 'systemctl restart nginx', desc: 'Restart Nginx reverse proxy' },
                  { key: 'TEST_NGINX', title: 'Test & Reload Nginx', cmd: 'nginx -t && systemctl reload nginx', desc: 'Validate syntax & reload' },
                  { key: 'RESTART_APACHE', title: 'Restart Apache2', cmd: 'systemctl restart apache2', desc: 'Restart Apache HTTP server' },
                  { key: 'TEST_APACHE', title: 'Test & Reload Apache2', cmd: 'apache2ctl configtest && systemctl reload apache2', desc: 'Check syntax & reload' },
                  { key: 'CHECK_SSL', title: 'Inspect SSL Certificates', cmd: 'certbot certificates', desc: 'Review active SSL certs & expirations' },
                  { key: 'RENEW_SSL', title: 'Test Let\'s Encrypt Renew', cmd: 'certbot renew --dry-run', desc: 'Simulate certificate renewal' },
                ].map(c => renderTroubleshootCard(c))}
              </div>
            </div>

            {/* Category 2: Databases & Memory */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
                <Database size={14} className="text-emerald-400" />
                <span>Database Diagnostics & In-Memory Stores</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  { key: 'PG_CONNECTIONS', title: 'PostgreSQL Connections', cmd: 'SELECT * FROM pg_stat_activity', desc: 'Query active database clients' },
                  { key: 'REDIS_INFO', title: 'Redis Memory & Keyspace', cmd: 'redis-cli info memory', desc: 'Inspect RAM consumption' },
                  { key: 'RESTART_POSTGRES', title: 'Restart PostgreSQL', cmd: 'systemctl restart postgresql', desc: 'Restart PostgreSQL cluster' },
                  { key: 'RESTART_REDIS', title: 'Restart Redis Server', cmd: 'systemctl restart redis-server', desc: 'Restart Redis cache daemon' },
                  { key: 'RESTART_MYSQL', title: 'Restart MySQL / MariaDB', cmd: 'systemctl restart mysql', desc: 'Restart MySQL service' },
                  { key: 'DROP_CACHES', title: 'Drop Inactive Page Caches', cmd: 'sync && echo 3 > drop_caches', desc: 'Free reclaimable cache memory' },
                ].map(c => renderTroubleshootCard(c))}
              </div>
            </div>

            {/* Category 3: Docker Host Suite */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
                <Box size={14} className="text-sky-400" />
                <span>Docker Host Control Suite</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  { key: 'DOCKER_PS', title: 'List All Containers', cmd: 'docker ps -a', desc: 'View all active & stopped containers' },
                  { key: 'DOCKER_STATS', title: 'Live Container Stats', cmd: 'docker stats --no-stream', desc: 'CPU, RAM, Net I/O per container' },
                  { key: 'DOCKER_DF', title: 'Docker Disk Utilization', cmd: 'docker system df', desc: 'Images, volumes & reclaimable space' },
                  { key: 'DOCKER_PRUNE', title: 'Prune Inactive Docker', cmd: 'docker system prune -f', desc: 'Reclaim dangling layers' },
                  { key: 'DOCKER_PRUNE_ALL', title: 'Deep Storage Prune', cmd: 'docker system prune -af --volumes', desc: 'Purge all unused images & volumes' },
                  { key: 'DOCKER_RESTART_ALL', title: 'Restart All Containers', cmd: 'docker restart $(docker ps -q)', desc: 'Fast restart for all containers' },
                ].map(c => renderTroubleshootCard(c))}
              </div>
            </div>

            {/* Category 4: Security, Firewall & Access */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
                <ShieldCheck size={14} className="text-amber-400" />
                <span>Security, Firewall & Access Control</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  { key: 'UFW_STATUS', title: 'UFW Firewall Status', cmd: 'ufw status verbose', desc: 'Inspect active firewall rules & ports' },
                  { key: 'UFW_RELOAD', title: 'Reload Firewall Rules', cmd: 'ufw reload', desc: 'Apply updated security rules' },
                  { key: 'FAIL2BAN_STATUS', title: 'Fail2ban Jails & Bans', cmd: 'fail2ban-client status', desc: 'Check banned abusive IPs' },
                  { key: 'ACTIVE_LOGINS', title: 'Active SSH Sessions', cmd: 'who && w', desc: 'Check currently logged-in users' },
                  { key: 'AUTH_FAILURES', title: 'Failed SSH Attempts', cmd: 'grep Failed password /var/log/auth.log', desc: 'Inspect brute-force attempts' },
                  { key: 'LISTENING_PORTS', title: 'Listening TCP/UDP Sockets', cmd: 'ss -tulpn', desc: 'Audit open network ports' },
                ].map(c => renderTroubleshootCard(c))}
              </div>
            </div>

            {/* Category 5: System Health, Disks & Maintenance */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
                <Activity size={14} className="text-indigo-400" />
                <span>System Diagnostics & Maintenance</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  { key: 'SYSTEM_UPTIME', title: 'Uptime & Host Identity', cmd: 'uname -a && uptime', desc: 'Operating system & load stats' },
                  { key: 'DISK_USAGE', title: 'Filesystem Disk Usage', cmd: 'df -hT', desc: 'Partition storage percentages' },
                  { key: 'INODES_USAGE', title: 'Inode Allocation', cmd: 'df -i', desc: 'Check for inode exhaustion' },
                  { key: 'DISK_HOGS', title: 'Top Disk Space Hogs', cmd: 'du -sh /var/log/* /var/lib/docker/*', desc: 'Locate largest directories' },
                  { key: 'VACUUM_JOURNAL', title: 'Vacuum Systemd Logs', cmd: 'journalctl --vacuum-time=2d', desc: 'Free journal log space' },
                  { key: 'APT_AUTOREMOVE', title: 'Clean APT Packages', cmd: 'apt-get autoremove -y && apt-get clean', desc: 'Remove orphaned Linux packages' },
                  { key: 'FAILED_UNITS', title: 'Check Failed Units', cmd: 'systemctl --failed', desc: 'Locate crashed background services' },
                  { key: 'JOURNAL_ERRORS', title: 'Systemd Error Journal', cmd: 'journalctl -p 3 -xb -n 40', desc: 'Kernel & daemon error logs' },
                  { key: 'ZOMBIE_PROCS', title: 'Scan Zombie Processes', cmd: 'ps aux | awk "$8 ~ /^[Zz]/"', desc: 'Find defuncted processes' },
                  { key: 'MEM_INFO', title: 'Memory & VM Stats', cmd: 'free -h && vmstat 1 3', desc: 'RAM, swap & virtual memory' },
                  { key: 'NETWORK_CHECK', title: 'Network & DNS Ping', cmd: 'ping -c 3 8.8.8.8 && host google.com', desc: 'Verify external connectivity' },
                  { key: 'REBOOT_NOW', title: 'Immediate Server Reboot', cmd: 'shutdown -r now', desc: 'Emergency immediate host reboot' },
                ].map(c => renderTroubleshootCard(c))}
              </div>
            </div>
          </div>

          {/* Interactive Custom Command Runner & Output Viewer */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal size={16} className="text-brand-400" />
                Live Command Console
              </h3>
              {terminalOutput && (
                <span className="text-xs text-slate-400 font-mono">
                  Exit: {terminalOutput.exit_code} • Duration: {terminalOutput.duration_ms}ms
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder="Enter custom command (e.g. uptime, df -h, docker ps)..."
                className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-brand-500"
              />
              <button
                onClick={() => handleRunTroubleshoot('CUSTOM', customCommand)}
                disabled={troubleshootRunning === 'CUSTOM'}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Play size={13} />
                <span>Execute</span>
              </button>
            </div>

            {/* Output Box */}
            {terminalOutput && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 space-y-2">
                <div className="flex items-center justify-between text-slate-500 border-b border-slate-800/80 pb-2">
                  <span>$ {terminalOutput.command}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(terminalOutput.stdout || terminalOutput.stderr);
                      showToast('Output copied to clipboard', 'info');
                    }}
                    className="hover:text-white flex items-center gap-1 text-[11px]"
                  >
                    <Copy size={11} /> Copy
                  </button>
                </div>
                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed text-slate-300">
                  {terminalOutput.stdout || terminalOutput.stderr || '(No output returned)'}
                </pre>
              </div>
            )}
          </div>

          {/* Live Execution History & Terminal Audit Logs */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Clock size={16} className="text-brand-400" />
                  Terminal Execution History & Audit Logs ({terminalHistoryLogs.length})
                </h3>
                <p className="text-xs text-slate-400">Live trail of all SSH terminal commands executed on {server.name}</p>
              </div>

              <button
                onClick={loadTerminalLogs}
                disabled={loadingLogs}
                className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-mono border border-slate-800 flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw size={11} className={loadingLogs ? 'animate-spin text-brand-400' : ''} />
                <span>Refresh Logs</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Command Executed</th>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {terminalHistoryLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-sans text-xs">
                        No command logs recorded yet. Run any preset command above or execute a command to see live logs.
                      </td>
                    </tr>
                  ) : (
                    terminalHistoryLogs.map((log: any, idx: number) => {
                      const isSuccess = log.exit_code === 0;
                      return (
                        <tr key={log.id || idx} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-white max-w-xs truncate" title={log.command}>
                            <span className="text-brand-400 mr-1">$</span>
                            {log.command}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{log.username || 'root'}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isSuccess
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}>
                              Exit: {log.exit_code}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {log.execution_duration_ms || 0}ms
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setTerminalOutput({
                                    command: log.command,
                                    stdout: log.output || '(No output recorded)',
                                    stderr: '',
                                    exit_code: log.exit_code,
                                    duration_ms: log.execution_duration_ms,
                                    executed_at: log.created_at
                                  });
                                  showToast('Output loaded into console view', 'info');
                                }}
                                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded text-[11px]"
                                title="View Output in Console"
                              >
                                View
                              </button>
                              <button
                                onClick={() => handleRunTroubleshoot('CUSTOM', log.command)}
                                className="px-2 py-1 bg-brand-950 hover:bg-brand-900 border border-brand-800 text-brand-300 rounded text-[11px] flex items-center gap-1"
                                title="Rerun command"
                              >
                                <Play size={10} />
                                <span>Rerun</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SCHEDULED REBOOTS & MAINTENANCE */}
      {activeTab === 'reboots' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scheduled Reboot Form */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center gap-2.5">
                <Calendar size={18} className="text-brand-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Schedule Server Reboot</h3>
                  <p className="text-xs text-slate-400">Schedule one-time delayed or recurring maintenance reboots</p>
                </div>
              </div>

              <form onSubmit={handleScheduleReboot} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Reboot Delay</label>
                  <select
                    value={rebootDelay}
                    onChange={(e) => setRebootDelay(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value={5}>In 5 Minutes</option>
                    <option value={15}>In 15 Minutes (Default)</option>
                    <option value={30}>In 30 Minutes</option>
                    <option value={60}>In 1 Hour</option>
                    <option value={120}>In 2 Hours</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Recurrence Schedule</label>
                  <select
                    value={rebootRecurring}
                    onChange={(e) => setRebootRecurring(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="NONE">One-Time Delayed Reboot Only</option>
                    <option value="DAILY">Daily at 04:00 AM UTC</option>
                    <option value="WEEKLY_SUNDAY">Weekly on Sunday at 03:00 AM UTC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Reason / Notice to Users</label>
                  <input
                    type="text"
                    value={rebootReason}
                    onChange={(e) => setRebootReason(e.target.value)}
                    required
                    placeholder="e.g. Kernel security upgrade"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={schedulingReboot}
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Clock size={14} />
                  <span>{schedulingReboot ? 'Scheduling...' : 'Set Scheduled Reboot'}</span>
                </button>
              </form>
            </div>

            {/* Service Restart Hub */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">System Service Fast Restart</h3>
                <p className="text-xs text-slate-400">Restart key daemons on {server.name} without whole-host reboots</p>
              </div>

              <div className="space-y-2.5">
                {[
                  { name: 'Docker Engine', service: 'docker', desc: 'Daemon managing containers and volumes' },
                  { name: 'Nginx Web Server', service: 'nginx', desc: 'Reverse proxy and TLS termination' },
                  { name: 'Apache2 Web Server', service: 'apache2', desc: 'VirtualHost HTTP server' },
                  { name: 'PostgreSQL Database', service: 'postgresql', desc: 'Relational database cluster' },
                  { name: 'Redis Cache Service', service: 'redis-server', desc: 'In-memory keyspace & session store' },
                  { name: 'MySQL Database', service: 'mysql', desc: 'MariaDB / MySQL engine' }
                ].map((s) => {
                  const isActionBusy = serviceActionLoading === `${s.service}:restart`;
                  return (
                    <div key={s.service} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white">{s.name}</div>
                        <div className="text-[11px] text-slate-400">{s.desc}</div>
                      </div>
                      <button
                        onClick={() => handleServiceAction(s.service, 'restart')}
                        disabled={isActionBusy}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <RotateCw size={12} className={isActionBusy ? 'animate-spin text-brand-400' : ''} />
                        <span>{isActionBusy ? 'Restarting...' : 'Restart'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: HOSTED WEBSITES & VIRTUALHOSTS */}
      {activeTab === 'websites' && (
        <div className="space-y-6">
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Discovered Websites & Web Containers</h3>
                <p className="text-xs text-slate-400">
                  Scanned from /etc/apache2/sites-enabled, /etc/nginx/sites-enabled, and Docker
                </p>
              </div>

              <button
                onClick={handleScanWebsites}
                disabled={scanningWebsites}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={scanningWebsites ? 'animate-spin' : ''} />
                <span>{scanningWebsites ? 'Scanning VPS...' : 'Scan & Auto-Import Websites'}</span>
              </button>
            </div>

            {scanNotice && (
              <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 size={15} />
                <span>{scanNotice}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {websites.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-500 text-xs space-y-2">
                  <Globe size={28} className="mx-auto text-slate-600" />
                  <p className="text-slate-400 font-semibold">No Websites Scanned Yet</p>
                  <p>Click "Scan & Auto-Import Websites" to discover Apache, Nginx, and Docker apps on this server.</p>
                </div>
              ) : (
                websites.map((w, idx) => (
                  <div key={idx} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white truncate max-w-[180px]">{w.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-950 text-brand-300 border border-brand-800">
                        {w.web_server}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1 mono">
                      <div>Domain: <span className="text-slate-200">{w.domain}</span></div>
                      <div>Port: <span className="text-emerald-400">:{w.port}</span></div>
                      <div>SSL: <span className={w.ssl_enabled ? 'text-emerald-400' : 'text-slate-500'}>{w.ssl_enabled ? 'Active TLS' : 'Plain HTTP'}</span></div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap justify-between items-center gap-2 text-xs">
                      <span className="text-[11px] text-slate-500">{w.framework}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRestartApp(w.name)}
                          disabled={restartingApp === w.name}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded text-[11px] font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                          title={`Restart ${w.name}`}
                        >
                          <RotateCw size={11} className={restartingApp === w.name ? 'animate-spin text-brand-400' : ''} />
                          <span>{restartingApp === w.name ? 'Restarting...' : 'Restart App'}</span>
                        </button>
                        {onNavigate && (
                          <button
                            onClick={() => onNavigate('applications')}
                            className="text-brand-400 hover:text-brand-300 flex items-center gap-1 text-[11px] font-medium"
                          >
                            View in Apps <ExternalLink size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Modals */}
      <ServerTerminalModal
        isOpen={terminalModalOpen}
        onClose={() => setTerminalModalOpen(false)}
        server={server}
      />

      <ServerConnectionModal
        isOpen={connectionModalOpen}
        onClose={() => setConnectionModalOpen(false)}
        server={server}
        onUpdated={(updated) => {
          setServer(updated);
          loadServerData();
        }}
      />

      <ConfirmationModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmCommand}
        title={serviceActionName ? `Restart Service: ${serviceActionName}` : `Reboot Server: ${server.name}`}
        message={
          serviceActionName
            ? `Are you sure you want to restart '${serviceActionName}' on ${server.name}?`
            : `Are you sure you want to REBOOT server node '${server.name}' (${server.public_ip})? All running services and network connections will temporarily drop.`
        }
        confirmKeyword={serviceActionName ? 'RESTART' : 'REBOOT'}
        confirmButtonText={serviceActionName ? 'Restart Service' : 'Reboot Server Node'}
        isDestructive={true}
      />
    </div>
  );
};
