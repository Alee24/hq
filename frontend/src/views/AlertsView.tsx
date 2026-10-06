import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, RefreshCw, Plus, AlertTriangle, XCircle, Sliders } from 'lucide-react';
import { api } from '../api/client';
import { AlertItem, AlertRuleItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export const AlertsView: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [rules, setRules] = useState<AlertRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterResolved, setFilterResolved] = useState<'all' | 'active' | 'resolved'>('active');

  const [createRuleModalOpen, setCreateRuleModalOpen] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [metricName, setMetricName] = useState('cpu');
  const [threshold, setThreshold] = useState(85);
  const [severity, setSeverity] = useState('WARNING');

  const loadData = async () => {
    try {
      const res = await api.listAlerts(
        filterResolved === 'all' ? undefined : filterResolved === 'resolved'
      );
      setAlerts(res);
      const r = await api.listAlertRules();
      setRules(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterResolved]);

  const handleAcknowledge = async (id: string) => {
    try {
      await api.acknowledgeAlert(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await api.resolveAlert(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAlertRule({
        name: ruleName,
        metric_name: metricName,
        condition: 'GREATER_THAN',
        threshold: Number(threshold),
        severity,
        channel: 'WEBHOOK',
      });
      setCreateRuleModalOpen(false);
      setRuleName('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create alert rule');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Central Alert & Incident Management Engine
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Automated threshold violation alerts, downtime incidents, acknowledgment workflows, and webhook dispatchers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={() => setCreateRuleModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>Configure Alert Rule</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-2 text-xs">
        {(['active', 'resolved', 'all'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilterResolved(mode)}
            className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${
              filterResolved === mode
                ? 'bg-brand-600 text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {mode === 'active' ? 'Active Alerts' : mode === 'resolved' ? 'Resolved Alerts' : 'All Alerts'}
          </button>
        ))}
      </div>

      {/* Alerts Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Alert Title</th>
                <th className="py-3 px-4">Target Source</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-4">Triggered At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">Loading alerts inbox...</td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">No alerts matching filter.</td>
                </tr>
              ) : (
                alerts.map((al) => (
                  <tr key={al.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <StatusBadge status={al.severity} size="sm" />
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {al.rule_name}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                        {al.source_name || al.source_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-md leading-relaxed text-slate-300">
                      {al.message}
                    </td>
                    <td className="py-3 px-4 mono text-slate-400">
                      {new Date(al.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!al.is_resolved ? (
                        <div className="flex items-center justify-end gap-1.5">
                          {!al.is_acknowledged && (
                            <button
                              onClick={() => handleAcknowledge(al.id)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium"
                            >
                              Ack
                            </button>
                          )}
                          <button
                            onClick={() => handleResolve(al.id)}
                            className="px-2.5 py-1 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 text-emerald-300 rounded text-[11px] font-medium"
                          >
                            Resolve
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px] italic">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alert Rules Section (Section 22) */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sliders size={16} className="text-brand-400" />
          Configured Alert Rules & Thresholds ({rules.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {rules.map((r) => (
            <div key={r.id} className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{r.name}</span>
                <StatusBadge status={r.severity} size="sm" />
              </div>
              <div className="text-slate-400 mono text-[11px]">
                Condition: {r.metric_name} &gt; {r.threshold}%
              </div>
              <div className="text-[10px] text-slate-500 uppercase">Channel: {r.channel}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Rule Modal */}
      {createRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Create Threshold Alert Rule</h3>
            <form onSubmit={handleCreateRule} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Critical High RAM"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Metric</label>
                  <select
                    value={metricName}
                    onChange={(e) => setMetricName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  >
                    <option value="cpu">CPU Utilization</option>
                    <option value="ram">RAM Utilization</option>
                    <option value="disk">Disk Capacity</option>
                    <option value="ssl_days">SSL Days Left</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Threshold (%)</label>
                  <input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                >
                  <option value="WARNING">WARNING</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateRuleModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg font-semibold"
                >
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
