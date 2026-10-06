import React, { useEffect, useState } from 'react';
import { GitBranch, GitPullRequest, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { Application } from '../types';

export const GitView: React.FC = () => {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [gitStatus, setGitStatus] = useState<any>(null);
  const [pulling, setPulling] = useState(false);

  const loadData = async () => {
    try {
      const appList = await api.listApplications();
      setApps(appList);
      if (appList.length > 0 && !selectedApp) {
        setSelectedApp(appList[0]);
        loadGitStatus(appList[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadGitStatus = async (appId: string) => {
    try {
      const status = await api.getGitStatus(appId);
      setGitStatus(status);
    } catch {
      setGitStatus(null);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectApp = (app: Application) => {
    setSelectedApp(app);
    loadGitStatus(app.id);
  };

  const handlePull = async () => {
    if (!selectedApp) return;
    setPulling(true);
    try {
      const res = await api.pullGitChanges(selectedApp.id);
      alert(res.message);
      loadGitStatus(selectedApp.id);
    } catch (err: any) {
      alert(err.message || 'Pull failed');
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Git Source Control & Synchronization
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tracking origin heads across GitHub, GitLab, and Self-Hosted Enterprise Git servers.
          </p>
        </div>

        <button
          onClick={() => loadData()}
          className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Apps List */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
            Connected Repositories ({apps.length})
          </h3>
          <div className="space-y-1.5 max-h-[550px] overflow-y-auto">
            {apps.map((a) => {
              const isSelected = selectedApp?.id === a.id;
              const hasUpdate = a.current_commit !== a.latest_repo_commit;
              return (
                <div
                  key={a.id}
                  onClick={() => handleSelectApp(a)}
                  className={`p-3 rounded-lg cursor-pointer border transition-all ${
                    isSelected
                      ? 'bg-slate-800 border-brand-500 shadow-sm'
                      : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-white truncate">{a.name}</span>
                    {hasUpdate && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-400 border border-amber-800">
                        Update
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono text-slate-400">
                    <GitBranch size={11} />
                    <span>{a.git_branch}</span>
                    <span>•</span>
                    <span className="text-brand-400 font-semibold">{a.current_commit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Repository Inspector */}
        <div className="col-span-2 p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-5">
          {selectedApp && gitStatus ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {selectedApp.name} Repository
                  </h3>
                  <div className="text-xs text-slate-400 mono mt-0.5">{gitStatus.repo_url}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePull}
                    disabled={pulling}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <GitPullRequest size={13} className={pulling ? 'animate-spin' : ''} />
                    <span>Pull Origin Changes</span>
                  </button>
                </div>
              </div>

              {/* Server Commit vs Remote Commit Comparison (Section 9) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Current Server Commit
                  </span>
                  <div className="text-base font-bold text-brand-400 mono">
                    {gitStatus.current_server_commit.short_hash}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {gitStatus.current_server_commit.message}
                  </p>
                  <div className="text-[11px] text-slate-500">
                    {gitStatus.current_server_commit.author} • {gitStatus.current_server_commit.date}
                  </div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Latest Remote Head
                  </span>
                  <div className="text-base font-bold text-emerald-400 mono">
                    {gitStatus.latest_remote_commit.short_hash}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {gitStatus.latest_remote_commit.message}
                  </p>
                  <div className="text-[11px] text-slate-500">
                    {gitStatus.latest_remote_commit.author} • {gitStatus.latest_remote_commit.date}
                  </div>
                </div>
              </div>

              {/* Commit History Log */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Recent Commit History
                </h4>
                <div className="space-y-2">
                  {gitStatus.recent_commits.map((c: any) => (
                    <div
                      key={c.commit_hash}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-brand-400 font-semibold">{c.short_hash}</span>
                          <span className="text-slate-200 font-medium">{c.message}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {c.author} • {c.date}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-500 text-xs">
              Select an application to view Git repository status.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
