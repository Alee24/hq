import React, { useEffect, useState } from 'react';
import {
  Key,
  Plus,
  RefreshCw,
  Download,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Ban,
  FileCode,
  Users
} from 'lucide-react';
import { api } from '../api/client';
import { LicenseItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export const LicensesView: React.FC = () => {
  const [licenses, setLicenses] = useState<LicenseItem[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [publicKeyModalOpen, setPublicKeyModalOpen] = useState(false);
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [activationsModalLicense, setActivationsModalLicense] = useState<LicenseItem | null>(null);
  const [downloadingLicId, setDownloadingLicId] = useState<string | null>(null);

  // Form
  const [productName, setProductName] = useState('Enterprise Software Suite');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [licenseType, setLicenseType] = useState('Enterprise');
  const [allowedInstalls, setAllowedInstalls] = useState(5);
  const [expiresInDays, setExpiresInDays] = useState(365);

  const loadData = async () => {
    try {
      const [list, m] = await Promise.all([
        api.listLicenses(),
        api.getLicenseMetrics(),
      ]);
      setLicenses(list);
      setMetrics(m);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createLicense({
        product_name: productName,
        customer_name: customerName,
        customer_email: customerEmail,
        license_type: licenseType,
        allowed_installations: Number(allowedInstalls),
        expires_in_days: Number(expiresInDays),
      });
      setCreateModalOpen(false);
      setCustomerName('');
      setCustomerEmail('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to generate signed license');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this enterprise license? Applications running this key will immediately fail validation.')) return;
    try {
      await api.revokeLicense(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Revocation failed');
    }
  };

  const handleRenew = async (id: string) => {
    try {
      await api.renewLicense(id, 365);
      alert('License successfully renewed for +365 days.');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Renewal failed');
    }
  };

  const handleDownloadKey = async (licId: string, filename: string) => {
    setDownloadingLicId(licId);
    try {
      await api.downloadLicenseKey(licId, filename);
    } catch (err: any) {
      alert(err.message || 'Failed to download license key file');
    } finally {
      setDownloadingLicId(null);
    }
  };

  const handleViewPublicKey = async () => {
    try {
      const res = await api.getPublicKey();
      setPublicKeyPem(res.public_key_pem);
      setPublicKeyModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch public key');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Enterprise Cryptographic License Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Asymmetric Ed25519 signed digital license authorities, online quota validation, and offline verification file distribution.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleViewPublicKey}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white text-xs font-semibold transition-colors"
          >
            <FileCode size={13} />
            <span>Public Verification Key</span>
          </button>

          <button
            onClick={() => loadData()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>Generate Digital License</span>
          </button>
        </div>
      </div>

      {/* Expiration Horizons & Summary Row (Section 17) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Licenses</span>
          <div className="text-2xl font-bold text-white mono">{metrics?.total || licenses.length}</div>
          <div className="text-[11px] text-emerald-400 font-semibold">{metrics?.active || 0} Currently Active</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Expiring &le; 7 Days</span>
          <div className="text-2xl font-bold text-rose-400 mono">{metrics?.expiring_within_7_days || 0}</div>
          <div className="text-[11px] text-rose-400">Critical renewal required</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Expiring &le; 30 Days</span>
          <div className="text-2xl font-bold text-amber-400 mono">{metrics?.expiring_within_30_days || 0}</div>
          <div className="text-[11px] text-amber-400">Advance notices dispatched</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Expiring &le; 90 Days</span>
          <div className="text-2xl font-bold text-brand-400 mono">{metrics?.expiring_within_90_days || 0}</div>
          <div className="text-[11px] text-slate-400">Upcoming renewals</div>
        </div>
      </div>

      {/* Licenses Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-4">License Identifier</th>
                <th className="py-3 px-4">Licensed Customer & Organization</th>
                <th className="py-3 px-4">Product Suite</th>
                <th className="py-3 px-4">Type / Tier</th>
                <th className="py-3 px-4">Active / Quota</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Expires On</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Loading cryptographic license registry...
                  </td>
                </tr>
              ) : licenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="space-y-3 max-w-sm mx-auto">
                      <div className="p-3 bg-slate-950 border border-slate-800 w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-slate-400">
                        <Key size={24} />
                      </div>
                      <div className="font-semibold text-white text-sm">No Licenses Generated</div>
                      <p className="text-xs text-slate-500">
                        Issue digitally signed cryptographic Ed25519 licenses with node quota tracking.
                      </p>
                      <button
                        onClick={() => setCreateModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Plus size={14} />
                        <span>Generate Digital License</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                licenses.map((lic) => (
                  <tr key={lic.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-brand-400">
                      {lic.license_key}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{lic.customer_name}</div>
                      <div className="text-slate-400 text-[11px]">{lic.customer_email}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-200 font-medium">{lic.product_name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-slate-950 border border-slate-800">
                        {lic.license_type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setActivationsModalLicense(lic)}
                        className="mono font-semibold text-slate-200 hover:text-brand-400 hover:underline"
                      >
                        {lic.active_installations} / {lic.allowed_installations} Nodes
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={lic.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 mono text-slate-300 font-medium">
                      {new Date(lic.expires_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDownloadKey(lic.id, `${lic.license_key}.key`)}
                          disabled={downloadingLicId === lic.id}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                          title="Download Signed license.key File"
                        >
                          <Download size={13} className={downloadingLicId === lic.id ? 'animate-bounce' : ''} />
                        </button>
                        <button
                          onClick={() => handleRenew(lic.id)}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                          title="Renew (+365 Days)"
                        >
                          <RotateCcw size={13} />
                        </button>
                        <button
                          onClick={() => handleRevoke(lic.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                          title="Revoke License"
                        >
                          <Ban size={13} />
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

      {/* Generate License Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Generate Cryptographic License</h3>
            <form onSubmit={handleCreateLicense} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Customer / Organization Name</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Apex Global University"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Customer Email</label>
                <input
                  type="email"
                  required
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="e.g. compliance@apex.edu"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Product Suite</label>
                <input
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">License Tier</label>
                  <select
                    value={licenseType}
                    onChange={(e) => setLicenseType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  >
                    <option value="Enterprise">Enterprise</option>
                    <option value="Standard">Standard</option>
                    <option value="Perpetual">Perpetual</option>
                    <option value="Trial">Trial (30-day)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Allowed Node Quota</label>
                  <input
                    type="number"
                    value={allowedInstalls}
                    onChange={(e) => setAllowedInstalls(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Validity Duration (Days)</label>
                <input
                  type="number"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
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
                  Sign & Issue License
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Public Key Modal */}
      {publicKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-white">Master Ed25519 Public Verification Key</h4>
              <button onClick={() => setPublicKeyModalOpen(false)} className="text-xs text-slate-400 hover:text-white">
                Close
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Distribute this public key to client applications for offline digital signature validation. The private signing key never leaves the central server.
            </p>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto select-all">
              {publicKeyPem}
            </pre>
          </div>
        </div>
      )}

      {/* Activations Modal */}
      {activationsModalLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h4 className="text-sm font-semibold text-white">Registered Machine Activations</h4>
                <div className="text-xs text-brand-400 font-mono mt-0.5">{activationsModalLicense.license_key}</div>
              </div>
              <button onClick={() => setActivationsModalLicense(null)} className="text-xs text-slate-400 hover:text-white">
                Close
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {activationsModalLicense.activations?.length === 0 ? (
                <div className="py-8 text-center text-slate-500">No active machines registered yet.</div>
              ) : (
                activationsModalLicense.activations?.map((act) => (
                  <div key={act.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{act.hostname}</div>
                      <div className="text-slate-400 text-[11px] mono mt-0.5">IP: {act.ip_address} • Fingerprint: {act.installation_fingerprint}</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-400 mono">
                      <div>Activated: {new Date(act.activated_at).toLocaleDateString()}</div>
                      <div>Validated: {new Date(act.last_validated_at).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
