import React, { useEffect, useState } from 'react';
import { Archive, Plus, RefreshCw, CheckCircle2, ShieldCheck, Database, HardDrive } from 'lucide-react';
import { api } from '../api/client';
import { BackupItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export const BackupsView: React.FC = () => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const loadBackups = async () => {
    try {
      const res = await api.listBackups();
      setBackups(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleTriggerBackup = async () => {
    try {
      await api.triggerBackup();
      alert('Snapshot task initiated. Stored to enterprise S3 storage bucket.');
      loadBackups();
    } catch (err: any) {
      alert(err.message || 'Backup trigger failed');
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await api.verifyBackup(id);
      alert('Checksum SHA-256 integrity verified. Archive is recoverable.');
      loadBackups();
    } catch (err: any) {
      alert(err.message || 'Verification failed');
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Disaster Recovery & Backup Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Automated database snapshots, volume archives, cloud storage retention policies, and checksum integrity verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadBackups()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={handleTriggerBackup}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>Create Immediate Snapshot</span>
          </button>
        </div>
      </div>

      {/* Backups Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-4">Archive Filename</th>
                <th className="py-3 px-4">Associated Application</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Storage Target</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Integrity Verified</th>
                <th className="py-3 px-4">Created At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Loading backup archives...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No backup archives found.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-white">
                      {b.filename}
                    </td>
                    <td className="py-3 px-4 text-slate-200">
                      {b.application_name || 'System Snapshot'}
                    </td>
                    <td className="py-3 px-4 mono text-slate-300 font-medium">
                      {b.file_size_mb} MB
                    </td>
                    <td className="py-3 px-4 mono text-slate-400">
                      {b.destination}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={b.status} size="sm" />
                    </td>
                    <td className="py-3 px-4">
                      {b.verified ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                          <CheckCircle2 size={13} /> Verified SHA-256
                        </span>
                      ) : (
                        <span className="text-amber-400 text-[11px]">Unverified</span>
                      )}
                    </td>
                    <td className="py-3 px-4 mono text-slate-400">
                      {new Date(b.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleVerify(b.id)}
                        disabled={verifyingId === b.id}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium border border-slate-700 transition-colors"
                      >
                        {verifyingId === b.id ? 'Verifying...' : 'Verify Archive'}
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
  );
};
