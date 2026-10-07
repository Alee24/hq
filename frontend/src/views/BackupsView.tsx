import React, { useEffect, useState } from 'react';
import { Archive, Plus, RefreshCw, CheckCircle2, ShieldCheck, Database, HardDrive, Download, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { BackupItem, Server } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { DatabaseBackupModal } from '../components/DatabaseBackupModal';
import { ConfirmationModal } from '../components/ConfirmationModal';

export const BackupsView: React.FC = () => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Database Backup Modal state
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [selectedServerForDb, setSelectedServerForDb] = useState<Server | null>(null);

  // Delete Backup Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState<BackupItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [resBackups, resServers] = await Promise.all([
        api.listBackups(),
        api.listServers().catch(() => [])
      ]);
      setBackups(resBackups);
      setServers(resServers);
      if (resServers.length > 0 && !selectedServerForDb) {
        setSelectedServerForDb(resServers[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTriggerBackup = async () => {
    try {
      await api.triggerBackup();
      alert('Snapshot task initiated. Stored to enterprise S3 storage bucket.');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Backup trigger failed');
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await api.verifyBackup(id);
      alert('Checksum SHA-256 integrity verified. Archive is recoverable.');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Verification failed');
    } finally {
      setVerifyingId(null);
    }
  };

  const executeConfirmedDelete = async () => {
    if (!backupToDelete) return;
    try {
      await api.deleteBackup(backupToDelete.id);
      setDeleteModalOpen(false);
      setBackupToDelete(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete backup archive');
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

  const handleOpenDbBackupModal = () => {
    if (servers.length === 0) {
      alert('No active VPS servers registered. Please register a server first under the Servers tab.');
      return;
    }
    setDbModalOpen(true);
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

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => loadData()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Refresh Backups"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={handleOpenDbBackupModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Database size={13} />
            <span>Database Backup Engine</span>
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
                <th className="py-3 px-4">Target Node / App</th>
                <th className="py-3 px-4">Engine</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Storage Target</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Integrity</th>
                <th className="py-3 px-4">Created At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Loading backup archives...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No backup archives found. Trigger a snapshot or database backup above to generate one.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-white">
                      {b.filename}
                    </td>
                    <td className="py-3 px-4 text-slate-200">
                      {b.server_name || b.application_name || 'System Snapshot'}
                    </td>
                    <td className="py-3 px-4">
                      {b.database_type ? (
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-sky-950/80 border border-sky-800 text-sky-400">
                          {b.database_type}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">FILESYSTEM</span>
                      )}
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
                          <CheckCircle2 size={13} /> Verified
                        </span>
                      ) : (
                        <span className="text-amber-400 text-[11px]">Unverified</span>
                      )}
                    </td>
                    <td className="py-3 px-4 mono text-slate-400">
                      {new Date(b.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDownload(b.id, b.filename)}
                          disabled={downloadingId === b.id}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-medium border border-slate-700 transition-colors"
                          title="Download Backup Archive (.sql.gz)"
                        >
                          <Download size={13} className={downloadingId === b.id ? 'animate-bounce' : ''} />
                        </button>
                        <button
                          onClick={() => handleVerify(b.id)}
                          disabled={verifyingId === b.id}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium border border-slate-700 transition-colors"
                          title="Verify SHA-256 Checksum"
                        >
                          {verifyingId === b.id ? 'Verifying...' : 'Verify'}
                        </button>
                        <button
                          onClick={() => {
                            setBackupToDelete(b);
                            setDeleteModalOpen(true);
                          }}
                          className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors"
                          title="Delete Backup Archive"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Database Backup Modal */}
      {dbModalOpen && selectedServerForDb && (
        <DatabaseBackupModal
          isOpen={dbModalOpen}
          server={selectedServerForDb}
          onClose={() => {
            setDbModalOpen(false);
            loadData();
          }}
        />
      )}

      {/* Delete Backup Confirmation Modal */}
      {backupToDelete && (
        <ConfirmationModal
          isOpen={deleteModalOpen}
          title="Delete Backup Snapshot"
          message={`Are you sure you want to permanently delete backup archive "${backupToDelete.filename}"? This action cannot be undone.`}
          confirmButtonText="Delete Archive"
          isDestructive={true}
          onConfirm={executeConfirmedDelete}
          onClose={() => {
            setDeleteModalOpen(false);
            setBackupToDelete(null);
          }}
        />
      )}
    </div>
  );
};
