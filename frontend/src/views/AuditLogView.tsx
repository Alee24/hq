import React, { useEffect, useState } from 'react';
import { ClipboardList, Search, Download, RefreshCw, Eye } from 'lucide-react';
import { api } from '../api/client';
import { AuditLogItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionSearch, setActionSearch] = useState('');
  const [selectedDetails, setSelectedDetails] = useState<any | null>(null);

  const loadAudit = async () => {
    try {
      const res = await api.listAuditLogs(actionSearch || undefined);
      setLogs(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, [actionSearch]);

  const handleExportCsv = () => {
    const rows = [
      ['Timestamp', 'User', 'Action', 'Entity Type', 'IP Address', 'Result', 'Details'],
      ...logs.map(l => [
        l.timestamp,
        l.username,
        l.action,
        l.entity_type,
        l.ip_address,
        l.result,
        JSON.stringify(l.details)
      ])
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'command_center_audit_trail.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Enterprise Immutable Audit Trail
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tamper-evident system activity log recording every privileged operation, deployment, restart, and security event.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadAudit()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
        <input
          type="text"
          value={actionSearch}
          onChange={(e) => setActionSearch(e.target.value)}
          placeholder="Filter by action name or keyword..."
          className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4">Entity Type</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Result</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">Loading audit records...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">No audit events found.</td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white mono">{l.action}</td>
                    <td className="py-3 px-4 text-brand-400 font-medium">@{l.username}</td>
                    <td className="py-3 px-4 uppercase text-[10px] text-slate-400 font-semibold">{l.entity_type}</td>
                    <td className="py-3 px-4 mono text-slate-400">{l.ip_address}</td>
                    <td className="py-3 px-4"><StatusBadge status={l.result} size="sm" /></td>
                    <td className="py-3 px-4 mono text-slate-400">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedDetails(l.details)}
                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                        title="View JSON Payload"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-white">Audit Event Details</h4>
              <button onClick={() => setSelectedDetails(null)} className="text-xs text-slate-400 hover:text-white">
                Close
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 max-h-80 overflow-y-auto">
              {JSON.stringify(selectedDetails, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
