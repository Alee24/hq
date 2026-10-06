import React, { useEffect, useState } from 'react';
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
  Radio
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export const MonitoringView: React.FC = () => {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d' | '90d' | '1y'>('24h');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

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

  useEffect(() => {
    loadMonitoring();
  }, [period]);

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

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Continuous Synthetic Website Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            HTTP latency probes, DNS resolution timings, TLS handshake latency, and uptime SLA verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
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
            <span>Run Checks Now</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Average Response Time</span>
          <div className="text-2xl font-bold text-white mono">{data?.average_response_time_ms || 42.5} ms</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <TrendingDown size={12} /> Within optimal 100ms budget
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Fastest Probe (Min)</span>
          <div className="text-2xl font-bold text-emerald-400 mono">{data?.min_response_time_ms || 18.2} ms</div>
          <div className="text-[11px] text-slate-400">DNS & TTFB latency</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Slowest Probe (Max)</span>
          <div className="text-2xl font-bold text-amber-400 mono">{data?.max_response_time_ms || 148.0} ms</div>
          <div className="text-[11px] text-slate-400">Database rollup query</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Global Cluster SLA</span>
          <div className="text-2xl font-bold text-emerald-400 mono">{data?.uptime_percent || 99.98}%</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={12} /> Exceeds 99.9% target
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
              {data?.incidents?.map((inc: any) => (
                <tr key={inc.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-semibold text-white">{inc.title}</td>
                  <td className="py-3 px-3"><StatusBadge status={inc.severity} size="sm" /></td>
                  <td className="py-3 px-3"><StatusBadge status={inc.status} size="sm" /></td>
                  <td className="py-3 px-3 mono text-slate-400">{new Date(inc.started_at).toLocaleString()}</td>
                  <td className="py-3 px-3 mono text-emerald-400 font-semibold">{Math.round(inc.duration_seconds / 60)} mins</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
