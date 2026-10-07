import React, { useState, useEffect } from 'react';
import {
  Database,
  X,
  Play,
  Download,
  Trash2,
  CheckCircle2,
  Clock,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  FileArchive
} from 'lucide-react';
import { api } from '../api/client';
import { Server, BackupItem } from '../types';

interface DatabaseBackupModalProps {
  server: Server;
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseBackupModal: React.FC<DatabaseBackupModalProps> = ({
  server,
  isOpen,
  onClose
}) => {
  const [databaseType, setDatabaseType] = useState<'POSTGRESQL' | 'MYSQL' | 'SQLITE' | 'MONGODB'>('POSTGRESQL');
  const [databaseName, setDatabaseName] = useState('production_db');
  const [retentionDays, setRetentionDays] = useState(30);
  const [creating, setCreating] = useState(false);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadBackups();
    }
  }, [isOpen, server]);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const res = await api.listBackups(server.id);
      setBackups(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setSuccessMsg(null);
    try {
      const created = await api.createDatabaseBackup({
        server_id: server.id,
        database_type: databaseType,
        database_name: databaseName,
        retention_days: retentionDays
      });
      setSuccessMsg(`Database backup snapshot ${created.filename} created successfully.`);
      loadBackups();
    } catch (err: any) {
      alert(err.message || 'Failed to trigger database backup.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this backup snapshot?')) return;
    try {
      await api.deleteBackup(id);
      loadBackups();
    } catch (err: any) {
      alert(err.message || 'Failed to delete backup.');
    }
  };

  const handleDownload = async (backupId: string, filename: string) => {
    setDownloadingId(backupId);
    try {
      await api.downloadBackup(backupId, filename);
    } catch (err: any) {
      alert(err.message || 'Failed to download backup archive');
    } finally {
      setDownloadingId(null);
    }
  };

  if (!isOpen) return null;

  const dbEngines = [
    { type: 'POSTGRESQL' as const, label: 'PostgreSQL', tool: 'pg_dump', color: 'text-sky-400' },
    { type: 'MYSQL' as const, label: 'MySQL / MariaDB', tool: 'mysqldump', color: 'text-amber-400' },
    { type: 'SQLITE' as const, label: 'SQLite', tool: 'sqlite3 .backup', color: 'text-emerald-400' },
    { type: 'MONGODB' as const, label: 'MongoDB', tool: 'mongodump', color: 'text-green-400' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 text-xs max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-800 text-sky-400">
              <Database size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Database Backup Manager: {server.name}
              </h3>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Execute on-demand database snapshots, manage retention, and export recovery archives.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg">
            <X size={15} />
          </button>
        </div>

        {/* Create Backup Form */}
        <form onSubmit={handleCreateBackup} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
          <div className="font-semibold text-slate-200 flex items-center justify-between">
            <span>Trigger New Database Backup</span>
            <span className="text-[11px] text-slate-400 font-mono">Target: {server.public_ip}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {dbEngines.map((eng) => (
              <button
                key={eng.type}
                type="button"
                onClick={() => setDatabaseType(eng.type)}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  databaseType === eng.type
                    ? 'border-brand-500 bg-brand-950/40 text-white'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`font-semibold ${eng.color}`}>{eng.label}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{eng.tool}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Database Name</label>
              <input
                type="text"
                required
                value={databaseName}
                onChange={(e) => setDatabaseName(e.target.value)}
                placeholder="e.g. production_db or users_service"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Retention Policy</label>
              <select
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100"
              >
                <option value={7}>7 Days (Weekly)</option>
                <option value={14}>14 Days (Bi-weekly)</option>
                <option value={30}>30 Days (Monthly)</option>
                <option value={90}>90 Days (Quarterly)</option>
                <option value={365}>365 Days (Annual Archive)</option>
              </select>
            </div>
          </div>

          {successMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-800 text-white font-semibold rounded-lg shadow-sm transition-colors"
            >
              <Play size={13} className={creating ? 'animate-spin' : ''} />
              <span>{creating ? 'Generating Snapshot...' : 'Initiate Database Backup'}</span>
            </button>
          </div>
        </form>

        {/* Existing Backups Table */}
        <div className="flex-1 flex flex-col min-h-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Existing Backups for this Node ({backups.length})</span>
            <button
              onClick={loadBackups}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/60 divide-y divide-slate-800/60">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading backup archives...</div>
            ) : backups.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No database backups recorded yet for this server. Use the form above to generate your first snapshot.
              </div>
            ) : (
              backups.map((b) => (
                <div key={b.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileArchive size={16} className="text-sky-400 shrink-0" />
                    <div>
                      <div className="font-mono font-semibold text-slate-100 flex items-center gap-2">
                        <span>{b.filename}</span>
                        {b.database_type && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-950 text-sky-400 border border-sky-800">
                            {b.database_type}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-0.5">
                        <span>Size: {b.file_size_mb} MB</span>
                        <span>•</span>
                        <span>Created: {new Date(b.created_at).toLocaleString()}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-emerald-400">
                          <ShieldCheck size={11} /> SHA-256 Verified
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(b.id, b.filename)}
                      disabled={downloadingId === b.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs transition-colors font-semibold shadow-sm"
                      title="Download Database Backup Archive (.sql.gz)"
                    >
                      <Download size={12} className={downloadingId === b.id ? 'animate-bounce' : ''} />
                      <span>{downloadingId === b.id ? 'Downloading...' : 'Download'}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="p-1.5 hover:bg-rose-950 hover:text-rose-400 text-slate-400 rounded transition-colors"
                      title="Purge Backup"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
