import React, { useState, useEffect } from 'react';
import { Settings, Shield, Bell, Database, Lock, Save, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../api/client';

export const SystemSettingsView: React.FC = () => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [monitorInterval, setMonitorInterval] = useState(60);
  const [sessionTimeout, setSessionTimeout] = useState(1440);
  const [licenseSigningEnforced, setLicenseSigningEnforced] = useState(true);
  const [whitelistAgentExecution, setWhitelistAgentExecution] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getSystemSettings();
      setWebhookUrl(res.webhook_url);
      setMonitorInterval(res.monitor_interval);
      setSessionTimeout(res.session_timeout);
      setLicenseSigningEnforced(res.license_signing_enforced);
      setWhitelistAgentExecution(res.whitelist_agent_execution);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load system settings from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await api.updateSystemSettings({
        webhook_url: webhookUrl,
        monitor_interval: Number(monitorInterval),
        session_timeout: Number(sessionTimeout),
        license_signing_enforced: licenseSigningEnforced,
        whitelist_agent_execution: whitelistAgentExecution,
      });
      setWebhookUrl(res.webhook_url);
      setMonitorInterval(res.monitor_interval);
      setSessionTimeout(res.session_timeout);
      setLicenseSigningEnforced(res.license_signing_enforced);
      setWhitelistAgentExecution(res.whitelist_agent_execution);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save system settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Enterprise System Settings
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Global command center orchestration thresholds, webhook integrations, and security policies.
          </p>
        </div>

        <button
          onClick={loadSettings}
          disabled={loading}
          className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors self-start sm:self-auto"
          title="Reload Settings"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-950/70 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-xs">
          Loading enterprise system configuration...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Monitoring & Probes Section */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Settings size={16} className="text-brand-400" />
              Monitoring & Polling Parameters
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Synthetic Check Interval (Seconds)
                </label>
                <input
                  type="number"
                  min="10"
                  max="3600"
                  required
                  value={monitorInterval}
                  onChange={(e) => setMonitorInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-brand-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Frequency of background node probes (10s – 3600s).</span>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Session Idle Timeout (Minutes)
                </label>
                <input
                  type="number"
                  min="15"
                  max="10080"
                  required
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-brand-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">JWT authentication token validity window.</span>
              </div>
            </div>
          </div>

          {/* Webhooks & Alerts Section */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bell size={16} className="text-amber-400" />
              Global Notification Webhook Dispatcher
            </h3>
            <div className="space-y-2 text-xs">
              <label className="block text-slate-300 font-semibold">
                Outgoing Webhook Endpoint (Slack / Discord / Teams / Custom)
              </label>
              <input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 mono focus:outline-none focus:border-brand-500"
              />
              <p className="text-[11px] text-slate-500">
                High-severity alerts, failed deployments, and server health drops will dispatch standardized JSON payloads to this endpoint.
              </p>
            </div>
          </div>

          {/* Security & Cryptography Standards */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield size={16} className="text-emerald-400" />
              Enterprise Security Policies
            </h3>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <div className="font-semibold text-white">Cryptographic License Signing Engine</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Ed25519 Curve25519 asymmetric digital authority enforcement</div>
                </div>
                <button
                  type="button"
                  onClick={() => setLicenseSigningEnforced(!licenseSigningEnforced)}
                  className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${
                    licenseSigningEnforced
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  {licenseSigningEnforced ? 'ACTIVE' : 'DISABLED'}
                </button>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <div className="font-semibold text-white">Strict Whitelist Agent Execution</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Only pre-approved command tokens and monitoring scripts executable</div>
                </div>
                <button
                  type="button"
                  onClick={() => setWhitelistAgentExecution(!whitelistAgentExecution)}
                  className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${
                    whitelistAgentExecution
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  {whitelistAgentExecution ? 'ENFORCED' : 'PERMISSIVE'}
                </button>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium animate-in fade-in">
                <CheckCircle2 size={14} /> Settings permanently saved to database
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
