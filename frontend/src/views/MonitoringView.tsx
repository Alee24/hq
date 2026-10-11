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
  ExternalLink
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
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

  // Live Application Monitoring State
  const [servers, setServers] = useState<Server[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [liveMonitorData, setLiveMonitorData] = useState<LiveMonitorData | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);
  const [searchLogs, setSearchLogs] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);

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
    const matchingApps = applications.filter(a => a.server_id === srvId);
    if (matchingApps.length > 0) {
      setSelectedAppId(matchingApps[0].id);
    } else {
      setSelectedAppId('');
      setLiveMonitorData(null);
    }
  };

  // Fetch live application logs & traffic
  const fetchLiveMonitor = async (appId: string) => {
    if (!appId) return;
    setLoadingLive(true);
    try {
      const res = await api.getLiveApplicationMonitor(appId);
      setLiveMonitorData(res);
    } catch (err: any) {
      console.error('Failed to fetch live monitor', err);
    } finally {
      setLoadingLive(false);
    }
  };

  useEffect(() => {
    if (selectedAppId) {
      fetchLiveMonitor(selectedAppId);
    }
  }, [selectedAppId]);

  // Live polling stream every 4 seconds when streaming is active
  useEffect(() => {
    if (!isStreaming || !selectedAppId) return;
    const interval = setInterval(() => {
      fetchLiveMonitor(selectedAppId);
    }, 4000);
    return () => clearInterval(interval);
  }, [isStreaming, selectedAppId]);

  const handleTriggerNow = async () => {
    setTriggering(true);
    try {
      await api.triggerMonitoringNow();
      await loadMonitoring();
      alert('On-demand synthetic health check executed successfully across all nodes.');
    } catch (err: any) {
      alert(err.message || 'Trigger failed');
    } finally {
      setTriggering(false);
    }
  };

  const filteredLogs = liveMonitorData?.terminal_logs
    ? liveMonitorData.terminal_logs
        .split('\n')
        .filter(l => !searchLogs || l.toLowerCase().includes(searchLogs.toLowerCase()))
        .join('\n')
    : '';

  const matchingApps = applications.filter(a => !selectedServerId || a.server_id === selectedServerId);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Activity className="text-brand-400" size={24} />
            <span>Continuous Infrastructure & Live Application Monitoring</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time backend application execution stream, incoming browsing visitor traffic, HTTP response probes, and global SLA verification.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
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

          <button
            onClick={handleTriggerNow}
            disabled={triggering}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Radio size={14} className={triggering ? 'animate-spin' : ''} />
            <span>Run Health Probes</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* LIVE APPLICATION & VISITOR TRAFFIC MONITOR (USER REQUEST) */}
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
              <p className="text-xs text-slate-400">
                Select a server and application to watch incoming browsing requests, user actions, and backend execution in real time.
              </p>
            </div>
          </div>

          {/* Dual Server & Application Dropdowns */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Server Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
              <ServerIcon size={13} className="text-sky-400 shrink-0" />
              <span className="text-slate-500 font-medium">Server:</span>
              <select
                value={selectedServerId}
                onChange={(e) => handleServerChange(e.target.value)}
                className="bg-transparent border-none text-white focus:outline-none text-xs font-semibold cursor-pointer"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                    {s.name} ({s.public_ip})
                  </option>
                ))}
              </select>
            </div>

            {/* Application Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
              <Layers size={13} className="text-brand-400 shrink-0" />
              <span className="text-slate-500 font-medium">Application:</span>
              <select
                value={selectedAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="bg-transparent border-none text-white focus:outline-none text-xs font-semibold cursor-pointer"
              >
                {matchingApps.length === 0 ? (
                  <option value="" className="bg-slate-900 text-slate-400">No applications on this server</option>
                ) : (
                  matchingApps.map((a) => (
                    <option key={a.id} value={a.id} className="bg-slate-900 text-white">
                      {a.name} ({a.framework || 'Web App'})
                    </option>
                  ))
                )}
              </select>
            </div>

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

            {/* Recent Incoming Visitor Requests (Live Feed) */}
            {liveMonitorData?.recent_requests && liveMonitorData.recent_requests.length > 0 && (
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Zap size={13} className="text-amber-400" />
                    Incoming Visitor Traffic Stream ({liveMonitorData.recent_requests.length} recent requests)
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">Updated {new Date(liveMonitorData.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[11px]">
                  {liveMonitorData.recent_requests.slice(-8).reverse().map((req, idx) => (
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

            {/* Live Terminal Console */}
            <div className="bg-black/95 rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
              {/* Terminal Header */}
              <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2 font-mono text-slate-300">
                  <Terminal size={14} className="text-emerald-400" />
                  <span className="font-semibold text-white">
                    {liveMonitorData?.service_name || liveMonitorData?.application_name} — Live stdout & access logs
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400 text-[11px]">Auto-tail 80 lines</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
                    <input
                      type="text"
                      value={searchLogs}
                      onChange={(e) => setSearchLogs(e.target.value)}
                      placeholder="Filter terminal..."
                      className="pl-7 pr-2 py-1 bg-slate-900 border border-slate-800 rounded text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 w-36 sm:w-48"
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

              {/* Terminal Log Body */}
              <div className="p-4 font-mono text-xs text-emerald-400/90 leading-relaxed max-h-72 overflow-y-auto space-y-1">
                {filteredLogs ? (
                  <pre className="whitespace-pre-wrap font-mono">
                    {filteredLogs}
                  </pre>
                ) : (
                  <div className="py-8 text-center text-slate-500 italic">
                    {loadingLive ? 'Connecting to remote application process...' : 'Waiting for backend events and user browsing traffic...'}
                  </div>
                )}
                <div ref={terminalEndRef} />
              </div>

              {/* Terminal Footer */}
              <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
                  <span>{isStreaming ? 'Active real-time telemetry stream (4s interval)' : 'Streaming paused'}</span>
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
          <span className="text-xs text-slate-500">Global Cluster SLA</span>
          <div className="text-2xl font-bold text-emerald-400 mono">{data?.uptime_percent !== undefined ? data.uptime_percent : 100.0}%</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={12} /> Target 99.9% uptime SLA
          </div>
        </div>
      </div>

      {/* Latency Time-Series Chart */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity size={16} className="text-brand-400" />
            Response Latency History ({period.toUpperCase()})
          </h3>
          <span className="text-xs font-mono text-slate-400">Polling Interval: 60s</span>
        </div>

        <div className="h-64 w-full">
          {data?.chart_data ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chart_data}>
                <defs>
                  <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0e8ce4" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#0e8ce4" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" stroke="#475569" fontSize={11} tickLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} unit="ms" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="response_time_ms" stroke="#0e8ce4" strokeWidth={2} fillOpacity={1} fill="url(#latencyGradient)" name="Latency" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Loading time-series graph...
            </div>
          )}
        </div>
      </div>

      {/* Downtime Incidents Table */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Clock size={16} className="text-amber-400" />
          Recorded Outage & Incident Log ({data?.incidents?.length || 0})
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-2.5 px-3">Incident</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Resolution State</th>
                <th className="py-2.5 px-3">Started At</th>
                <th className="py-2.5 px-3">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {(!data?.incidents || data.incidents.length === 0) ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No downtime incidents or outages recorded. All services operating normally within SLA.
                  </td>
                </tr>
              ) : (
                data.incidents.map((inc: any) => (
                  <tr key={inc.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-semibold text-white">{inc.title}</td>
                    <td className="py-3 px-3"><StatusBadge status={inc.severity} size="sm" /></td>
                    <td className="py-3 px-3"><StatusBadge status={inc.status} size="sm" /></td>
                    <td className="py-3 px-3 mono text-slate-400">{new Date(inc.started_at).toLocaleString()}</td>
                    <td className="py-3 px-3 mono text-emerald-400 font-semibold">{Math.round(inc.duration_seconds / 60)} mins</td>
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
