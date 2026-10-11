import React, { useEffect, useState, useMemo } from 'react';
import {
  GitBranch,
  GitPullRequest,
  GitCommit,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
  Terminal,
  Play,
  RotateCcw,
  Search,
  Folder,
  Shield,
  Clock,
  Copy,
  Check,
  Download,
  Sparkles,
  Server as ServerIcon,
  ChevronRight,
  Layers,
  Rocket
} from 'lucide-react';
import { api } from '../api/client';
import { Application } from '../types';

interface GitStatusData {
  repo_url: string;
  branch: string;
  repo_dir?: string;
  doc_root?: string;
  version?: string;
  is_git_repo: boolean;
  current_server_commit: {
    commit_hash: string;
    short_hash: string;
    author: string;
    message: string;
    date: string;
  };
  latest_remote_commit: {
    commit_hash: string;
    short_hash: string;
    author: string;
    message: string;
    date: string;
  };
  update_available: boolean;
  commits_behind: number;
  recent_commits: Array<{
    commit_hash: string;
    short_hash: string;
    author: string;
    message: string;
    date: string;
  }>;
  incoming_commits: Array<{
    commit_hash: string;
    short_hash: string;
    author: string;
    message: string;
    date: string;
  }>;
  pending_files?: Array<{
    status: string;
    code: string;
    file: string;
  }>;
  local_changes?: string[];
  total_pending_files?: number;
  command_outputs?: Record<string, any>;
  status_summary?: string;
  server_name?: string;
  server_ip?: string;
}

interface TerminalLogEntry {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  timestamp: string;
  action: string;
  success: boolean;
}

