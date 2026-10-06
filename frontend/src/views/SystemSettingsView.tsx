import React, { useState } from 'react';
import { Settings, Shield, Bell, Database, Lock, Save, CheckCircle2 } from 'lucide-react';

export const SystemSettingsView: React.FC = () => {
  const [webhookUrl, setWebhookUrl] = useState('https://hooks.slack.com/services/T00/B00/X00');
  const [monitorInterval, setMonitorInterval] = useState(60);
  const [sessionTimeout, setSessionTimeout] = useState(1440);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header Bar */}
      <div className="pb-2 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          Enterprise System Settings
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Global command center orchestration thresholds, webhook integrations, and security policies.
        </p>
      </div>

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
                value={monitorInterval}
                onChange={(e) => setMonitorInterval(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Session Idle Timeout (Minutes)
              </label>
              <input
                type="number"
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              />
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
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 mono"
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
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div>
                <div className="font-semibold text-white">Cryptographic License Signing Engine</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Ed25519 Curve25519 asymmetric authority</div>
              </div>
              <span className="text-emerald-400 font-semibold">ACTIVE</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
              <div>
                <div className="font-semibold text-white">Strict Whitelist Agent Execution</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Arbitrary shell execution blocked globally</div>
              </div>
              <span className="text-emerald-400 font-semibold">ENFORCED</span>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium animate-in fade-in">
              <CheckCircle2 size={14} /> Settings updated successfully
            </span>
          )}
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Save size={14} />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};
