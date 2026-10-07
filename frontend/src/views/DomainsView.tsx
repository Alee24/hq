import React, { useEffect, useState } from 'react';
import { Globe, Plus, RefreshCw, ShieldCheck, ShieldAlert, ExternalLink, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { DomainItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';

export const DomainsView: React.FC = () => {
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Delete Domain Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedDomainForDelete, setSelectedDomainForDelete] = useState<DomainItem | null>(null);


  // Add Domain Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newIp, setNewIp] = useState('');

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

  const handleVerifySsl = async (d: DomainItem) => {
    setVerifyingId(d.id);
    try {
      await api.verifyDomainSsl(d.id);
      await loadDomains();
    } catch (err: any) {
      alert(err.message || 'SSL verification probe failed');
    } finally {
      setVerifyingId(null);
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
    } catch (err: any) {
      alert(err.message || 'Failed to register domain');
    }
  };

  const executeConfirmedDelete = async () => {
    if (!selectedDomainForDelete) return;
    setDeleteModalOpen(false);
    try {
      await api.deleteDomain(selectedDomainForDelete.id);
      loadDomains();
    } catch (err: any) {
      alert(err.message || 'Failed to delete domain');
    } finally {
      setSelectedDomainForDelete(null);
    }
  };


  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Domain & SSL Certificate Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Continuous DNS resolution monitoring, TLS/SSL certificate lifecycle, and automatic renewal alerts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadDomains()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
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
                    Loading domain records...
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
                domains.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">
                      <div className="flex items-center gap-1.5 mono">
                        <span>{d.domain_name}</span>
                        <a
                          href={`https://${d.domain_name}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-500 hover:text-brand-400"
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
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleVerifySsl(d)}
                          disabled={verifyingId === d.id}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-medium border border-slate-700 transition-colors"
                        >
                          {verifyingId === d.id ? 'Verifying...' : 'Verify TLS'}
                        </button>
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
                ))
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

