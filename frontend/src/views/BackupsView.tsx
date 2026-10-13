import React, { useEffect, useState } from 'react';
import {
  Archive,
  Plus,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Database,
  HardDrive,
  Download,
  Trash2,
  Server as ServerIcon,
  Layers,
  RotateCcw,
  Copy,
  Check,
  FileText,
  HelpCircle,
  ExternalLink,
  Terminal,
  Zap,
  CheckSquare
} from 'lucide-react';
import { api } from '../api/client';
import { BackupItem, Server, Application } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { DatabaseBackupModal } from '../components/DatabaseBackupModal';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { Button, SelectField, ModalShell } from '../components/common';

export const BackupsView: React.FC = () => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Database Backup Modal state
  const [dbModalOpen, setDbModalOpen] = useState(false);

  // Application Backup Modal state
  const [appBackupModalOpen, setAppBackupModalOpen] = useState(false);
  const [selectedAppIdForBackup, setSelectedAppIdForBackup] = useState('');
  const [includeDbInAppBackup, setIncludeDbInAppBackup] = useState(true);
  const [appBackupRunning, setAppBackupRunning] = useState(false);

  // Server Config Snapshot state
  const [serverConfigRunning, setServerConfigRunning] = useState(false);

  // Portable Restore Modal state
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreData, setRestoreData] = useState<any>(null);
  const [loadingRestore, setLoadingRestore] = useState(false);
  const [copiedRestoreCmd, setCopiedRestoreCmd] = useState(false);

  // Delete Backup Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState<BackupItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // HQ System Database Backup & 1-Click Restore state
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [exportingSystem, setExportingSystem] = useState(false);
  const [systemRestoreModalOpen, setSystemRestoreModalOpen] = useState(false);
  const [systemRestoreFile, setSystemRestoreFile] = useState<File | null>(null);
  const [systemRestorePreview, setSystemRestorePreview] = useState<any>(null);
  const [restoringSystem, setRestoringSystem] = useState(false);

  const loadData = async () => {
    try {
      const [resBackups, resServers, resApps, resStatus] = await Promise.all([
        api.listBackups(),
        api.listServers().catch(() => []),
        api.listApplications().catch(() => []),
        api.getSystemBackupStatus().catch(() => null)
      ]);
      setBackups(resBackups);
      setServers(resServers);
      setApplications(resApps);
      if (resStatus) setSystemStatus(resStatus);
      if (resServers.length > 0 && !selectedServer) {
        setSelectedServer(resServers[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportSystemBackup = async () => {
    setExportingSystem(true);
    try {
      const res = await api.exportSystemBackup();
      alert(res.message || 'HQ System database backup downloaded successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to export HQ system database backup');
    } finally {
      setExportingSystem(false);
    }
  };

  const handleSystemFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSystemRestoreFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        setSystemRestorePreview(parsed);
      } catch (err) {
        alert('Invalid JSON in backup file.');
        setSystemRestorePreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteSystemRestore = async () => {
    if (!systemRestorePreview) {
      alert('Please select a valid .hqbackup or JSON file first.');
      return;
    }
    setRestoringSystem(true);
    try {
      const res = await api.restoreSystemBackup(systemRestorePreview);
      alert(res.message || 'HQ System database restored successfully.');
      setSystemRestoreModalOpen(false);
      setSystemRestoreFile(null);
      setSystemRestorePreview(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to restore HQ system database');
    } finally {
      setRestoringSystem(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleBackupApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppIdForBackup) return;
    setAppBackupRunning(true);
    try {
      const res = await api.backupApplication({
        application_id: selectedAppIdForBackup,
        include_database: includeDbInAppBackup,
      });
      alert(res.message || 'Application backup archive generated successfully.');
      setAppBackupModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create application backup');
    } finally {
      setAppBackupRunning(false);
    }
  };

  const handleBackupServerConfig = async () => {
    if (!selectedServer) {
      alert('Please select a target server first.');
      return;
    }
    setServerConfigRunning(true);
    try {
      const res = await api.backupServerConfig({
        server_id: selectedServer.id,
      });
      alert(res.message || `Server configuration snapshot generated for ${selectedServer.name}.`);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to generate server configuration snapshot');
    } finally {
      setServerConfigRunning(false);
    }
  };

  const handleOpenRestoreModal = async (srv: Server) => {
    setSelectedServer(srv);
    setRestoreModalOpen(true);
    setLoadingRestore(true);
    try {
      const res = await api.getPortableRestoreScript(srv.id);
      setRestoreData(res);
    } catch (err: any) {
      alert(err.message || 'Failed to generate restore script');
    } finally {
      setLoadingRestore(false);
    }
  };

  const handleCopyRestoreCmd = async () => {
    if (!restoreData?.restore_command_sequence) return;
    try {
      await navigator.clipboard.writeText(restoreData.restore_command_sequence);
      setCopiedRestoreCmd(true);
      setTimeout(() => setCopiedRestoreCmd(false), 2500);
    } catch (e) {
      console.error('Failed to copy', e);
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

  const matchingApps = applications.filter(a => !selectedServer || a.server_id === selectedServer.id);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full max-w-full overflow-x-hidden">
      {/* Header Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5 flex-wrap">
            <Archive className="text-brand-400 shrink-0" size={24} />
            <span>Disaster Recovery & Multi-Tier Backup Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Automated database dumps, complete application archives, full server configuration snapshots, and 1-click portable disaster recovery to new VPS nodes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => loadData()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Refresh Backups"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* HQ CENTRAL SYSTEM DATABASE ZERO-DATA-LOSS SAFETY & RESTORE HUB */}
      {/* ============================================================== */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/40 rounded-2xl p-5 md:p-6 space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-indigo-900/30">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Database size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-white">HQ System Central Database Safety & Zero Data Loss Hub</h2>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-mono font-semibold flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  Persistent Named Volume Mounted
                </span>
                <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded-full font-mono font-semibold">
                  1-Year Persistent Login Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Rebuilding containers with <code className="text-indigo-300 font-mono">docker compose build --no-cache && docker compose up -d</code> will <strong className="text-slate-200">never wipe out</strong> your servers, applications, settings, or user session. Export complete offline snapshots anytime.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant="primary"
              onClick={handleExportSystemBackup}
              disabled={exportingSystem}
              leftIcon={<Download size={14} className={exportingSystem ? 'animate-spin' : ''} />}
            >
              {exportingSystem ? 'Exporting Snapshot...' : 'Export Full HQ Database (.hqbackup)'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSystemRestoreModalOpen(true)}
              leftIcon={<RotateCcw size={14} />}
            >
              1-Click Restore HQ Database
            </Button>
          </div>
        </div>

        {/* Database Status Gauges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Database Engine</span>
            <span className="text-xs font-bold text-indigo-300 mt-1 block truncate">
              {systemStatus?.db_engine || 'PostgreSQL 16 (Container)'}
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Storage Volume</span>
            <span className="text-xs font-bold text-emerald-400 mt-1 block truncate">
              {systemStatus?.data_dir || '/app/data'} (Volume Protected)
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Login Session Lifetime</span>
            <span className="text-xs font-bold text-sky-400 mt-1 block">
              365 Days (Zero Re-login on Restart)
            </span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Live Managed Records</span>
            <span className="text-xs font-bold text-purple-300 mt-1 block">
              {systemStatus?.counts?.servers ?? servers.length} Servers · {systemStatus?.counts?.applications ?? applications.length} Apps · {systemStatus?.counts?.domains ?? 0} Domains
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SERVER SELECTION & MULTI-TIER BACKUP CONTROL BAR */}
      {/* ============================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-4 shadow-xl">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Create Targeted Backup on Active Server Node</h2>
              <p className="text-xs text-slate-400">
                Select a VPS server to back up its databases, complete applications, or entire configuration snapshot for portable migration.
              </p>
            </div>
          </div>

          {/* Server Selector Dropdown */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <ServerIcon size={14} className="text-sky-400 shrink-0" />
            <span className="text-slate-500 font-medium">Selected Server:</span>
            <select
              value={selectedServer?.id || ''}
              onChange={(e) => {
                const s = servers.find(srv => srv.id === e.target.value) || null;
                setSelectedServer(s);
              }}
              className="bg-transparent border-none text-white focus:outline-none text-xs font-semibold cursor-pointer"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.name} ({s.public_ip})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3 Explicit Action Buttons + Portable Restore Generator */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Button 1: Database Backup */}
          <button
            onClick={() => {
              if (servers.length === 0) {
                alert('No registered servers found.');
                return;
              }
              setDbModalOpen(true);
            }}
            className="p-3.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition-all hover:border-sky-500/50 group space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                <Database size={14} />
                Backup Database
              </span>
              <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-800 px-1.5 py-0.5 rounded font-mono">
                SQL / Dump
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              PostgreSQL, MySQL, SQLite, and MongoDB databases with compression.
            </p>
          </button>

          {/* Button 2: Entire Application Backup */}
          <button
            onClick={() => {
              if (matchingApps.length > 0 && !selectedAppIdForBackup) {
                setSelectedAppIdForBackup(matchingApps[0].id);
              }
              setAppBackupModalOpen(true);
            }}
            className="p-3.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition-all hover:border-brand-500/50 group space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-400 flex items-center gap-1.5">
                <Layers size={14} />
                Backup Entire Application
              </span>
              <span className="text-[10px] bg-brand-950 text-brand-300 border border-brand-800 px-1.5 py-0.5 rounded font-mono">
                Code + Config
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Archive codebase, configuration files, .env credentials, and databases.
            </p>
          </button>

          {/* Button 3: Server Config Snapshot */}
          <button
            onClick={handleBackupServerConfig}
            disabled={serverConfigRunning || !selectedServer}
            className="p-3.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition-all hover:border-emerald-500/50 group space-y-1.5 disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <HardDrive size={14} className={serverConfigRunning ? 'animate-spin' : ''} />
                {serverConfigRunning ? 'Archiving Configs...' : 'Backup Server Config Snapshot'}
              </span>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded font-mono">
                Apache/Nginx
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Portable tarball of /etc/apache2, /etc/nginx, systemd units, and crontab.
            </p>
          </button>

          {/* Button 4: Portable Restore Script */}
          <button
            onClick={() => selectedServer && handleOpenRestoreModal(selectedServer)}
            disabled={!selectedServer}
            className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/60 to-purple-950/60 hover:from-indigo-900/60 hover:to-purple-900/60 border border-indigo-700/40 text-left transition-all hover:border-indigo-500 group space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                <RotateCcw size={14} />
                Restore to New VPS
              </span>
              <span className="text-[10px] bg-indigo-900/80 text-indigo-200 border border-indigo-700 px-1.5 py-0.5 rounded font-mono font-semibold">
                1-Click Migration
              </span>
            </div>
            <p className="text-[11px] text-indigo-200/80 leading-snug">
              Copy-paste commands to extract and restore all configs to a completely new VPS.
            </p>
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
                <th className="py-3 px-4">Backup Type</th>
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
                    No backup archives found. Trigger a database backup, application backup, or server config snapshot above to generate one.
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
                      {b.database_type === 'APPLICATION_FULL' || b.backup_type === 'APPLICATION_FULL' ? (
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-brand-950/80 border border-brand-800 text-brand-400">
                          APP FULL
                        </span>
                      ) : b.database_type === 'SERVER_CONFIG' || b.backup_type === 'SERVER_CONFIG' ? (
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                          SERVER CONFIG
                        </span>
                      ) : b.database_type ? (
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-sky-950/80 border border-sky-800 text-sky-400">
                          DB ({b.database_type})
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">SYSTEM FILES</span>
                      )}
                    </td>
                    <td className="py-3 px-4 mono text-slate-300 font-medium">
                      {b.file_size_mb} MB
                    </td>
                    <td className="py-3 px-4 mono text-slate-400 truncate max-w-[180px]">
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
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDownload(b.id, b.filename)}
                          disabled={downloadingId === b.id}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-medium border border-slate-700 transition-colors"
                          title="Download Backup Archive (.tar.gz / .sql.gz)"
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
      {dbModalOpen && selectedServer && (
        <DatabaseBackupModal
          isOpen={dbModalOpen}
          server={selectedServer}
          onClose={() => {
            setDbModalOpen(false);
            loadData();
          }}
        />
      )}

      {/* Backup Entire Application Modal */}
      <ModalShell
        isOpen={appBackupModalOpen}
        onClose={() => setAppBackupModalOpen(false)}
        title="Backup Entire Application"
        description="Captures application codebase, document root, .env configuration variables, and associated databases into a compressed archive."
        icon={Layers}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAppBackupModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="app-backup-form"
              isLoading={appBackupRunning}
              leftIcon={<Archive size={13} />}
            >
              Create Application Archive
            </Button>
          </>
        }
      >
        <form id="app-backup-form" onSubmit={handleBackupApplication} className="space-y-4 text-xs">
          <SelectField
            label="Target Application"
            isRequired
            value={selectedAppIdForBackup}
            onChange={(e) => setSelectedAppIdForBackup(e.target.value)}
          >
            {matchingApps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.framework || 'Web App'})
              </option>
            ))}
          </SelectField>

          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
            <input
              type="checkbox"
              id="includeDb"
              checked={includeDbInAppBackup}
              onChange={(e) => setIncludeDbInAppBackup(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-brand-600 focus:ring-brand-500"
            />
            <span>Include mapped database dump in the backup archive</span>
          </label>
        </form>
      </ModalShell>

      {/* Portable Restore & Disaster Recovery Modal */}
      <ModalShell
        isOpen={restoreModalOpen}
        onClose={() => setRestoreModalOpen(false)}
        title="Restore Configurations to a Brand New VPS"
        description={`Source Node: ${selectedServer?.name} (${selectedServer?.public_ip})`}
        icon={RotateCcw}
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="primary"
              onClick={handleCopyRestoreCmd}
              leftIcon={copiedRestoreCmd ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
            >
              {copiedRestoreCmd ? 'Copied to Clipboard' : 'Copy Restore Sequence'}
            </Button>
            <div className="flex items-center gap-2">
              {restoreData?.download_url && (
                <a
                  href={restoreData.download_url}
                  download
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                >
                  <Download size={14} />
                  <span>Download Archive</span>
                </a>
              )}
              <Button variant="secondary" onClick={() => setRestoreModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        <p className="text-xs text-slate-300 leading-relaxed mb-3">
          When migrating to a new VPS, simply copy the configuration archive to your new server and run the command sequence below.
          The Apache configurations will automatically restore to <code className="text-sky-300 mono bg-slate-950 px-1 py-0.5 rounded border border-slate-800">/etc/apache2/</code>, Nginx to <code className="text-sky-300 mono bg-slate-950 px-1 py-0.5 rounded border border-slate-800">/etc/nginx/</code>, and systemd units to <code className="text-sky-300 mono bg-slate-950 px-1 py-0.5 rounded border border-slate-800">/etc/systemd/system/</code>.
        </p>

        <div className="bg-black/90 rounded-xl border border-slate-800 p-4 font-mono text-xs text-indigo-300/90 leading-relaxed max-h-72 overflow-y-auto select-text">
          <pre className="whitespace-pre-wrap">
            {loadingRestore ? 'Generating portable restore command sequence...' : restoreData?.restore_command_sequence}
          </pre>
        </div>
      </ModalShell>

      {/* HQ System Database Restore Modal */}
      <ModalShell
        isOpen={systemRestoreModalOpen}
        onClose={() => {
          setSystemRestoreModalOpen(false);
          setSystemRestoreFile(null);
          setSystemRestorePreview(null);
        }}
        title="Restore HQ Command Center System Database"
        description="Upload an authentic .hqbackup or JSON database snapshot to safely restore servers, applications, and settings."
        icon={RotateCcw}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="secondary"
              onClick={() => {
                setSystemRestoreModalOpen(false);
                setSystemRestoreFile(null);
                setSystemRestorePreview(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleExecuteSystemRestore}
              disabled={!systemRestorePreview || restoringSystem}
              leftIcon={<RotateCcw size={14} className={restoringSystem ? 'animate-spin' : ''} />}
            >
              {restoringSystem ? 'Restoring Database...' : 'Restore & Merge Database (Zero Data Loss)'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <label className="text-xs font-semibold text-slate-200 block">
              Select Snapshot Archive (.hqbackup or .json)
            </label>
            <input
              type="file"
              accept=".hqbackup,.json"
              onChange={handleSystemFileChange}
              className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer border border-slate-800 rounded-lg p-2 bg-slate-900"
            />
          </div>

          {systemRestorePreview && (
            <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/50 space-y-3">
              <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" />
                Snapshot Validated Successfully
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-slate-300">
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Exported Date</span>
                  <span className="font-mono text-[11px] truncate block text-slate-300">
                    {systemRestorePreview.exported_at ? new Date(systemRestorePreview.exported_at).toLocaleString() : 'N/A'}
                  </span>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Exported By</span>
                  <span className="font-semibold text-slate-200 block truncate">
                    {systemRestorePreview.exported_by || 'Admin'}
                  </span>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Servers to Restore</span>
                  <span className="font-bold text-sky-400 block">
                    {systemRestorePreview.servers?.length || 0} Nodes
                  </span>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Applications</span>
                  <span className="font-bold text-brand-400 block">
                    {systemRestorePreview.applications?.length || 0} Apps
                  </span>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Domains & SSL</span>
                  <span className="font-bold text-purple-400 block">
                    {systemRestorePreview.domains?.length || 0} Domains
                  </span>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                  <span className="text-[10px] text-slate-500 block">Licenses</span>
                  <span className="font-bold text-emerald-400 block">
                    {systemRestorePreview.licenses?.length || 0} Licenses
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-xl text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-200 font-semibold">Database Safety Policy:</strong> Non-destructive merge will safely import records into the Command Center database without deleting any existing data or resetting database sequences.
          </div>
        </div>
      </ModalShell>

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
