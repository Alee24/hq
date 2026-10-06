import React, { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, Copy, CheckCircle2, Shield } from 'lucide-react';
import { api } from '../api/client';

export const ApiKeysView: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Key Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [role, setRole] = useState('READ_ONLY');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = async () => {
    try {
      const res = await api.listApiKeys();
      setApiKeys(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createApiKey(keyName, role);
      setCreatedSecret(res.api_key);
      setKeyName('');
      loadKeys();
    } catch (err: any) {
      alert(err.message || 'Failed to generate API Key');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API token? Any remote agent using this key will immediately lose access.')) return;
    try {
      await api.revokeApiKey(id);
      loadKeys();
    } catch (err: any) {
      alert(err.message || 'Revocation failed');
    }
  };

  const copyToClipboard = () => {
    if (createdSecret) {
      navigator.clipboard.writeText(createdSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            API Keys & Machine Integrations
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Programmatic bearer tokens for remote monitoring agents, CI/CD runners, and automated lifecycle webhooks.
          </p>
        </div>

        <button
          onClick={() => {
            setCreatedSecret(null);
            setCreateModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus size={14} />
          <span>Generate API Key</span>
        </button>
      </div>

      {/* Keys Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-4">Key Name</th>
                <th className="py-3 px-4">Prefix / Identifier</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">Loading API keys...</td>
                </tr>
              ) : apiKeys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">No active machine API keys found.</td>
                </tr>
              ) : (
                apiKeys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">{k.name}</td>
                    <td className="py-3 px-4 mono text-brand-400">{k.prefix}••••••••••••</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-slate-950 border border-slate-800">
                        {k.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {k.is_active ? (
                        <span className="text-emerald-400 font-semibold text-[11px]">ACTIVE</span>
                      ) : (
                        <span className="text-rose-400 font-semibold text-[11px]">REVOKED</span>
                      )}
                    </td>
                    <td className="py-3 px-4 mono text-slate-400">{new Date(k.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-right">
                      {k.is_active && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                          title="Revoke Token"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Key Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Generate Scoped API Token</h3>

            {createdSecret ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-950/80 border border-amber-800 text-amber-300 text-xs rounded-lg">
                  <strong>Save your token now:</strong> This secret key will NEVER be shown again!
                </div>
                <div className="flex items-center gap-2 p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="flex-1 font-mono text-xs text-brand-300 break-all select-all">
                    {createdSecret}
                  </span>
                  <button
                    onClick={copyToClipboard}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded transition-colors shrink-0"
                    title="Copy Key"
                  >
                    {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateKey} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Key Description / Client Name</label>
                  <input
                    type="text"
                    required
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g. GitHub Actions Deploy Runner"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Access Role Scope</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  >
                    <option value="READ_ONLY">READ_ONLY (Telemetry & Logs)</option>
                    <option value="DEPLOYMENT_ADMIN">DEPLOYMENT_ADMIN (Pipelines & Git)</option>
                    <option value="INFRASTRUCTURE_ADMIN">INFRASTRUCTURE_ADMIN (Servers & Agents)</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN (Full Privileges)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg font-semibold"
                  >
                    Generate Token
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