export const GitView: React.FC = () => {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  
  // Operations & Terminal State
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [terminalLog, setTerminalLog] = useState<TerminalLogEntry | null>(null);
  const [gitCardOutputs, setGitCardOutputs] = useState<Record<string, any>>({});
  const [customCommand, setCustomCommand] = useState('git status');
  const [copied, setCopied] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanSummary, setScanSummary] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'updates' | 'synced'>('all');

  const loadData = async (preferredAppId?: string) => {
    try {
      setLoading(true);
      const appList = await api.listApplications();
      setApps(appList);

      const target = preferredAppId
        ? appList.find((a) => a.id === preferredAppId) || appList[0]
        : selectedApp
        ? appList.find((a) => a.id === selectedApp.id) || appList[0]
        : appList[0];

      if (target) {
        setSelectedApp(target);
        await loadGitStatus(target.id);
      }
    } catch (e) {
      console.error('Failed to load applications:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadGitStatus = async (appId: string) => {
    try {
      setStatusLoading(true);
      const status = await api.getGitStatus(appId);
      setGitStatus(status);
      if (status?.command_outputs) {
        setGitCardOutputs(status.command_outputs);
      } else {
        setGitCardOutputs({});
      }
    } catch (err) {
      console.error('Failed to load Git status:', err);
      setGitStatus(null);
      setGitCardOutputs({});
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectApp = (app: Application) => {
    setSelectedApp(app);
    loadGitStatus(app.id);
  };

  const handleExecuteAction = async (
    action: 'pull' | 'pull_deploy' | 'fetch' | 'reset_hard' | 'status' | 'diff' | 'log' | 'custom',
    customCmd?: string
  ) => {
    if (!selectedApp) return;
    setActiveAction(action);
    try {
      const activeBranch = gitStatus?.branch || selectedApp.git_branch || 'main';
      const res = await api.executeGitAction(selectedApp.id, {
        action,
        branch: activeBranch,
        custom_command: customCmd,
      });

      setTerminalLog({
        command: res.command,
        stdout: res.stdout || (res.success ? 'Command executed successfully.' : ''),
        stderr: res.stderr || '',
        exit_code: res.exit_code,
        duration_ms: res.duration_ms,
        timestamp: new Date().toLocaleTimeString(),
        action: res.action,
        success: res.success,
      });

      setGitCardOutputs((prev) => ({
        ...prev,
        [action]: {
          command: res.command,
          output: (res.stdout || res.stderr || res.message || 'Command executed successfully.').trim(),
          status: res.success ? 'SUCCESS' : 'ERROR',
          exit_code: res.exit_code,
        },
      }));

      // Refresh Git status after pull or reset
      const freshStatus = await api.getGitStatus(selectedApp.id);
      setGitStatus(freshStatus);
      if (freshStatus?.command_outputs) {
        setGitCardOutputs({
          ...freshStatus.command_outputs,
          [action]: {
            command: res.command,
            output: (res.stdout || res.stderr || res.message || 'Command executed successfully.').trim(),
            status: res.success ? 'SUCCESS' : 'ERROR',
            exit_code: res.exit_code,
          },
        });
      }

      // Refresh applications list to update commit/version badges
      const appList = await api.listApplications();
      setApps(appList);
      const updated = appList.find((a) => a.id === selectedApp.id);
      if (updated) setSelectedApp(updated);
    } catch (err: any) {
      setTerminalLog({
        command: customCmd || `git ${action}`,
        stdout: '',
        stderr: err.message || 'Remote SSH execution failed.',
        exit_code: 1,
        duration_ms: 0,
        timestamp: new Date().toLocaleTimeString(),
        action,
        success: false,
      });
      setGitCardOutputs((prev) => ({
        ...prev,
        [action]: {
          command: customCmd || `git ${action}`,
          output: err.message || 'Remote SSH execution failed.',
          status: 'ERROR',
          exit_code: 1,
        },
      }));
    } finally {
      setActiveAction(null);
    }
  };

  const handleBatchScan = async () => {
    try {
      setScanLoading(true);
      setScanSummary(null);
      const res = await api.scanAllGitRepos();
      setScanSummary(res.message);
      await loadData(selectedApp?.id);
    } catch (err: any) {
      alert(`Batch Git scan error: ${err.message || 'Failed'}`);
    } finally {
      setScanLoading(false);
    }
  };

  const copyTerminalOutput = () => {
    if (!terminalLog) return;
    const text = `${terminalLog.command}\n\nSTDOUT:\n${terminalLog.stdout}\n\nSTDERR:\n${terminalLog.stderr}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filtered Apps List
  const filteredApps = useMemo(() => {
    return apps.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.git_branch && a.git_branch.toLowerCase().includes(searchQuery.toLowerCase()));

      const hasUpdate = a.current_commit !== a.latest_repo_commit;
      if (filterType === 'updates') return matchesSearch && hasUpdate;
      if (filterType === 'synced') return matchesSearch && !hasUpdate;
      return matchesSearch;
    });
  }, [apps, searchQuery, filterType]);

  const totalUpdatesCount = useMemo(() => {
    return apps.filter((a) => a.current_commit !== a.latest_repo_commit).length;
  }, [apps]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-950/80 border border-brand-800/80 rounded-lg text-brand-400">
              <GitBranch size={20} />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Git Source Control & Live VPS Synchronizer
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Probing live Git working trees on remote VPS over SSH as root. Automatic version detection & 1-click origin synchronization.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleBatchScan}
            disabled={scanLoading}
            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
            title="Scan remote VPS directories for all .git repositories and update application heads"
          >
            <Sparkles size={14} className={scanLoading ? 'animate-spin' : ''} />
            <span>{scanLoading ? 'Scanning VPS Repositories...' : 'Detect & Rescan All Repos'}</span>
          </button>

          <button
            onClick={() => loadData(selectedApp?.id)}
            disabled={loading}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Reload Git Status"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-brand-400' : ''} />
          </button>
        </div>
      </div>

      {/* Batch Scan Feedback Banner */}
      {scanSummary && (
        <div className="p-3.5 bg-brand-950/60 border border-brand-800/80 rounded-xl text-brand-300 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-brand-400 shrink-0" />
            <span>{scanSummary}</span>
          </div>
          <button onClick={() => setScanSummary(null)} className="text-brand-400 hover:text-brand-200">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Repository Inventory Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Layers size={13} className="text-brand-400" />
                <span>Connected Repositories ({apps.length})</span>
              </h3>
              {totalUpdatesCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800/80 animate-pulse">
                  {totalUpdatesCount} Update{totalUpdatesCount > 1 ? 's' : ''} Available
                </span>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filter repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 pt-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  filterType === 'all'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({apps.length})
              </button>
              <button
                onClick={() => setFilterType('updates')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  filterType === 'updates'
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Updates ({totalUpdatesCount})
              </button>
              <button
                onClick={() => setFilterType('synced')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  filterType === 'synced'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Up to Date ({apps.length - totalUpdatesCount})
              </button>
            </div>

            {/* Repositories Scrollable List */}
            <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
              {filteredApps.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No repositories match the search criteria.
                </div>
              ) : (
                filteredApps.map((a) => {
                  const isSelected = selectedApp?.id === a.id;
                  const hasUpdate = a.current_commit !== a.latest_repo_commit;
                  return (
                    <div
                      key={a.id}
                      onClick={() => handleSelectApp(a)}
                      className={`p-3 rounded-lg cursor-pointer border transition-all ${
                        isSelected
                          ? 'bg-slate-800 border-brand-500 shadow-md ring-1 ring-brand-500/30'
                          : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-white truncate">{a.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
                            {a.current_version || 'v1.0.0'}
                          </span>
                          {hasUpdate && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800 animate-pulse">
                              UPDATE
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <GitBranch size={11} className={a.git_branch ? 'text-indigo-400' : 'text-slate-600'} />
                          <span className={a.git_branch ? 'text-slate-200 font-semibold' : 'text-slate-500'}>
                            {a.git_branch || 'untracked'}
                          </span>
                          <span>•</span>
                          <span className="text-brand-400 font-semibold">
                            {a.current_commit ? a.current_commit.slice(0, 7) : 'no-git'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 truncate max-w-[110px]" title={a.root_path || a.domain}>
                          {a.root_path ? a.root_path.replace('/var/www/', '').replace('/home/', '~') : a.domain}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Selected Repository Inspector & Live SSH Command Center (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {selectedApp && gitStatus ? (
            <>
              {/* Repository Identity Card */}
              <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-bold text-white tracking-tight">
                        {selectedApp.name}
                      </h2>
                      {gitStatus.is_git_repo ? (
                        <>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-brand-950 text-brand-300 border border-brand-800/80">
                            {gitStatus.version || selectedApp.current_version || 'v1.0.0'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/80 flex items-center gap-1">
                            <GitBranch size={11} />
                            {gitStatus.branch || selectedApp.git_branch || 'HEAD'}
                          </span>
                        </>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-950 text-amber-300 border border-amber-800/80">
                          Untracked (No Git)
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-950 text-slate-400 border border-slate-800">
                        {selectedApp.environment}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1.5 font-mono">
                      <span className="flex items-center gap-1 text-slate-300">
                        <Folder size={12} className="text-amber-400" />
                        <span className="text-slate-500">DocRoot:</span>
                        <code className="text-amber-300">{gitStatus.doc_root || selectedApp.root_path || gitStatus.repo_dir || `/var/www/${selectedApp.name.toLowerCase()}`}</code>
                      </span>
                      {gitStatus.is_git_repo && gitStatus.repo_dir && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-slate-300">
                            <GitBranch size={12} className="text-emerald-400" />
                            <span className="text-slate-500">Target Repo:</span>
                            <code className="text-emerald-300">{gitStatus.repo_dir}</code>
                          </span>
                        </>
                      )}
                      <span>•</span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <ServerIcon size={12} className="text-indigo-400" />
                        <span>{gitStatus.server_name || selectedApp.server_name} ({gitStatus.server_ip || selectedApp.server_ip})</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 font-mono">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>SSH as root active</span>
                    </span>

                    <button
                      onClick={() => handleExecuteAction('pull_deploy')}
                      disabled={Boolean(activeAction)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 border border-emerald-500/30"
                      title="Pulls latest Git changes and runs docker compose build --no-cache && docker compose up -d && docker image prune -f"
                    >
                      <Rocket size={12} className={activeAction === 'pull_deploy' ? 'animate-spin' : ''} />
                      <span>{activeAction === 'pull_deploy' ? 'Deploying...' : 'Pull & Update Code'}</span>
                    </button>

                    <button
                      onClick={() => loadGitStatus(selectedApp.id)}
                      disabled={statusLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                      title="Execute all Git commands and refresh live state for selected application"
                    >
                      <RefreshCw size={12} className={statusLoading ? 'animate-spin' : ''} />
                      <span>{statusLoading ? 'Running...' : 'Run All Git Commands'}</span>
                    </button>
                  </div>
                </div>

                {/* Remote URL bar */}
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 text-slate-300 truncate">
                    <GitPullRequest size={13} className="text-slate-500 shrink-0" />
                    <span className="text-slate-500">Origin URL:</span>
                    <span className="text-brand-300 truncate">
                      {gitStatus.repo_url || selectedApp.repo_url || (gitStatus.is_git_repo ? 'Local Git Repository' : 'None configured (Untracked directory)')}
                    </span>
                  </div>
                  {gitStatus.repo_url && gitStatus.repo_url.startsWith('http') && (
                    <a
                      href={gitStatus.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] shrink-0 ml-2"
                    >
                      <span>Open Git</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>

              {/* HERO ALERT / PENDING CHANGES BANNER (Strictly Scoped to Selected Application) */}
              {!gitStatus.is_git_repo ? (
                <div className="p-5 rounded-xl bg-slate-900 border border-amber-600/50 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400">
                      <Folder size={22} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>No Git Working Tree Detected at Document Root</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">
                          UNTRACKED
                        </span>
                      </h3>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Document root <code className="text-amber-300 font-mono">{gitStatus.doc_root || selectedApp.root_path || gitStatus.repo_dir}</code> is active on the VPS, but is not initialized as a Git working tree.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    This website serves files directly from the filesystem or a build artifact directory without a local <code className="text-slate-300">.git</code> folder.
                  </p>
                </div>
              ) : (gitStatus.update_available || (gitStatus.local_changes && gitStatus.local_changes.length > 0)) ? (
                <div className="p-5 rounded-xl bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/40 border border-amber-600/80 shadow-lg space-y-4 animate-in fade-in">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400 shrink-0">
                        <Download size={22} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                          <span>Pending Changes for {selectedApp.name}:</span>
                          {gitStatus.update_available && (
                            <span className="px-2 py-0.5 rounded text-xs font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              {gitStatus.total_pending_files || gitStatus.pending_files?.length || 1} Pending File Change{(gitStatus.total_pending_files || gitStatus.pending_files?.length || 1) !== 1 ? 's' : ''} on Origin
                            </span>
                          )}
                          {gitStatus.local_changes && gitStatus.local_changes.length > 0 && (
                            <span className="px-2 py-0.5 rounded text-xs font-mono bg-sky-500/20 text-sky-300 border border-sky-500/40">
                              {gitStatus.local_changes.length} Local Modified File{gitStatus.local_changes.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-amber-200/90 mt-0.5 break-words">
                          Target directory <strong className="text-emerald-300 font-mono">{gitStatus.repo_dir}</strong> on branch <strong className="text-white font-mono">origin/{gitStatus.branch}</strong>. Pulling only updates <strong className="text-white">{selectedApp.name}</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:justify-end">
                      <button
                        onClick={() => handleExecuteAction('pull_deploy')}
                        disabled={Boolean(activeAction)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-950/50 transition-all active:scale-95 border border-emerald-400/40 ring-1 ring-emerald-400/20"
                        title="Pulls latest changes, runs: docker compose build --no-cache && docker compose up -d && docker image prune -f, and automatically refreshes application status"
                      >
                        <Rocket size={14} className={activeAction === 'pull_deploy' ? 'animate-spin' : ''} />
                        <span>
                          {activeAction === 'pull_deploy'
                            ? `Pulling & Deploying (${selectedApp.name})...`
                            : `Pull & Update Code (Docker Deploy)`}
                        </span>
                      </button>

                      <button
                        onClick={() => handleExecuteAction('pull')}
                        disabled={Boolean(activeAction)}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
                        title="Only executes git pull without rebuilding Docker containers"
                      >
                        <Download size={13} className={activeAction === 'pull' ? 'animate-spin' : ''} />
                        <span>{activeAction === 'pull' ? `Pulling ${selectedApp.name}...` : `Pull Git Only`}</span>
                      </button>

                      <button
                        onClick={() => handleExecuteAction('reset_hard')}
                        disabled={Boolean(activeAction)}
                        className="flex items-center gap-1.5 px-3 py-2.5 bg-rose-950/80 hover:bg-rose-900 disabled:opacity-50 text-rose-300 border border-rose-800 rounded-lg text-xs font-semibold transition-colors"
                        title="Executes `git fetch origin && git reset --hard origin/<branch>`"
                      >
                        <RotateCcw size={13} className={activeAction === 'reset_hard' ? 'animate-spin' : ''} />
                        <span>Force Reset</span>
                      </button>
                    </div>
                  </div>

                  {/* Pending File Changes Breakdown */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {gitStatus.pending_files && gitStatus.pending_files.length > 0 && (
                      <div className="p-3.5 bg-black/50 rounded-lg border border-amber-800/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            Pending Remote File Changes ({gitStatus.total_pending_files || gitStatus.pending_files.length})
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            HEAD..origin/{gitStatus.branch}
                          </span>
                        </div>
                        <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                          {gitStatus.pending_files.map((pf, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs font-mono py-1 px-2 rounded bg-slate-900/70 border border-slate-800/80">
                              <span className="text-slate-200 truncate">{pf.file}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ml-2 ${
                                pf.status === 'ADDED'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : pf.status === 'DELETED'
                                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                  : 'bg-amber-950 text-amber-400 border border-amber-800'
                              }`}>
                                {pf.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {gitStatus.local_changes && gitStatus.local_changes.length > 0 && (
                      <div className="p-3.5 bg-black/50 rounded-lg border border-sky-800/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                            Local Working Tree Changes ({gitStatus.local_changes.length})
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            git status --short
                          </span>
                        </div>
                        <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                          {gitStatus.local_changes.map((line, idx) => (
                            <div key={idx} className="text-xs font-mono py-1 px-2 rounded bg-slate-900/70 border border-slate-800/80 text-sky-200 truncate">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Concise Incoming Commits Summary (Capped at Top 5) */}
                  {gitStatus.incoming_commits && gitStatus.incoming_commits.length > 0 && (
                    <div className="p-3 bg-black/40 rounded-lg border border-amber-800/40 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                          Latest Pending Commits Summary (Top {gitStatus.incoming_commits.slice(0, 5).length}):
                        </span>
                        {gitStatus.commits_behind > 5 && (
                          <span className="text-[10px] font-mono text-slate-400">
                            Showing latest 5 of {gitStatus.commits_behind} pending commits
                          </span>
                        )}
                      </div>
                      {gitStatus.incoming_commits.slice(0, 5).map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2 text-slate-200 truncate">
                            <span className="text-amber-400 font-bold">{c.short_hash}</span>
                            <span className="text-slate-300 truncate">{c.message}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0 ml-2">{c.author} • {c.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs text-emerald-300">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span className="break-words">Working copy for <strong>{selectedApp.name}</strong> ({gitStatus.repo_dir}) is fully synchronized with origin/{gitStatus.branch}.</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleExecuteAction('pull_deploy')}
                      disabled={Boolean(activeAction)}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold border border-emerald-500/40 shadow-sm transition-all flex items-center gap-1.5"
                      title="Pulls origin and runs docker compose build --no-cache && docker compose up -d && docker image prune -f"
                    >
                      <Rocket size={12} className={activeAction === 'pull_deploy' ? 'animate-spin' : ''} />
                      <span>{activeAction === 'pull_deploy' ? 'Deploying...' : 'Pull & Update Code (Deploy)'}</span>
                    </button>
                    <button
                      onClick={() => handleExecuteAction('pull')}
                      disabled={Boolean(activeAction)}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <Download size={12} className={activeAction === 'pull' ? 'animate-spin' : ''} />
                      <span>{activeAction === 'pull' ? 'Pulling...' : `Pull Git Only`}</span>
                    </button>
                    <button
                      onClick={() => loadGitStatus(selectedApp.id)}
                      disabled={statusLoading}
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors"
                      title="Refresh Git Status"
                    >
                      <RefreshCw size={12} className={statusLoading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
              )}

              {/* Live Git Command Cards (Auto-Executed Results Displayed Directly on Cards) */}
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Terminal size={14} className="text-brand-400" />
                    <span>Live Git Command Cards & Results ({selectedApp.name})</span>
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Auto-executed in {gitStatus.repo_dir || selectedApp.root_path}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {[
                    {
                      key: 'status' as const,
                      title: 'Git Status',
                      subtitle: 'Working Tree & Branch State',
                      defaultCmd: 'git status -sb',
                      icon: CheckCircle2,
                    },
                    {
                      key: 'fetch' as const,
                      title: 'Fetch Remote',
                      subtitle: 'Origin Tracking & Upstream',
                      defaultCmd: 'git fetch --all --prune && git remote -v',
                      icon: RefreshCw,
                    },
                    {
                      key: 'diff' as const,
                      title: 'Inspect Diff',
                      subtitle: 'Pending Application File Changes',
                      defaultCmd: `git diff --stat HEAD..origin/${gitStatus.branch || 'main'}`,
                      icon: GitPullRequest,
                    },
                    {
                      key: 'log' as const,
                      title: 'Commit Graph',
                      subtitle: 'Recent Commit Trajectory',
                      defaultCmd: 'git log --graph --oneline -n 8',
                      icon: GitCommit,
                    },
                    {
                      key: 'pull_deploy' as const,
                      title: 'Pull & Update Code',
                      subtitle: 'Pull + Docker Compose Rebuild',
                      defaultCmd: `git pull origin ${gitStatus.branch || 'main'} && docker compose build --no-cache && docker compose up -d && docker image prune -f`,
                      icon: Rocket,
                    },
                    {
                      key: 'pull' as const,
                      title: 'Pull Git Changes',
                      subtitle: `Sync Only ${selectedApp.name}`,
                      defaultCmd: `git pull origin ${gitStatus.branch || 'main'}`,
                      icon: Download,
                    },
                    {
                      key: 'reset_hard' as const,
                      title: 'Hard Reset',
                      subtitle: 'Force Align to Origin HEAD',
                      defaultCmd: `git reset --hard origin/${gitStatus.branch || 'main'}`,
                      icon: RotateCcw,
                    },
                  ].map((card) => {
                    const cardData = gitCardOutputs[card.key] || gitStatus.command_outputs?.[card.key];
                    const isRunning = activeAction === card.key || (statusLoading && !cardData);
                    const IconComp = card.icon;
                    return (
                      <div
                        key={card.key}
                        className="rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex flex-col justify-between overflow-hidden shadow-md transition-all"
                      >
                        <div className="p-3 border-b border-slate-800/80 flex items-center justify-between gap-2 bg-slate-900/60">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-brand-400 shrink-0">
                              <IconComp size={14} className={isRunning ? 'animate-spin' : ''} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-white truncate">{card.title}</div>
                              <div className="text-[10px] text-slate-400 truncate">{card.subtitle}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleExecuteAction(card.key)}
                            disabled={Boolean(activeAction) || (!gitStatus.is_git_repo && card.key !== 'status')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors ${
                              card.key === 'pull_deploy'
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-sm'
                                : card.key === 'pull'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : card.key === 'reset_hard'
                                ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            } disabled:opacity-40`}
                          >
                            <Play size={10} />
                            <span>{activeAction === card.key ? 'Running...' : 'Run'}</span>
                          </button>
                        </div>

                        <div className="p-3 font-mono text-[11px] space-y-2 flex-1 bg-[#080c14]">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800/80 pb-1.5">
                            <span className="text-brand-400 truncate">$ {cardData?.command || card.defaultCmd}</span>
                            {cardData?.status && (
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ml-1 ${
                                cardData.status === 'ERROR'
                                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                  : cardData.status === 'PENDING' || cardData.status === 'CHANGES' || cardData.status === 'DIRTY'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              }`}>
                                {cardData.status}
                              </span>
                            )}
                          </div>
                          <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-words max-h-36 overflow-y-auto leading-relaxed font-mono">
                            {isRunning
                              ? 'Executing command via SSH on VPS...'
                              : cardData?.output || (gitStatus.is_git_repo ? 'Ready. Click Run to execute command.' : 'Untracked directory (No .git repo).')}
                          </pre>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Custom Git Command Console Runner */}
                <div className="pt-2 flex flex-col md:flex-row items-center gap-2">
                  <div className="relative flex-1 w-full">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-brand-400 font-bold">$</span>
                    <input
                      type="text"
                      value={customCommand}
                      onChange={(e) => setCustomCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleExecuteAction('custom', customCommand);
                      }}
                      placeholder="e.g. git log -n 5, git status, git stash, ls -la..."
                      className="w-full pl-7 pr-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <button
                    onClick={() => handleExecuteAction('custom', customCommand)}
                    disabled={Boolean(activeAction) || !customCommand.trim()}
                    className="w-full md:w-auto px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                  >
                    <Play size={12} className={activeAction === 'custom' ? 'animate-spin' : ''} />
                    <span>Run on VPS</span>
                  </button>
                </div>
              </div>

              {/* Server Commit vs Remote Commit Comparison */}
              {gitStatus.is_git_repo ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <ServerIcon size={12} className="text-brand-400" />
                        <span>Current Server HEAD</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-brand-950 text-brand-400 border border-brand-800/80">
                        LOCAL
                      </span>
                    </div>
                    <div className="text-base font-bold text-brand-400 font-mono">
                      {gitStatus.current_server_commit.short_hash}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      {gitStatus.current_server_commit.message}
                    </p>
                    <div className="text-[11px] text-slate-500 font-mono pt-1 border-t border-slate-800/80 flex items-center justify-between">
                      <span>{gitStatus.current_server_commit.author}</span>
                      <span>{gitStatus.current_server_commit.date}</span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <GitPullRequest size={12} className="text-emerald-400" />
                        <span>Latest Remote Origin HEAD</span>
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        gitStatus.update_available
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}>
                        {gitStatus.update_available ? 'PENDING UPDATE' : 'UP TO DATE'}
                      </span>
                    </div>
                    <div className="text-base font-bold text-emerald-400 font-mono">
                      {gitStatus.latest_remote_commit.short_hash}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      {gitStatus.latest_remote_commit.message}
                    </p>
                    <div className="text-[11px] text-slate-500 font-mono pt-1 border-t border-slate-800/80 flex items-center justify-between">
                      <span>{gitStatus.latest_remote_commit.author}</span>
                      <span>{gitStatus.latest_remote_commit.date}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Folder size={12} className="text-amber-400" />
                        <span>Document Root Vitals</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-400 border border-amber-800/80">
                        FILESYSTEM
                      </span>
                    </div>
                    <div className="text-xs font-bold text-amber-300 font-mono truncate">
                      {gitStatus.doc_root || selectedApp.root_path || gitStatus.repo_dir}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Active directory inspected on VPS. No Git metadata present in folder hierarchy.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <GitPullRequest size={12} className="text-slate-400" />
                        <span>Source Control Status</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-slate-400 border border-slate-800">
                        UNTRACKED
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-400 font-mono">
                      Static / Direct Deployment
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Changes cannot be auto-pulled until a remote Git repository is configured.
                    </p>
                  </div>
                </div>
              )}

              {/* LIVE TERMINAL EXECUTION CONSOLE */}
              {terminalLog && (
                <div className="rounded-xl bg-black border border-slate-800 overflow-hidden shadow-2xl animate-in fade-in">
                  <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                      </div>
                      <span className="text-xs font-mono text-slate-300 ml-2">
                        root@{gitStatus.server_name || 'vps'}:{gitStatus.repo_dir || `/var/www/${selectedApp.name.toLowerCase()}`}#
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        terminalLog.exit_code === 0
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}>
                        Exit: {terminalLog.exit_code} ({terminalLog.duration_ms}ms)
                      </span>

                      <button
                        onClick={copyTerminalOutput}
                        className="p-1.5 text-slate-400 hover:text-white rounded transition-colors"
                        title="Copy Console Output"
                      >
                        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>

                      <button
                        onClick={() => setTerminalLog(null)}
                        className="text-slate-500 hover:text-slate-300 text-xs px-1"
                        title="Clear Console"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-2 bg-[#090d16] text-slate-200">
                    <div className="text-brand-400 font-bold flex items-center gap-2">
                      <span>$</span>
                      <span>{terminalLog.command}</span>
                    </div>

                    {terminalLog.stdout && (
                      <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
                        {terminalLog.stdout}
                      </pre>
                    )}

                    {terminalLog.stderr && (
                      <pre className="text-rose-400 whitespace-pre-wrap leading-relaxed font-mono">
                        {terminalLog.stderr}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {/* Commit History Log */}
              {gitStatus.is_git_repo && (
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Clock size={13} className="text-brand-400" />
                      <span>Recent Commit Trajectory ({gitStatus.recent_commits?.length || 0})</span>
                    </h4>
                    <span className="text-[11px] text-slate-500 font-mono">Verified git log</span>
                  </div>

                  <div className="space-y-2">
                    {gitStatus.recent_commits?.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        No commit history recorded for this branch.
                      </div>
                    ) : (
                      gitStatus.recent_commits?.map((c) => (
                        <div
                          key={c.commit_hash}
                          className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="text-brand-400 font-bold px-1.5 py-0.5 rounded bg-brand-950/60 border border-brand-900/60">
                                {c.short_hash}
                              </span>
                              <span className="text-slate-200 font-medium">{c.message}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {c.author} • {c.date}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-24 text-center text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <GitBranch size={32} className="mx-auto text-slate-600 animate-pulse" />
              <p>Select an application to inspect live Git source control on the VPS.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
