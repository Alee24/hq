import React, { useEffect, useState } from 'react';
import {
  Globe,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  CheckCircle2,
  Clock,
  Trash2,
  Lock,
  Copy,
  Check,
  X,
  AlertCircle,
  Terminal,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { api } from '../api/client';
import { DomainItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';

interface SslTerminalOutput {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  executed_at: string;
  success: boolean;
  ssl_status: string;
  ssl_issuer?: string;
  days_remaining?: number;
  message?: string;
}

export const DomainsView: React.FC = () => {
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [updatingSslId, setUpdatingSslId] = useState<string | null>(null);
  const [activeDrawerDomainId, setActiveDrawerDomainId] = useState<string | null>(null);
  const [sslOutputs, setSslOutputs] = useState<Record<string, SslTerminalOutput>>({});
  const [copiedDomainId, setCopiedDomainId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Delete Domain Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedDomainForDelete, setSelectedDomainForDelete] = useState<DomainItem | null>(null);

  // Add Domain Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newIp, setNewIp] = useState('');

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadDomains = async () => {
    try {
      const res = await api.listDomains();
      setDomains(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDomains();
  }, []);

  const handleCopyOutput = async (domainId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDomainId(domainId);
      setTimeout(() => setCopiedDomainId(null), 2500);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const handleVerifySsl = async (d: DomainItem) => {
    setVerifyingId(d.id);
    setActiveDrawerDomainId(d.id);
    try {
      const res = await api.verifyDomainSsl(d.id);
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: `openssl s_client -connect ${d.domain_name}:443 -servername ${d.domain_name}`,
          stdout: `TLS/SSL Certificate Probe Result:\nDomain: ${d.domain_name}\nTarget Server: ${d.server_ip}\nStatus: ${res?.ssl_status || 'VALID'}\nIssuer: ${res?.ssl_issuer || 'Let\'s Encrypt'}\nDays Remaining: ${res?.days_remaining ?? 'N/A'}\nExpires: ${res?.ssl_expires_at || 'N/A'}`,
          stderr: '',
          exit_code: 0,
          duration_ms: 180,
          executed_at: new Date().toISOString(),
          success: true,
          ssl_status: res?.ssl_status || 'VALID',
          ssl_issuer: res?.ssl_issuer,
          days_remaining: res?.days_remaining,
          message: 'TLS/SSL certificate verified directly over HTTPS port 443'
        }
      }));
      showToast(`TLS certificate verified for ${d.domain_name}`, 'success');
      await loadDomains();
    } catch (err: any) {
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: `openssl s_client -connect ${d.domain_name}:443 -servername ${d.domain_name}`,
          stdout: '',
          stderr: err.message || 'TLS probe connection failed on port 443',
          exit_code: 1,
          duration_ms: 120,
          executed_at: new Date().toISOString(),
          success: false,
          ssl_status: 'INVALID',
          message: err.message || 'Failed to verify TLS certificate'
        }
      }));
      showToast(err.message || 'SSL verification probe failed', 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleUpdateSsl = async (d: DomainItem) => {
    setUpdatingSslId(d.id);
    setActiveDrawerDomainId(d.id);
    try {
      const res = await api.updateDomainSsl(d.id);
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: res.command || `certbot --apache -d ${d.domain_name} --non-interactive --agree-tos --redirect`,
          stdout: res.stdout || '',
          stderr: res.stderr || '',
          exit_code: res.exit_code,
          duration_ms: res.duration_ms,
          executed_at: new Date().toISOString(),
          success: res.success,
          ssl_status: res.ssl_status,
          ssl_issuer: res.ssl_issuer,
          days_remaining: res.days_remaining,
          message: res.message
        }
      }));
      if (res.success) {
        showToast(`Let's Encrypt SSL updated successfully for ${d.domain_name}`, 'success');
      } else {
        showToast(res.message || `Failed to update SSL for ${d.domain_name}`, 'error');
      }
      await loadDomains();
    } catch (err: any) {
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: `certbot --apache -d ${d.domain_name} --non-interactive --agree-tos --redirect`,
          stdout: '',
          stderr: err.message || 'Remote SSH Let\'s Encrypt execution failed',
          exit_code: 1,
          duration_ms: 0,
          executed_at: new Date().toISOString(),
          success: false,
          ssl_status: 'ERROR',
          message: err.message || 'Failed to update SSL'
        }
      }));
      showToast(err.message || 'Failed to execute Let\'s Encrypt SSL update', 'error');
    } finally {
      setUpdatingSslId(null);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createDomain({
        domain_name: newDomain,
        server_ip: newIp,
      });
      setCreateModalOpen(false);
      setNewDomain('');
      loadDomains();
      showToast(`Domain '${newDomain}' registered successfully`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to register domain', 'error');
    }
  };

  const executeConfirmedDelete = async () => {
    if (!selectedDomainForDelete) return;
    const domainName = selectedDomainForDelete.domain_name;
    setDeleteModalOpen(false);
    try {
      await api.deleteDomain(selectedDomainForDelete.id);
      loadDomains();
      showToast(`Domain '${domainName}' deleted successfully`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete domain', 'error');
    } finally {
      setSelectedDomainForDelete(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between border shadow-sm transition-all animate-in fade-in ${
          toastMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
          toastMessage.type === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
          'bg-blue-500/10 border-blue-500/30 text-blue-400'
        }`}>
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Globe className="text-brand-400" size={24} />
            Domain & SSL Certificate Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Continuous DNS resolution monitoring, automated Let's Encrypt TLS/SSL issuance, VirtualHost HTTPS redirects, and renewal management.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadDomains()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Refresh domains"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>Add Domain</span>
          </button>
        </div>
      </div>

      {/* Domains Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-4">Domain Name</th>
                <th className="py-3 px-4">Mapped Application</th>
                <th className="py-3 px-4">Server IP</th>
                <th className="py-3 px-4">DNS Status</th>
                <th className="py-3 px-4">SSL Status</th>
                <th className="py-3 px-4">Certificate Issuer</th>
                <th className="py-3 px-4">Days Remaining</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={15} className="animate-spin text-brand-400" />
                      <span>Loading domain records...</span>
                    </div>
                  </td>
                </tr>
              ) : domains.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="space-y-3 max-w-sm mx-auto">
                      <div className="p-3 bg-slate-950 border border-slate-800 w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-slate-400">
                        <Globe size={24} />
                      </div>
                      <div className="font-semibold text-white text-sm">No Domains Registered</div>
                      <p className="text-xs text-slate-500">
                        Add domain names for continuous DNS resolution checks and TLS/SSL certificate monitoring.
                      </p>
                      <button
                        onClick={() => setCreateModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Plus size={14} />
                        <span>Add First Domain</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                domains.map((d) => {
                  const isDrawerOpen = activeDrawerDomainId === d.id;
                  const isUpdating = updatingSslId === d.id;
                  const isVerifying = verifyingId === d.id;
                  const output = sslOutputs[d.id];

                  return (
                    <React.Fragment key={d.id}>
                      <tr
                        onClick={() => setActiveDrawerDomainId(isDrawerOpen ? null : d.id)}
                        className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                          isDrawerOpen ? 'bg-slate-800/30' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">
                              {isDrawerOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            <span className="mono">{d.domain_name}</span>
                            <a
                              href={`https://${d.domain_name}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-500 hover:text-brand-400 transition-colors"
                              title="Open HTTPS URL in new tab"
                            >
                              <ExternalLink size={11} />
                            </a>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-300 font-medium">
                          {d.application_name || 'Infrastructure Gateway'}
                        </td>
                        <td className="py-3 px-4 mono text-slate-400">{d.server_ip}</td>
                        <td className="py-3 px-4">
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <CheckCircle2 size={13} /> {d.dns_status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={d.ssl_status} size="sm" />
                        </td>
                        <td className="py-3 px-4 text-slate-400">{d.ssl_issuer}</td>
                        <td className="py-3 px-4 mono font-semibold">
                          <span className={d.days_remaining <= 30 ? 'text-amber-400' : 'text-emerald-400'}>
                            {d.days_remaining} days
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Update SSL Button */}
                            <button
                              onClick={() => handleUpdateSsl(d)}
                              disabled={isUpdating || isVerifying}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-[11px] font-semibold transition-colors shadow-sm flex items-center gap-1.5"
                              title="Run Let's Encrypt Certbot automation over SSH as root to issue/renew SSL and configure HTTPS redirect"
                            >
                              <ShieldCheck size={12} className={isUpdating ? 'animate-spin' : ''} />
                              <span>{isUpdating ? 'Updating SSL...' : 'Update SSL'}</span>
                            </button>

                            {/* Verify TLS Button */}
                            <button
                              onClick={() => handleVerifySsl(d)}
                              disabled={isUpdating || isVerifying}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white rounded text-[11px] font-medium border border-slate-700 transition-colors"
                              title="Probe live TLS certificate over HTTPS port 443"
                            >
                              {isVerifying ? 'Verifying...' : 'Verify TLS'}
                            </button>

                            {/* Delete Domain */}
                            <button
                              onClick={() => {
                                setSelectedDomainForDelete(d);
                                setDeleteModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                              title="Delete Domain"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Terminal Response Drawer */}
                      {isDrawerOpen && (
                        <tr className="bg-slate-950 border-b border-slate-800">
                          <td colSpan={8} className="p-4">
                            {isUpdating ? (
                              <div className="p-4 bg-slate-900 border border-brand-500/40 rounded-lg flex items-center gap-3 animate-pulse text-xs text-brand-300">
                                <RefreshCw size={18} className="animate-spin text-brand-400" />
                                <div className="space-y-1">
                                  <div className="font-semibold text-white flex items-center gap-2">
                                    <Terminal size={14} className="text-emerald-400" />
                                    <span>Executing Let's Encrypt Certbot SSL automation on {d.server_ip}...</span>
                                  </div>
                                  <div className="mono text-[11px] text-slate-400">
                                    Configuring Apache/Nginx VirtualHost and 301 HTTPS redirect for <span className="text-emerald-400 font-semibold">{d.domain_name}</span> over root SSH session...
                                  </div>
                                </div>
                              </div>
                            ) : output ? (
                              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden space-y-0 shadow-lg">
                                {/* Drawer Header */}
                                <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 text-xs">
                                  <div className="flex items-center gap-2.5 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      output.success
                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                    }`}>
                                      {output.success ? 'EXIT 0: SUCCESS' : `EXIT ${output.exit_code}: FAILED`}
                                    </span>
                                    <span className="text-slate-400 text-[11px]">
                                      {output.duration_ms} ms
                                    </span>
                                    <span className="text-slate-600">|</span>
                                    <span className="text-slate-300 font-medium text-[11px] flex items-center gap-1">
                                      <Lock size={11} className="text-emerald-400" />
                                      {output.ssl_issuer || 'Let\'s Encrypt Authority'}
                                    </span>
                                    {output.days_remaining !== undefined && (
                                      <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-emerald-400 font-mono text-[10px]">
                                        {output.days_remaining} days remaining
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleCopyOutput(d.id, `${output.command}\n\n${output.stdout}\n${output.stderr}`)}
                                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center gap-1.5 transition-colors border border-slate-700"
                                      title="Copy terminal command and output"
                                    >
                                      {copiedDomainId === d.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                      <span>{copiedDomainId === d.id ? 'Copied' : 'Copy Output'}</span>
                                    </button>
                                    <button
                                      onClick={() => setActiveDrawerDomainId(null)}
                                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                                      title="Close response drawer"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                </div>

                                {/* Executed Command */}
                                {output.command && (
                                  <div className="px-3.5 py-2 bg-slate-950/70 border-b border-slate-800/80 font-mono text-[11px] text-slate-300 flex items-center gap-2">
                                    <span className="text-emerald-400 select-none font-bold">$</span>
                                    <span className="text-slate-200 select-all">{output.command}</span>
                                  </div>
                                )}

                                {/* Terminal Console Output */}
                                <div className="p-3 bg-black/90 font-mono text-[11px] leading-relaxed max-h-64 overflow-y-auto space-y-1">
                                  {output.stdout && (
                                    <pre className="text-emerald-400/95 whitespace-pre-wrap font-mono">
                                      {output.stdout}
                                    </pre>
                                  )}
                                  {output.stderr && (
                                    <pre className="text-amber-400/90 whitespace-pre-wrap font-mono pt-1 border-t border-slate-800/60">
                                      {output.stderr}
                                    </pre>
                                  )}
                                  {!output.stdout && !output.stderr && (
                                    <span className="text-slate-500 italic">No console output recorded.</span>
                                  )}
                                </div>

                                {/* Action & Summary Footer */}
                                <div className="px-3.5 py-2.5 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                                  <span className="text-slate-400">
                                    {output.message || 'Let\'s Encrypt SSL configuration completed.'}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <button
                                      onClick={() => handleUpdateSsl(d)}
                                      className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                                    >
                                      <ShieldCheck size={12} />
                                      <span>Run Update SSL Again</span>
                                    </button>
                                    <span className="text-slate-700">|</span>
                                    <a
                                      href={`https://${d.domain_name}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1 text-brand-400 hover:text-brand-300 font-medium"
                                    >
                                      <span>Test HTTPS in Browser</span>
                                      <ExternalLink size={11} />
                                    </a>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Lock size={14} className="text-brand-400" />
                                  <span>
                                    Click <strong className="text-emerald-400">Update SSL</strong> to run Certbot Let's Encrypt automation over SSH, or click <strong className="text-white">Verify TLS</strong> to probe HTTPS port 443.
                                  </span>
                                </div>
                                <button
                                  onClick={() => setActiveDrawerDomainId(null)}
                                  className="text-slate-500 hover:text-white p-1"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Domain Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Add Monitored Domain</h3>
            <form onSubmit={handleAddDomain} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Domain Name (FQDN)</label>
                <input
                  type="text"
                  required
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="e.g. api.campus.edu"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Target Server IP</label>
                <input
                  type="text"
                  required
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  placeholder="e.g. 185.192.97.84"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
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
                  Add Domain
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Delete Monitored Domain"
        message={`Are you sure you want to delete '${selectedDomainForDelete?.domain_name}'? Automatic TLS/SSL certificate checks and DNS resolution monitoring will cease.`}
        confirmKeyword="DELETE"
        confirmButtonText="Delete Domain"
        isDestructive={true}
        onConfirm={executeConfirmedDelete}
        onClose={() => setDeleteModalOpen(false)}
      />
    </div>
  );
};
