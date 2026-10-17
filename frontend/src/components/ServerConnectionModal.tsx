import React, { useState } from 'react';
import {
  X,
  Key,
  Shield,
  Terminal,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Wifi,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { api } from '../api/client';
import { Server } from '../types';

interface ServerConnectionModalProps {
  server: Server;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updatedServer: Server) => void;
}

export const ServerConnectionModal: React.FC<ServerConnectionModalProps> = ({
  server,
  isOpen,
  onClose,
  onUpdated
}) => {
  const [tab, setTab] = useState<'ssh' | 'agent'>('ssh');
  const [sshUser, setSshUser] = useState(server.ssh_user || 'root');
  const [sshPort, setSshPort] = useState(server.ssh_port || 22);
  const [authType, setAuthType] = useState<'KEY' | 'PASSWORD'>(server.ssh_auth_type || 'KEY');
  const [sshKey, setSshKey] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [showSshPassword, setShowSshPassword] = useState(false);
  const [useSudo, setUseSudo] = useState<boolean>(server.use_sudo ?? (server.ssh_user ? server.ssh_user !== 'root' : false));
  const [sudoPassword, setSudoPassword] = useState('');
  const [showSudoPassword, setShowSudoPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testServerConnection(server.id, {
        ssh_user: sshUser,
        ssh_port: Number(sshPort),
        ssh_auth_type: authType,
        ssh_key: authType === 'KEY' ? (sshKey ? sshKey.trim() : undefined) : undefined,
        ssh_password: authType === 'PASSWORD' ? (sshPassword ? sshPassword : undefined) : undefined,
        use_sudo: useSudo,
        sudo_password: sudoPassword ? sudoPassword.trim() : undefined,
        save_if_successful: false
      });
      setTestResult(res);
      if (res.success) {
        try {
          const refreshed = await api.getServer(server.id);
          onUpdated(refreshed);
        } catch {}
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 'ERROR',
        message: err.message || 'Connection test failed. Host unreachable.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveSsh = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.configureServerConnection(server.id, {
        ssh_user: sshUser,
        ssh_port: Number(sshPort),
        ssh_auth_type: authType,
        ssh_key: authType === 'KEY' ? sshKey : undefined,
        ssh_password: authType === 'PASSWORD' ? sshPassword : undefined,
        connection_type: 'SSH',
        use_sudo: useSudo,
        sudo_password: sudoPassword ? sudoPassword.trim() : undefined,
      });
      try {
        await api.testServerConnection(server.id);
        const refreshed = await api.getServer(server.id);
        onUpdated(refreshed);
      } catch {
        onUpdated(updated);
      }
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to save connection configuration.');
    } finally {
      setSaving(false);
    }
  };

  const hostUrl = window.location.origin;
  const enrollCommand = `curl -sSL "${hostUrl}/api/servers/${server.id}/agent/install-script" | sudo bash`;

  const copyEnrollCommand = () => {
    navigator.clipboard.writeText(enrollCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const downloadScript = () => {
    window.open(`${hostUrl}/api/servers/${server.id}/agent/install-script`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Wifi size={18} className="text-brand-400" />
              <span>Configure Remote Connection: {server.name}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Establish bi-directional management via SSH credentials or 1-Click Reverse Agent.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg">
            <X size={15} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
          <button
            onClick={() => setTab('ssh')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
              tab === 'ssh' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Direct SSH Connection
          </button>
          <button
            onClick={() => setTab('agent')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
              tab === 'agent' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            1-Click Reverse Agent Enrollment
          </button>
        </div>

        {/* SSH Form */}
        {tab === 'ssh' ? (
          <form onSubmit={handleSaveSsh} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">SSH Username</label>
                <input
                  type="text"
                  required
                  value={sshUser}
                  onChange={(e) => {
                    const u = e.target.value;
                    setSshUser(u);
                    if (u.trim() !== 'root' && !useSudo) {
                      setUseSudo(true);
                    }
                  }}
                  placeholder="e.g. root or ubuntu"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono"
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-slate-500">Quick:</span>
                  {['root', 'ubuntu', 'debian', 'admin', 'deploy'].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => {
                        setSshUser(u);
                        if (u !== 'root') setUseSudo(true);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        sshUser === u
                          ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                          : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">SSH Port</label>
                <input
                  type="number"
                  required
                  value={sshPort}
                  onChange={(e) => setSshPort(Number(e.target.value))}
                  placeholder="22"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Standard OpenSSH port (default: 22).
                </p>
              </div>
            </div>

            {/* Privilege Escalation (sudo su) Section */}
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className={useSudo ? 'text-indigo-400' : 'text-slate-500'} />
                    <span className="font-semibold text-slate-200">
                      Privilege Escalation (<code className="text-brand-300 font-mono">sudo su</code>)
                    </span>
                    {useSudo && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Required for hosts where direct SSH login as root is disabled (e.g. AWS EC2, DigitalOcean, Debian). All administrative tasks run with elevated root privileges.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={useSudo}
                    onChange={(e) => setUseSudo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {useSudo && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2 animate-in fade-in duration-100">
                  <label className="block text-slate-300 font-semibold text-[11px]">
                    Sudo Password <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showSudoPassword ? 'text' : 'password'}
                      value={sudoPassword}
                      onChange={(e) => setSudoPassword(e.target.value)}
                      placeholder="Leave blank if passwordless sudo (NOPASSWD) or same as SSH password"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs pr-10 font-mono placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSudoPassword(!showSudoPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showSudoPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    If left blank, HQ will try passwordless sudo (<code className="text-slate-400">sudo -n</code>) and fall back to the SSH password.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">Authentication Mechanism</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAuthType('KEY')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                    authType === 'KEY'
                      ? 'border-brand-500 bg-brand-950/30 text-brand-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <Key size={14} />
                  <span>Private Key (Recommended)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAuthType('PASSWORD')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                    authType === 'PASSWORD'
                      ? 'border-brand-500 bg-brand-950/30 text-brand-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <Lock size={14} />
                  <span>SSH Password</span>
                </button>
              </div>
            </div>

            {authType === 'KEY' ? (
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Private Key (Ed25519 / RSA OpenSSH format)
                </label>
                <textarea
                  rows={4}
                  value={sshKey}
                  onChange={(e) => setSshKey(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono text-[11px] leading-relaxed"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Keys are used exclusively in-memory for authenticated sessions and are never logged.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold">SSH Password</label>
                  {server.has_ssh_password && !sshPassword && (
                    <span className="text-[10px] text-emerald-400 font-medium">Saved in database (leave blank to keep)</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showSshPassword ? 'text' : 'password'}
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    placeholder={server.has_ssh_password ? '•••••••••••• (saved)' : 'Enter root/SSH password'}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 pr-10 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSshPassword(!showSshPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showSshPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Click the eye icon to verify typed characters. Never committed to version control.
                </p>
              </div>
            )}

            {/* Test Connection Result Box */}
            {testResult && (() => {
              const isTrulySuccess = Boolean(testResult.success && testResult.status !== 'AUTH_FAILED' && !testResult.message?.includes('AUTH_FAILED'));
              return (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    isTrulySuccess
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800 text-rose-300'
                  }`}
                >
                  {isTrulySuccess ? (
                    <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="text-rose-400 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div className="font-semibold">{testResult.message}</div>
                    {testResult.latency_ms !== undefined && (
                      <div className="text-[11px] opacity-80 mt-0.5">Roundtrip Latency: {testResult.latency_ms} ms</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors font-semibold"
              >
                <RefreshCw size={13} className={testing ? 'animate-spin' : ''} />
                <span>{testing ? 'Probing Server...' : 'Test Connection'}</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold shadow-sm"
                >
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* Agent Tab */
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">1-Click Linux Enrollment Command</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-950 text-brand-300 border border-brand-800">
                  AUTO-PAIRED
                </span>
              </div>

              <p className="text-slate-400 text-[11px]">
                Copy and run this command on <strong className="text-slate-200">{server.name}</strong> as root. It installs the lightweight agent, configures a systemd service, and initiates automatic telemetry reporting back to this command center.
              </p>

              <div className="relative">
                <pre className="p-3 bg-black/60 border border-slate-800 rounded-lg font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap select-all">
                  {enrollCommand}
                </pre>
                <button
                  onClick={copyEnrollCommand}
                  className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px] font-semibold transition-colors shadow-sm"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={downloadScript}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              >
                <Download size={13} />
                <span>Download Script (.sh)</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
