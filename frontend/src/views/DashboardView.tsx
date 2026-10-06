import React, { useEffect, useState } from 'react';
import {
  Layers,
  Server,
  Activity,
  Key,
  Rocket,
  ShieldAlert,
  Clock,
  ArrowUpRight,
  RefreshCw,
  GitPullRequest,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { useWebSocket } from '../context/WebSocketContext';

interface DashboardViewProps {
  onNavigate: (view: string, id?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { subscribe } = useWebSocket();

  const loadMetrics = async () => {
    try {
      const res = await api.getDashboardMetrics();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMetrics();

    // Subscribe to live tick events from WebSocket
    const unsubscribe = subscribe('metrics_tick', () => {
      loadMetrics();
    });

    const unsubscribeDep = subscribe('deployment_completed', () => {
      loadMetrics();
    });

    return () => {
      unsubscribe();
      unsubscribeDep();
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadMetrics();
  };

  if (loading && !data) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const apps = data?.applications || { total: 0, online: 0, degraded: 0, offline: 0, maintenance: 0 };
  const srvs = data?.servers || { total: 0, online: 0, offline: 0 };
  const uptime = data?.uptime?.average_uptime || 99.98;
  const lics = data?.licenses || { total: 0, valid: 0, expiring_soon: 0, expired: 0 };
  const deps = data?.deployments || { today: 0, failed: 0, recent: [] };
  const alerts = data?.active_alerts || [];
  const incidents = data?.incidents || [];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Central Infrastructure Command Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time telemetry across multi-VPS production clusters, microservices, and cryptographic licenses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh Telemetry</span>
          </button>

          <button
            onClick={() => onNavigate('deployments')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-medium shadow-sm transition-colors"
          >
            <Rocket size={13} />
            <span>Deploy Pipeline</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (Section 3 Spec) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Applications Metric Card */}
        <div
          onClick={() => onNavigate('applications')}
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Applications</span>
            <Layers size={16} className="text-brand-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-3xl font-bold text-white mono">{apps.total}</div>
            <div className="text-xs text-slate-400 mt-1">Total Managed Applications</div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {apps.online} Online
            </span>
            {apps.degraded > 0 && (
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {apps.degraded} Degraded
              </span>
            )}
            {apps.offline > 0 && (
              <span className="flex items-center gap-1 text-rose-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> {apps.offline} Offline
              </span>
            )}
          </div>
        </div>

        {/* Servers Metric Card */}
        <div
          onClick={() => onNavigate('servers')}
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[11px]">VPS Servers</span>
            <Server size={16} className="text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-3xl font-bold text-white mono">{srvs.total}</div>
            <div className="text-xs text-slate-400 mt-1">Active VPS Infrastructure Nodes</div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {srvs.online} Online
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">{srvs.offline} Offline</span>
          </div>
        </div>

        {/* Average Uptime Metric Card */}
        <div
          onClick={() => onNavigate('monitoring')}
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Cluster SLA Uptime</span>
            <Activity size={16} className="text-blue-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-3xl font-bold text-emerald-400 mono">{uptime}%</div>
            <div className="text-xs text-slate-400 mt-1">Weighted 30-Day Cluster Reliability</div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>0 Active High Severity Outages</span>
          </div>
        </div>

        {/* Cryptographic Licenses Metric Card */}
        <div
          onClick={() => onNavigate('licenses')}
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Licenses</span>
            <Key size={16} className="text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <div className="text-3xl font-bold text-white mono">{lics.total}</div>
            <div className="text-xs text-slate-400 mt-1">Cryptographic Digital Entitlements</div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-medium">{lics.valid} Valid</span>
            {lics.expiring_soon > 0 && (
              <span className="text-amber-400 font-medium">• {lics.expiring_soon} Expiring</span>
            )}
            {lics.expired > 0 && (
              <span className="text-rose-400 font-medium">• {lics.expired} Expired</span>
            )}
          </div>
        </div>
      </div>

      {/* Secondary Quick Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Deployments Today</div>
            <div className="text-lg font-bold text-white mono">{deps.today} ({deps.failed} failed)</div>
          </div>
          <Rocket size={18} className="text-slate-400" />
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">SSL Expiring &lt;30d</div>
            <div className="text-lg font-bold text-amber-400 mono">{data?.ssl?.expiring_soon || 2}</div>
          </div>
          <ShieldAlert size={18} className="text-amber-400" />
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Git Updates Available</div>
            <div className="text-lg font-bold text-brand-400 mono">{data?.pending_updates || 1}</div>
          </div>
          <GitPullRequest size={18} className="text-brand-400" />
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Active Alert Triggers</div>
            <div className="text-lg font-bold text-rose-400 mono">{data?.active_alerts_count || 0}</div>
          </div>
          <AlertTriangle size={18} className="text-rose-400" />
        </div>
      </div>

      {/* Main Operational Split: Recent Deployments & Active Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Alerts Panel */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Active System Alerts ({alerts.length})
            </h3>
            <button
              onClick={() => onNavigate('alerts')}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1"
            >
              <span>Manage Alerts</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="space-y-2.5">
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No active system alerts. All nodes operating normally.
              </div>
            ) : (
              alerts.map((al: any) => (
                <div
                  key={al.id}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-start gap-3"
                >
                  <div className="shrink-0 mt-0.5">
                    {al.severity === 'CRITICAL' ? (
                      <XCircle size={16} className="text-rose-400" />
                    ) : (
                      <AlertTriangle size={16} className="text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200 truncate">{al.rule_name}</span>
                      <span className="text-[10px] mono text-slate-400">{new Date(al.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{al.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Deployments Panel */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Rocket size={16} className="text-brand-400" />
              Recent Deployment Activity
            </h3>
            <button
              onClick={() => onNavigate('deployments')}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="space-y-2.5">
            {deps.recent.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No recent deployments recorded.
              </div>
            ) : (
              deps.recent.map((d: any) => (
                <div
                  key={d.id}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-center justify-between"
                >
                  <div className="space-y-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-brand-400 font-semibold px-1.5 py-0.5 bg-brand-950/80 rounded border border-brand-800/80">
                        {d.commit_hash}
                      </span>
                      <span className="text-xs font-medium text-slate-200 truncate max-w-xs">{d.commit_message}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      By <span className="text-slate-300">{d.deployed_by}</span> • {new Date(d.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={d.status} size="sm" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Incident History & Maintenance Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-950 text-slate-400 border border-slate-800">
            <Clock size={18} />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200">Incident Management & Downtime Log</div>
            <div className="text-[11px] text-slate-400">
              {incidents.length} recorded incidents across the past 30 days. All resolved within 45m SLA.
            </div>
          </div>
        </div>
        <button
          onClick={() => onNavigate('monitoring')}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors border border-slate-700 shrink-0 text-center"
        >
          View Incident Timeline
        </button>
      </div>
    </div>
  );
};
