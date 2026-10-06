import React, { useEffect, useState } from 'react';
import { HeartPulse, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { SystemHealthResponse } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export const SystemHealthView: React.FC = () => {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = async () => {
    try {
      const res = await api.getSystemHealth();
      setHealth(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            System & Component Health Matrix
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time status of internal command center subsystems, brokers, background worker pools, and agents.
          </p>
        </div>

        <button
          onClick={() => loadHealth()}
          className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Top Banner Status */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-400 rounded-xl">
            <HeartPulse size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Overall Command Center Health</h3>
            <p className="text-xs text-slate-400">All critical backend daemons, queues, and cryptographic engines reporting healthy.</p>
          </div>
        </div>

        <StatusBadge status={health?.overall_status || 'Healthy'} />
      </div>

      {/* Component Grid (Section 41) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {health?.items.map((item, idx) => (
          <div
            key={idx}
            className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-white">{item.name}</h4>
                <span className="text-[10px] uppercase font-semibold text-slate-500">{item.category}</span>
              </div>
              <StatusBadge status={item.status} size="sm" />
            </div>

            <p className="text-xs text-slate-300 leading-relaxed pt-1">
              {item.details}
            </p>

            {item.latency_ms !== null && item.latency_ms !== undefined && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] mono text-slate-500">
                <span>Probe Latency</span>
                <span className="text-brand-400 font-semibold">{item.latency_ms} ms</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
