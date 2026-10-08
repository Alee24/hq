import React, { useEffect, useState, useRef } from 'react';
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
  Users,
  Copy,
  ExternalLink,
  Laptop,
  Check,
  Server,
  Radio
} from 'lucide-react';
import { api } from '../api/client';

export const LicensesView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Summary State
  const [totalLicenses, setTotalLicenses] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [publicKeyB64, setPublicKeyB64] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  // Tables State
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activations, setActivations] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);

  // Generator Modal State
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genCustomer, setGenCustomer] = useState('');
  const [genEmail, setGenEmail] = useState('');
  const [genProduct, setGenProduct] = useState('Smart Campus GatePass & Access Suite');
  const [genTier, setGenTier] = useState('Enterprise');
  const [genLimit, setGenLimit] = useState(5);
  const [genDays, setGenDays] = useState(365);
  const [generating, setGenerating] = useState(false);
  const [generatedCert, setGeneratedCert] = useState<string | null>(null);
  const [generatedLicId, setGeneratedLicId] = useState<string | null>(null);
  const [copiedCert, setCopiedCert] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);

  const loadData = async (silent: boolean = false) => {
    if (!silent) setRefreshing(true);
    try {
      const summary = await api.getLicensingSummary();
      setTotalLicenses(summary.total_licenses ?? 0);
      setTotalNodes(summary.total_nodes ?? 0);
      setTotalAlerts(summary.total_alerts ?? 0);
      setPublicKeyB64(summary.public_key_b64 || '');
      setAlerts(summary.alerts || []);
      setActivations(summary.activations || []);
      setLicenses(summary.licenses || []);
    } catch (err) {
      console.error('Failed to load licensing telemetry:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Establish WebSocket Connection for real-time live events
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;

    const connectWs = () => {
      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'INITIAL_SNAPSHOT' && msg.data) {
              setTotalLicenses(msg.data.total_licenses);
              setTotalNodes(msg.data.total_nodes);
              setTotalAlerts(msg.data.total_alerts);
            } else if (
              ['ACTIVATION_UPDATE', 'TELEMETRY_ALERT', 'LICENSE_GENERATED', 'LICENSE_STATUS_CHANGED'].includes(msg.type)
            ) {
              loadData(true);
            }
          } catch (e) {
            // ignore non-json keepalives
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          setTimeout(connectWs, 4000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (err) {
        setWsConnected(false);
      }
    };

    connectWs();

    // Interval fallback poll every 15s
    const pollInterval = setInterval(() => {
      loadData(true);
    }, 15000);

    return () => {
      clearInterval(pollInterval);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const handleCopyKey = () => {
    if (!publicKeyB64) return;
    navigator.clipboard.writeText(publicKeyB64);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleGenerateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await api.generateLicenseCertificate({
        customer: genCustomer,
        email: genEmail,
        product: genProduct,
        type: genTier,
        installation_limit: Number(genLimit),
        expires_in_days: Number(genDays),
      });

      setGeneratedCert(res.certificate);
      setGeneratedLicId(res.license_id);
      loadData(true);
    } catch (err: any) {
      alert('Error generating license certificate: ' + (err.message || 'Server error'));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCert = () => {
    if (!generatedCert) return;
    navigator.clipboard.writeText(generatedCert);
    setCopiedCert(true);
    setTimeout(() => setCopiedCert(false), 2000);
  };

  const handleDownloadCert = () => {
    if (!generatedCert) return;
    const blob = new Blob([generatedCert], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${generatedLicId || 'license'}.lic`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleToggleKillSwitch = async (lic: any) => {
    const isRevoked = Boolean(lic.is_revoked);
    const action = isRevoked ? 'reinstate' : 'revoke';
    const promptMsg = isRevoked
      ? `Confirm restoring authority for license ${lic.license_id}?`
      : `⚠️ KILL-SWITCH CONFIRMATION:\n\nEnter reason for revoking license ${lic.license_id}. All nodes under this license will fail verification immediately:`;

    const reason = prompt(promptMsg, isRevoked ? 'Restored by authority' : 'Terms violation or non-payment');
    if (reason === null) return; // user cancelled

    try {
      await api.toggleLicenseRevoke(lic.license_id, action, reason);
      loadData(true);
    } catch (err: any) {
      alert('Failed to update license status: ' + (err.message || 'Server error'));
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              📡 KKDES Central Software Command Center
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
              ● LIVE AUTHORITY
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                wsConnected
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {wsConnected ? '● WS SYNCED' : '○ WS CONNECTING...'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Master Licensing, Instant Kill-Switch & Telemetry Security Hub • Owner:{' '}
            <strong className="text-slate-300">Metto Alex</strong> (KKDES Software Solutions)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setGenModalOpen(true);
              setGeneratedCert(null);
              setGeneratedLicId(null);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-emerald-950/30 transition-colors"
          >
            <Plus size={14} />
            <span>Generate New License</span>
          </button>

          <button
            onClick={() => loadData()}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-60"
            title="Refresh Live Data"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <a
            href="/licensing-hub"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
            title="Open Standalone Command Center Hub"
          >
            <ExternalLink size={13} />
            <span>Standalone Hub</span>
          </a>
        </div>
      </div>

      {/* Top 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Issued Licenses
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {loading ? '-' : totalLicenses}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Active Connected Nodes
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 mt-2">
            {loading ? '-' : totalNodes}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Security Alerts Detected
          </div>
          <div
            className={`text-3xl font-extrabold mt-2 ${
              totalAlerts > 0 ? 'text-red-400' : 'text-slate-400'
            }`}
          >
            {loading ? '-' : totalAlerts}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Public Verification Key
            </div>
            <div
              className="text-xs font-mono text-slate-300 mt-2 truncate bg-slate-950/60 px-2.5 py-1.5 rounded border border-slate-800"
              title={publicKeyB64}
            >
              {publicKeyB64 ? `${publicKeyB64.slice(0, 24)}...` : 'Loading...'}
            </div>
          </div>
          <button
            onClick={handleCopyKey}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            {copiedKey ? <Check size={12} /> : <Copy size={12} />}
            <span>{copiedKey ? 'Key Copied!' : 'Copy Verification Key'}</span>
          </button>
        </div>
      </div>

      {/* Section 1: 🚨 Security Telemetry & Unauthorized Alerts */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              🚨 Security Telemetry & Unauthorized Alerts ({alerts.length})
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No security alerts recorded. All connected instances are running within authorized limits.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Alert Event</th>
                  <th className="py-2.5 px-4">Machine ID</th>
                  <th className="py-2.5 px-4">Origin Host / IP</th>
                  <th className="py-2.5 px-4">Violation Reason</th>
                  <th className="py-2.5 px-4 text-right">Detected At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {alerts.map((alt, idx) => (
                  <tr key={idx} className="bg-red-950/10 hover:bg-red-950/20 transition-colors">
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950/80 text-red-400 border border-red-800/50">
                        <AlertTriangle size={11} />
                        <span>{alt.alert_type}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {alt.machine_id ? alt.machine_id.slice(0, 20) : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <div className="font-medium">{alt.hostname || 'N/A'}</div>
                      <div className="font-mono text-[11px] text-slate-400">{alt.ip_address}</div>
                    </td>
                    <td className="py-3 px-4 text-red-200 font-medium">{alt.reason}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400 text-[11px]">
                      {String(alt.detected_at || alt.created_at).replace('T', ' ').slice(0, 19)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Section 2: 💻 Active Deployed Nodes & Connect-Back Telemetry */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              💻 Active Deployed Nodes & Connect-Back Telemetry ({activations.length})
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {activations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No active client installations registered yet. When a client activates a license, it will appear here instantly.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                <tr>
                  <th className="py-2.5 px-4">License ID</th>
                  <th className="py-2.5 px-4">Client / Customer</th>
                  <th className="py-2.5 px-4">Hardware ID</th>
                  <th className="py-2.5 px-4">Host / IP</th>
                  <th className="py-2.5 px-4">Application Suite</th>
                  <th className="py-2.5 px-4">Last Heartbeat</th>
                  <th className="py-2.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {activations.map((node, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                      {node.license_id}
                    </td>
                    <td className="py-3 px-4 font-medium text-white">
                      {node.customer || node.client_name || 'Node'}
                    </td>
                    <td
                      className="py-3 px-4 font-mono text-[11px] text-slate-400 truncate max-w-[140px]"
                      title={node.machine_id}
                    >
                      {node.machine_id ? `${node.machine_id.slice(0, 16)}...` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <div className="font-mono text-xs">{node.hostname || 'N/A'}</div>
                      <div className="font-mono text-[11px] text-slate-400">{node.ip_address}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <div>{node.app_name || 'Smart Campus Suite'}</div>
                      <div className="text-[11px] text-slate-400">{node.app_version || 'v1.0.0'}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {String(node.last_heartbeat).replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {node.status === 'REVOKED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-950 text-rose-400 border border-rose-800/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          <span>REVOKED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span>{node.status || 'ACTIVE'}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Section 3: 📜 Master Licenses Directory & Kill-Switch */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              📜 Master Licenses Directory & Kill-Switch ({licenses.length})
            </span>
          </div>
          <button
            onClick={() => {
              setGenModalOpen(true);
              setGeneratedCert(null);
              setGeneratedLicId(null);
            }}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors"
          >
            <Plus size={12} />
            <span>Issue License</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          {licenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No licenses issued yet. Click "Generate New License" to issue an enterprise license.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                <tr>
                  <th className="py-2.5 px-4">License ID</th>
                  <th className="py-2.5 px-4">Customer & Email</th>
                  <th className="py-2.5 px-4">Product / Tier</th>
                  <th className="py-2.5 px-4">Node Quota</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Expires</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {licenses.map((lic, idx) => {
                  const used = lic.active_nodes ?? 0;
                  const limit = lic.installation_limit ?? 1;
                  const isRevoked = Boolean(lic.is_revoked);

                  return (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white">
                        {lic.license_id}
                      </td>
                      <td className="py-3 px-4 text-slate-200">
                        <div className="font-semibold">{lic.customer}</div>
                        <div className="text-[11px] text-slate-400">{lic.email || 'N/A'}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        <div>{lic.product}</div>
                        <div className="text-[11px] text-slate-400">{lic.type || 'Enterprise'}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        <span
                          className={`font-bold ${
                            used >= limit ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {used}
                        </span>{' '}
                        <span className="text-slate-400">/ {limit} Nodes</span>
                      </td>
                      <td className="py-3 px-4">
                        {isRevoked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950 text-red-400 border border-red-800/60">
                            ⚡ REVOKED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                            ● ACTIVE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                        {String(lic.expires_at || '').slice(0, 10)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleToggleKillSwitch(lic)}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            isRevoked
                              ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm'
                              : 'bg-red-700 hover:bg-red-600 text-white shadow-sm'
                          }`}
                        >
                          {isRevoked ? '✓ Restore' : '⚡ Kill-Switch'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 1-Click License Generator Modal */}
      {genModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Key size={16} className="text-emerald-400" />
                <span>Generate Asymmetric Signed License</span>
              </h3>
              <button
                onClick={() => setGenModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {!generatedCert ? (
              <form onSubmit={handleGenerateLicense} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Customer / Institution Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={genCustomer}
                    onChange={(e) => setGenCustomer(e.target.value)}
                    placeholder="e.g. RU Smart Campus"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={genEmail}
                    onChange={(e) => setGenEmail(e.target.value)}
                    placeholder="e.g. licensing@ru.ac.ke"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Product Name
                    </label>
                    <input
                      type="text"
                      value={genProduct}
                      onChange={(e) => setGenProduct(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Tier</label>
                    <select
                      value={genTier}
                      onChange={(e) => setGenTier(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Enterprise">Enterprise</option>
                      <option value="Standard">Standard</option>
                      <option value="Perpetual">Perpetual</option>
                      <option value="Trial">Trial</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Node Quota (Max Concurrent)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={genLimit}
                      onChange={(e) => setGenLimit(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Validity (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={genDays}
                      onChange={(e) => setGenDays(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setGenModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={generating}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors disabled:opacity-60"
                  >
                    {generating ? 'Cryptographically Signing...' : 'Sign & Issue Certificate'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 size={16} />
                  <span>
                    License Issued Successfully: <strong className="font-mono text-white">{generatedLicId}</strong>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Signed Certificate (.lic payload):
                  </label>
                  <textarea
                    readOnly
                    value={generatedCert}
                    rows={8}
                    className="w-full p-3 font-mono text-[11px] bg-slate-950 border border-slate-800 rounded-lg text-emerald-300 select-all focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyCert}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      {copiedCert ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedCert ? 'Copied!' : 'Copy Certificate'}</span>
                    </button>
                    <button
                      onClick={handleDownloadCert}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      <Download size={13} />
                      <span>Download .lic File</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setGenModalOpen(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
