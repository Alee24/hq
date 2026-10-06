import React, { useEffect, useState } from 'react';
import { FileText, Search, Download, RefreshCw, Terminal, Filter, Radio } from 'lucide-react';
import { api } from '../api/client';
import { LogItem, Application, Server } from '../types';
import { useWebSocket } from '../context/WebSocketContext';

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [search, setSearch] = useState('');
  const [apps, setApps] = useState<Application[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [liveStream, setLiveStream] = useState(true);

  const { subscribe } = useWebSocket();

  const loadLogs = async () => {
    try {
      const res = await api.searchLogs({
        category,
        severity,
        search,
        appId: selectedAppId || undefined,
        serverId: selectedServerId || undefined,
        limit: 150,
      });
      setLogs(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMeta = async () => {
    try {
      const [appList, srvList] = await Promise.all([
        api.listApplications(),
        api.listServers(),
      ]);
      setApps(appList);
      setServers(srvList);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [category, severity, search, selectedAppId, selectedServerId]);

  useEffect(() => {
    if (!liveStream) return;
    const unsub = subscribe('metrics_tick', () => {
      loadLogs();
    });
    return () => unsub();
  }, [liveStream]);

  const handleExport = (format: 'csv' | 'json') => {
    const url = `/api/logs/export?format=${format}&category=${category}&severity=${severity}`;
    window.open(url, '_blank');
  };

  const categories = [
    'all',
    'application',
    'nginx',
    'apache',
    'systemd',
    'docker',
    'deployment',
    'auth',
    'security',
    'monitoring',
  ];

  const severities = ['all', 'INFO', 'WARN', 'ERROR', 'CRITICAL', 'DEBUG'];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Centralized Log Telemetry
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Aggregated stream across applications, web reverse proxies, process managers, Docker containers, and security events.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setLiveStream(!liveStream)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              liveStream
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            <Radio size={13} className={liveStream ? 'animate-pulse text-emerald-400' : ''} />
            <span>{liveStream ? 'Live Stream Active' : 'Live Stream Paused'}</span>
          </button>

          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold border border-slate-800 transition-colors"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold border border-slate-800 transition-colors"
          >
            <Download size={13} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Multi-Field Filtering Bar (Section 12) */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          {/* Keyword Search */}
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Full-text query, IP, or error code..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Category */}
          <div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-brand-500 capitalize"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  Category: {c}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-brand-500"
            >
              {severities.map((s) => (
                <option key={s} value={s}>
                  Severity: {s}
                </option>
              ))}
            </select>
          </div>

          {/* Application */}
          <div>
            <select
              value={selectedAppId}
              onChange={(e) => setSelectedAppId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-brand-500"
            >
              <option value="">All Applications</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Terminal-Grade Log Viewer */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-brand-400" />
            <span className="font-mono font-semibold text-slate-200">cluster.log.stream</span>
          </div>
          <span>Showing {logs.length} entries</span>
        </div>

        <div className="p-4 font-mono text-xs max-h-[550px] overflow-y-auto space-y-1.5 text-slate-300 divide-y divide-slate-900/60">
          {loading ? (
            <div className="py-12 text-center text-slate-600">Connecting to live log stream...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-600">No log entries matching query filters.</div>
          ) : (
            logs.map((l) => {
              const isError = l.severity === 'ERROR' || l.severity === 'CRITICAL';
              const isWarn = l.severity === 'WARN';
              return (
                <div key={l.id} className="pt-1.5 flex items-start gap-3 hover:bg-slate-900/40 px-2 py-1 rounded">
                  <span className="text-slate-500 shrink-0 text-[11px]">
                    {new Date(l.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                      isError
                        ? 'bg-rose-950 text-rose-400 border border-rose-900'
                        : isWarn
                        ? 'bg-amber-950 text-amber-400 border border-amber-900'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {l.severity}
                  </span>
                  <span className="text-slate-500 text-[11px] shrink-0 font-semibold uppercase">
                    [{l.category}]
                  </span>
                  <span className={`flex-1 break-all ${isError ? 'text-rose-300' : 'text-slate-200'}`}>
                    {l.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
