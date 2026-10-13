import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Bell,
  Shield,
  Server,
  Key,
  Globe,
  AlertCircle,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  ExternalLink,
  Info
} from 'lucide-react';
import { api, SmtpConfigResponse, NotificationLogItem } from '../api/client';
import { Button, InputField } from '../components/common';

export const EmailNotificationsView: React.FC = () => {
  // SMTP Configuration State
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('Command Center HQ');
  const [encryption, setEncryption] = useState('STARTTLS');
  const [isEnabled, setIsEnabled] = useState(false);

  // Trigger Toggles
  const [notifyOnLogin, setNotifyOnLogin] = useState(true);
  const [notifyOnOutage, setNotifyOnOutage] = useState(true);
  const [notifyOnSslExpiry, setNotifyOnSslExpiry] = useState(true);
  const [notifyOnDnsMismatch, setNotifyOnDnsMismatch] = useState(true);
  const [notifyOnFailedDeployment, setNotifyOnFailedDeployment] = useState(true);
  const [notifyOnCriticalAlert, setNotifyOnCriticalAlert] = useState(true);

  // Recipients
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState('');

  // Password Visibility
  const [showPassword, setShowPassword] = useState(false);

  // Status & Telemetry
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastTestStatus, setLastTestStatus] = useState<string | null>(null);
  const [lastTestError, setLastTestError] = useState<string | null>(null);

  // Logs
  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // UI Flow States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Test Modal State
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    duration_ms?: number;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [smtpConfig, logsRes] = await Promise.all([
        api.getSmtpConfig(),
        api.getNotificationLogs(50),
      ]);

      setHost(smtpConfig.host || '');
      setPort(smtpConfig.port || 587);
      setUsername(smtpConfig.username || '');
      setHasExistingPassword(Boolean(smtpConfig.has_password));
      setSenderEmail(smtpConfig.sender_email || '');
      setSenderName(smtpConfig.sender_name || 'Command Center HQ');
      setEncryption(smtpConfig.encryption || 'STARTTLS');
      setIsEnabled(smtpConfig.is_enabled);

      setNotifyOnLogin(smtpConfig.notify_on_login ?? true);
      setNotifyOnOutage(smtpConfig.notify_on_outage ?? true);
      setNotifyOnSslExpiry(smtpConfig.notify_on_ssl_expiry ?? true);
      setNotifyOnDnsMismatch(smtpConfig.notify_on_dns_mismatch ?? true);
      setNotifyOnFailedDeployment(smtpConfig.notify_on_failed_deployment ?? true);
      setNotifyOnCriticalAlert(smtpConfig.notify_on_critical_alert ?? true);

      setRecipients(smtpConfig.recipients || []);
      setLastTestedAt(smtpConfig.last_tested_at || null);
      setLastTestStatus(smtpConfig.last_test_status || null);
      setLastTestError(smtpConfig.last_test_error || null);

      setLogs(logsRes || []);

      if (smtpConfig.recipients && smtpConfig.recipients.length > 0) {
        setTestRecipient(smtpConfig.recipients[0]);
      } else if (smtpConfig.sender_email) {
        setTestRecipient(smtpConfig.sender_email);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load SMTP configuration.');
    } finally {
      setLoading(false);
    }
  };

  const refreshLogs = async () => {
    setLogsLoading(true);
    try {
      const logsRes = await api.getNotificationLogs(50);
      setLogs(logsRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRecipient.trim().toLowerCase();
    if (!clean) return;
    if (!clean.includes('@') || !clean.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (recipients.includes(clean)) {
      setNewRecipient('');
      return;
    }
    setRecipients([...recipients, clean]);
    setNewRecipient('');
    setErrorMessage(null);
  };

  const handleRemoveRecipient = (email: string) => {
    setRecipients(recipients.filter((r) => r !== email));
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!host.trim()) {
      setErrorMessage('SMTP Server Host is required.');
      return;
    }
    if (!senderEmail.trim()) {
      setErrorMessage('Sender Email Address is required.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      await api.saveSmtpConfig({
        host: host.trim(),
        port: Number(port),
        username: username.trim(),
        password: password.trim() ? password.trim() : undefined,
        sender_email: senderEmail.trim(),
        sender_name: senderName.trim(),
        encryption,
        is_enabled: isEnabled,
        notify_on_login: notifyOnLogin,
        notify_on_outage: notifyOnOutage,
        notify_on_ssl_expiry: notifyOnSslExpiry,
        notify_on_dns_mismatch: notifyOnDnsMismatch,
        notify_on_failed_deployment: notifyOnFailedDeployment,
        notify_on_critical_alert: notifyOnCriticalAlert,
        recipients,
      });

      if (password.trim()) {
        setHasExistingPassword(true);
        setPassword('');
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
      refreshLogs();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save SMTP settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = testRecipient.trim().toLowerCase();
    if (!target) {
      setTestResult({ success: false, message: 'Please specify a recipient email.' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testSmtpConnection({
        recipient: target,
        host: host.trim() || undefined,
        port: Number(port) || undefined,
        username: username.trim() || undefined,
        password: password.trim() || undefined,
        sender_email: senderEmail.trim() || undefined,
        sender_name: senderName.trim() || undefined,
        encryption,
      });

      setTestResult({
        success: true,
        message: res.message || `Test email dispatched to ${target} in ${res.duration_ms}ms.`,
        duration_ms: res.duration_ms,
      });
      setLastTestStatus('SUCCESS');
      setLastTestError(null);
      setLastTestedAt(new Date().toISOString());
      refreshLogs();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'SMTP test connection failed. Check host, port, or authentication credentials.',
      });
      setLastTestStatus('FAILED');
      setLastTestError(err.message);
      refreshLogs();
    } finally {
      setTesting(false);
    }
  };

  const applyPreset = (preset: 'gmail' | 'office365' | 'namecheap' | 'custom') => {
    if (preset === 'gmail') {
      setHost('smtp.gmail.com');
      setPort(587);
      setEncryption('STARTTLS');
    } else if (preset === 'office365') {
      setHost('smtp.office365.com');
      setPort(587);
      setEncryption('STARTTLS');
    } else if (preset === 'namecheap') {
      setHost('mail.privateemail.com');
      setPort(465);
      setEncryption('SSL');
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-slate-400 font-mono text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
          <span>LOADING SMTP CONFIGURATION & ALERT SETTINGS...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-3 bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-xl shrink-0">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white tracking-tight">Email Notifications & SMTP Gateway</h1>
              {isEnabled ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  GATEWAY ACTIVE
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 whitespace-nowrap">
                  GATEWAY DISABLED
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configure SMTP server credentials and subscribe to instant security sign-ins, system outages, and infrastructure alerts.
            </p>
          </div>
        </div>

        {/* Global Header Actions */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <Button
            variant="secondary"
            onClick={() => {
              setTestModalOpen(true);
              setTestResult(null);
            }}
            className="text-xs h-9 px-3 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5 mr-1.5 text-brand-400" />
            Send Test Email
          </Button>

          <Button
            variant="primary"
            onClick={handleSaveConfig}
            isLoading={saving}
            className="text-xs h-9 px-4 whitespace-nowrap shrink-0 bg-brand-600 hover:bg-brand-500"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Notifications / Alerts Banners */}
      {savedSuccess && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800/80 rounded-xl flex items-center gap-3 text-emerald-300 text-sm animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          <div className="font-medium">
            SMTP settings and notification triggers saved successfully! Live notifications are operational.
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-950/60 border border-rose-800/80 rounded-xl flex items-center gap-3 text-rose-300 text-sm animate-in fade-in">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
          <div className="flex-1 font-medium">{errorMessage}</div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs text-rose-400 hover:text-rose-200 underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Settings & Triggers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: SMTP Configuration Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-brand-400" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">SMTP Server Credentials</h2>
              </div>

              {/* Presets */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 text-[11px]">Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('gmail')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-mono transition-colors"
                >
                  Gmail
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('office365')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-mono transition-colors"
                >
                  Office 365
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('namecheap')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-mono transition-colors"
                >
                  PrivateEmail
                </button>
              </div>
            </div>

            {/* Master Activation Switch */}
            <div className="flex items-center justify-between p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-white">Enable Email Dispatch Gateway</div>
                <div className="text-[11px] text-slate-400">
                  When enabled, real-time emails will be sent out for active incident triggers.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <InputField
                    label="SMTP Host / Server"
                    placeholder="e.g. smtp.gmail.com"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <InputField
                    label="Port"
                    type="number"
                    placeholder="587"
                    value={port.toString()}
                    onChange={(e) => setPort(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              {/* Encryption & Security */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Encryption / Security Protocol</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {(['STARTTLS', 'SSL', 'NONE'] as const).map((enc) => (
                    <button
                      key={enc}
                      type="button"
                      onClick={() => setEncryption(enc)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                        encryption === enc
                          ? 'bg-brand-600/20 border-brand-500 text-brand-300 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {enc === 'STARTTLS' ? 'STARTTLS (587)' : enc === 'SSL' ? 'SSL / TLS (465)' : 'Plain / None (25)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <InputField
                    label="SMTP Username"
                    placeholder="e.g. alerts@company.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>SMTP Password / App Key</span>
                    {hasExistingPassword && (
                      <span className="text-[10px] text-emerald-400 font-mono">Password Configured</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={hasExistingPassword ? '•••••••••••• (Leave blank to keep)' : 'Enter password'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 pr-9 transition-colors font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <InputField
                    label="Sender Email Address"
                    placeholder="e.g. notifications@kkdes.co.ke"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <InputField
                    label="Sender Display Name"
                    placeholder="e.g. Central Command Center HQ"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={saving}
                  className="text-xs h-9 px-4 whitespace-nowrap shrink-0"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  Save SMTP Settings
                </Button>
              </div>
            </form>
          </div>

          {/* Recipients & Distribution List Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Alert Distribution List</h2>
              </div>
              <span className="text-xs text-slate-400">
                {recipients.length} Recipient{recipients.length === 1 ? '' : 's'}
              </span>
            </div>

            <form onSubmit={handleAddRecipient} className="flex gap-2">
              <input
                type="email"
                placeholder="Enter email to receive critical alerts (e.g. admin@org.com)"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
              />
              <Button
                type="submit"
                variant="secondary"
                className="text-xs h-9 px-3.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Recipient
              </Button>
            </form>

            <div className="flex flex-wrap gap-2 pt-1 min-h-[44px]">
              {recipients.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2">
                  No explicit recipients added. Fallback will deliver to primary administrator email.
                </div>
              ) : (
                recipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-950 border border-slate-800 text-slate-200 rounded-lg text-xs font-mono"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(email)}
                      className="text-slate-500 hover:text-rose-400 ml-1 transition-colors"
                      title="Remove Recipient"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Trigger Rules & Live Health Status (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Health & Diagnostic Status Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Gateway Telemetry</h2>
              </div>
              <button
                onClick={loadData}
                className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1 transition-colors"
                title="Refresh Status"
              >
                <RefreshCw size={13} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg">
                <span className="text-slate-400">Connection Status:</span>
                {lastTestStatus === 'SUCCESS' ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={14} /> Verified Operational
                  </span>
                ) : lastTestStatus === 'FAILED' ? (
                  <span className="text-rose-400 font-semibold flex items-center gap-1">
                    <AlertTriangle size={14} /> Last Probe Failed
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium">Untested</span>
                )}
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg">
                <span className="text-slate-400">Last Verified At:</span>
                <span className="text-slate-200 font-mono">
                  {lastTestedAt ? new Date(lastTestedAt).toLocaleString() : 'Never'}
                </span>
              </div>

              {lastTestError && (
                <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-lg text-rose-300 text-[11px] font-mono leading-relaxed break-words">
                  <div className="font-bold uppercase text-[10px] text-rose-400 mb-1">Last Error Details:</div>
                  {lastTestError}
                </div>
              )}

              <Button
                variant="secondary"
                onClick={() => {
                  setTestModalOpen(true);
                  setTestResult(null);
                }}
                className="w-full text-xs h-9 justify-center whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 mr-1.5 text-brand-400" />
                Test SMTP Connection Now
              </Button>
            </div>
          </div>

          {/* Incident Trigger Rules Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-brand-400" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Critical Alert Triggers</h2>
              </div>
              <span className="text-[11px] text-brand-400">Real-Time Dispatch</span>
            </div>

            <div className="space-y-3">
              {/* Trigger 1: Login Security Alert */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Key size={13} className="text-sky-400" />
                    <span>Operator Sign-In & Login Alerts</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Sends an instant alert with IP, timestamp & device when any user signs in.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notifyOnLogin}
                    onChange={(e) => setNotifyOnLogin(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              {/* Trigger 2: Outages */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <AlertCircle size={13} className="text-rose-400" />
                    <span>Application & Service Outages</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Dispatches immediately when a website or container transitions to OFFLINE.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notifyOnOutage}
                    onChange={(e) => setNotifyOnOutage(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              {/* Trigger 3: SSL Expiry */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Shield size={13} className="text-amber-400" />
                    <span>SSL Certificate Expiry Warnings</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Alerts when certificates expire in under 30 days or fail auto-renewal.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notifyOnSslExpiry}
                    onChange={(e) => setNotifyOnSslExpiry(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              {/* Trigger 4: DNS Mismatch */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Globe size={13} className="text-indigo-400" />
                    <span>Live DNS IP Mismatch Alerts</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Alerts when resolving ping IP differs from hosting VPS server IP.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notifyOnDnsMismatch}
                    onChange={(e) => setNotifyOnDnsMismatch(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              {/* Trigger 5: Failed Deployments */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Server size={13} className="text-purple-400" />
                    <span>Failed Git & Docker Deployments</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Alerts when 1-click pull, container build, or reload errors occur.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notifyOnFailedDeployment}
                    onChange={(e) => setNotifyOnFailedDeployment(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              {/* Trigger 6: High Severity System Alerts */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-amber-400" />
                    <span>High Resource & Hardware Alerts</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Alerts when CPU &gt; 95%, RAM &gt; 90%, or disk capacity reaches critical threshold.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notifyOnCriticalAlert}
                    onChange={(e) => setNotifyOnCriticalAlert(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Dispatch Audit Log Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Recent Notification Dispatch Audit Logs
            </h2>
          </div>
          <Button
            variant="ghost"
            onClick={refreshLogs}
            isLoading={logsLoading}
            className="text-xs h-8 px-2.5 whitespace-nowrap shrink-0 text-slate-400 hover:text-white"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh Logs
          </Button>
        </div>

        {logs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs font-mono">
            NO NOTIFICATION AUDIT LOGS RECORDED YET. TRIGGER A TEST EMAIL TO VERIFY GATEWAY.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse table-fixed">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-semibold">
                  <th className="py-2.5 px-3 w-28">Status</th>
                  <th className="py-2.5 px-3 w-32">Event Type</th>
                  <th className="py-2.5 px-3 w-56">Recipient</th>
                  <th className="py-2.5 px-3">Subject & Diagnostic Details</th>
                  <th className="py-2.5 px-3 w-44 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((log) => {
                  const isSent = log.status === 'SENT';
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3">
                        {isSent ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 size={11} /> SENT
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 inline-flex items-center gap-1 whitespace-nowrap">
                            <AlertTriangle size={11} /> FAILED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[11px] text-slate-300 font-semibold">{log.event_type}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 truncate" title={log.recipient}>
                        {log.recipient}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-100 font-sans font-medium text-xs truncate" title={log.subject}>
                          {log.subject}
                        </div>
                        {log.error_message && (
                          <div className="text-[11px] text-rose-400 mt-0.5 truncate" title={log.error_message}>
                            Error: {log.error_message}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400 text-[11px]">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Test Connection Modal */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-semibold text-white">Send SMTP Verification Email</h3>
              </div>
              <button
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Verify your SMTP server configuration, TLS socket handshake, and deliverability by sending an authentic test alert.
            </p>

            <form onSubmit={handleSendTestEmail} className="space-y-4">
              <InputField
                label="Destination Recipient Email"
                type="email"
                placeholder="e.g. mettoalex@gmail.com"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                required
              />

              {testResult && (
                <div
                  className={`p-3 rounded-lg text-xs leading-relaxed ${
                    testResult.success
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/60 border border-rose-800 text-rose-300'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5 mb-1">
                    {testResult.success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <span>{testResult.success ? 'SMTP Verification Passed' : 'SMTP Verification Failed'}</span>
                  </div>
                  <div>{testResult.message}</div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setTestModalOpen(false)}
                  className="text-xs h-9 px-3 whitespace-nowrap"
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={testing}
                  className="text-xs h-9 px-4 whitespace-nowrap bg-brand-600 hover:bg-brand-500"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {testing ? 'Sending Email...' : 'Send Test Email Now'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
