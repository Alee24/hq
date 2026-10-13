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
  Radio,
  Zap,
  Settings,
  Trash2,
  Search,
  Filter,
  Globe,
  Activity,
  Eye
} from 'lucide-react';

import { api } from '../api/client';
import { Button, InputField, SelectField, ModalShell } from '../components/common';

export const LicensesView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Summary State
  const [totalLicenses, setTotalLicenses] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const [totalOnlineNodes, setTotalOnlineNodes] = useState(0);
  const [totalOnlineLicenses, setTotalOnlineLicenses] = useState(0);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [publicKeyB64, setPublicKeyB64] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  // Tables State
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activations, setActivations] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);

  // Filtering & Search State
  const [licenseFilter, setLicenseFilter] = useState<'all' | 'online' | 'idle' | 'revoked' | 'expiring'>('all');
  const [licenseSearch, setLicenseSearch] = useState('');
  const [nodeFilter, setNodeFilter] = useState<'all' | 'online' | 'idle' | 'revoked'>('all');
  const [nodeSearch, setNodeSearch] = useState('');

  // Delete Modals State
  const [deleteLicModalOpen, setDeleteLicModalOpen] = useState(false);
  const [licenseToDelete, setLicenseToDelete] = useState<any | null>(null);
  const [deletingLic, setDeletingLic] = useState(false);

  const [deleteNodeModalOpen, setDeleteNodeModalOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<any | null>(null);
  const [deletingNode, setDeletingNode] = useState(false);

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
  const [activatingAlertId, setActivatingAlertId] = useState<string | number | null>(null);
  const [targetAlertId, setTargetAlertId] = useState<string | number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);

  const loadData = async (silent: boolean = false) => {
    if (!silent) setRefreshing(true);
    try {
      const summary = await api.getLicensingSummary();
      setTotalLicenses(summary.total_licenses ?? 0);
      setTotalNodes(summary.total_nodes ?? 0);
      setTotalOnlineNodes((summary as any).total_online_nodes ?? 0);
      setTotalOnlineLicenses((summary as any).total_online_licenses ?? 0);
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
              if (msg.data.total_online_nodes !== undefined) {
                setTotalOnlineNodes(msg.data.total_online_nodes);
              }
              if (msg.data.total_online_licenses !== undefined) {
                setTotalOnlineLicenses(msg.data.total_online_licenses);
              }
            } else if (
              [
                'ACTIVATION_UPDATE',
                'TELEMETRY_ALERT',
                'LICENSE_GENERATED',
                'LICENSE_STATUS_CHANGED',
                'LICENSE_DELETED',
                'ACTIVATION_DELETED'
              ].includes(msg.type)
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

  // Helper Functions for Online Status
  const isNodeOnline = (node: any): boolean => {
    if (node.is_online !== undefined) return Boolean(node.is_online);
    if (!node.last_heartbeat || node.status === 'REVOKED') return false;
    try {
      const hbTime = new Date(node.last_heartbeat).getTime();
      if (isNaN(hbTime)) return false;
      const diffMs = Date.now() - hbTime;
      return diffMs >= 0 && diffMs <= 15 * 60 * 1000;
    } catch {
      return false;
    }
  };

  const getHeartbeatAgo = (node: any): string => {
    if (node.last_heartbeat_ago) return node.last_heartbeat_ago;
    if (!node.last_heartbeat) return 'Never';
    try {
      const hbTime = new Date(node.last_heartbeat).getTime();
      if (isNaN(hbTime)) return 'Unknown';
      const diffSec = Math.floor((Date.now() - hbTime) / 1000);
      if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch {
      return 'Unknown';
    }
  };

  const isLicenseOnline = (lic: any): boolean => {
    if (lic.is_online !== undefined) return Boolean(lic.is_online);
    if (lic.is_revoked) return false;
    const nodesForLic = activations.filter(n => n.license_id === lic.license_id);
    return nodesForLic.some(n => isNodeOnline(n));
  };

  const getLicenseOnlineNodesCount = (lic: any): number => {
    if (lic.online_nodes !== undefined) return lic.online_nodes;
    const nodesForLic = activations.filter(n => n.license_id === lic.license_id);
    return nodesForLic.filter(n => isNodeOnline(n)).length;
  };

  // Precomputed Counts
  const onlineNodesCount = activations.filter(n => isNodeOnline(n)).length;
  const idleNodesCount = activations.filter(n => !isNodeOnline(n) && n.status !== 'REVOKED').length;
  const revokedNodesCount = activations.filter(n => n.status === 'REVOKED').length;

  const onlineLicensesCount = licenses.filter(l => isLicenseOnline(l)).length;
  const idleLicensesCount = licenses.filter(l => !isLicenseOnline(l) && !l.is_revoked).length;
  const revokedLicensesCount = licenses.filter(l => Boolean(l.is_revoked)).length;
  const expiringSoonLicensesCount = licenses.filter(l => {
    if (!l.expires_at || l.is_revoked) return false;
    const diffDays = Math.ceil((new Date(l.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }).length;

  // Filtered Lists
  const filteredLicenses = licenses.filter(lic => {
    if (licenseFilter === 'online' && !isLicenseOnline(lic)) return false;
    if (licenseFilter === 'idle' && (isLicenseOnline(lic) || lic.is_revoked)) return false;
    if (licenseFilter === 'revoked' && !lic.is_revoked) return false;
    if (licenseFilter === 'expiring') {
      if (!lic.expires_at || lic.is_revoked) return false;
      const diffDays = Math.ceil((new Date(lic.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 || diffDays > 30) return false;
    }

    if (licenseSearch.trim()) {
      const q = licenseSearch.toLowerCase();
      const matchId = lic.license_id?.toLowerCase().includes(q);
      const matchCust = lic.customer?.toLowerCase().includes(q);
      const matchEmail = lic.email?.toLowerCase().includes(q);
      const matchProd = lic.product?.toLowerCase().includes(q);
      if (!matchId && !matchCust && !matchEmail && !matchProd) return false;
    }
    return true;
  });

  const filteredActivations = activations.filter(node => {
    if (nodeFilter === 'online' && !isNodeOnline(node)) return false;
    if (nodeFilter === 'idle' && (isNodeOnline(node) || node.status === 'REVOKED')) return false;
    if (nodeFilter === 'revoked' && node.status !== 'REVOKED') return false;

    if (nodeSearch.trim()) {
      const q = nodeSearch.toLowerCase();
      const matchId = node.license_id?.toLowerCase().includes(q);
      const matchCust = (node.customer || node.client_name)?.toLowerCase().includes(q);
      const matchMach = node.machine_id?.toLowerCase().includes(q);
      const matchHost = node.hostname?.toLowerCase().includes(q);
      const matchIp = node.ip_address?.toLowerCase().includes(q);
      const matchApp = node.app_name?.toLowerCase().includes(q);
      if (!matchId && !matchCust && !matchMach && !matchHost && !matchIp && !matchApp) return false;
    }
    return true;
  });

  // Action Handlers
  const handleQuickLicenseAlert = async (alt: any) => {
    const alertKey = alt.id || alt.machine_id;
    const mid = alt.machine_id || 'Node';
    const confirmMsg = `⚡ License & Activate Node\n\nMachine ID: ${mid}\nOrigin: ${alt.hostname || 'N/A'}\nViolation: ${alt.reason || 'Unlicensed'}\n\nGenerate an authentic Ed25519-signed Enterprise Master License and activate this node now?`;
    if (!window.confirm(confirmMsg)) return;

    setActivatingAlertId(alertKey);
    try {
      const res = await api.licenseAndActivateAlert(alertKey, {});
      if (res.success) {
        setGeneratedCert(res.certificate);
        setGeneratedLicId(res.license_id);
        setGenCustomer(res.customer);
        setGenProduct(res.product);
        setGenModalOpen(true);
        loadData(true);
      }
    } catch (err: any) {
      alert('Error activating node: ' + (err.message || 'Server error'));
    } finally {
      setActivatingAlertId(null);
    }
  };

  const handleCustomizeAlert = (alt: any) => {
    const alertKey = alt.id || alt.machine_id;
    setTargetAlertId(alertKey);
    const mid = alt.machine_id || '';
    const suggested = (alt.hostname && alt.hostname !== 'N/A') ? `${alt.hostname} (${mid.slice(0, 8)})` : `Node-${mid.slice(0, 8)}`;
    setGenCustomer(suggested);
    setGenProduct(alt.app_name || 'Smart Campus GatePass & Access Suite');
    setGenEmail('mettoalex@gmail.com');
    setGenLimit(5);
    setGenDays(365);
    setGeneratedCert(null);
    setGeneratedLicId(null);
    setGenModalOpen(true);
  };

  const handleGenerateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      let res;
      if (targetAlertId) {
        res = await api.licenseAndActivateAlert(targetAlertId, {
          customer: genCustomer,
          email: genEmail,
          product: genProduct,
          license_type: genTier,
          installation_limit: Number(genLimit),
          expires_in_days: Number(genDays),
        });
        setTargetAlertId(null);
      } else {
        res = await api.generateLicenseCertificate({
          customer: genCustomer,
          email: genEmail,
          product: genProduct,
          type: genTier,
          installation_limit: Number(genLimit),
          expires_in_days: Number(genDays),
        });
      }

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
    if (reason === null) return;

    try {
      await api.toggleLicenseRevoke(lic.license_id, action, reason);
      loadData(true);
    } catch (err: any) {
      alert('Failed to update license status: ' + (err.message || 'Server error'));
    }
  };

  // Delete Handlers
  const handleDeleteLicenseClick = (lic: any) => {
    setLicenseToDelete(lic);
    setDeleteLicModalOpen(true);
  };

  const handleConfirmDeleteLicense = async () => {
    if (!licenseToDelete) return;
    setDeletingLic(true);
    try {
      await api.deleteLicense(licenseToDelete.license_id);
      setDeleteLicModalOpen(false);
      setLicenseToDelete(null);
      await loadData(true);
    } catch (err: any) {
      alert('Failed to delete license: ' + (err.message || 'Server error'));
    } finally {
      setDeletingLic(false);
    }
  };

  const handleDeleteNodeClick = (node: any) => {
    setNodeToDelete(node);
    setDeleteNodeModalOpen(true);
  };

  const handleConfirmDeleteNode = async () => {
    if (!nodeToDelete) return;
    setDeletingNode(true);
    try {
      const id = nodeToDelete.id || nodeToDelete.machine_id;
      await api.deleteActivation(id);
      setDeleteNodeModalOpen(false);
      setNodeToDelete(null);
      await loadData(true);
    } catch (err: any) {
      alert('Failed to remove node: ' + (err.message || 'Server error'));
    } finally {
      setDeletingNode(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full max-w-full overflow-x-hidden">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              📡 KKDES Central Software Command Center
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60 whitespace-nowrap shrink-0">
              ● LIVE AUTHORITY
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
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

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setGenModalOpen(true);
              setGeneratedCert(null);
              setGeneratedLicId(null);
            }}
            leftIcon={<Plus size={14} />}
          >
            Generate New License
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadData()}
            disabled={refreshing}
            leftIcon={<RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>

          <a
            href="/licensing-hub"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            title="Open Standalone Command Center Hub"
          >
            <ExternalLink size={13} />
            <span>Standalone Hub</span>
          </a>
        </div>
      </div>

      {/* Top 4 Stat Cards (Interactive with 1-click Filter Jump) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Licenses */}
        <div
          onClick={() => {
            setLicenseFilter('all');
            document.getElementById('licenses-directory-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800/80 hover:border-slate-700 rounded-xl p-5 shadow-sm cursor-pointer transition-all hover:shadow-md group"
          title="Click to view all licenses"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-300">
              Total Issued Licenses
            </span>
            <Key size={16} className="text-slate-500 group-hover:text-slate-400" />
          </div>
          <div className="text-3xl font-extrabold text-white mt-2 flex items-baseline gap-2">
            <span>{loading ? '-' : totalLicenses}</span>
            <span className="text-xs font-semibold text-emerald-400">
              ({onlineLicensesCount} Online)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Click to view Directory</span>
          </div>
        </div>

        {/* Card 2: Connected Nodes (Online Highlight) */}
        <div
          onClick={() => {
            setNodeFilter('online');
            document.getElementById('deployed-nodes-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-slate-900/90 hover:bg-slate-850 border border-emerald-900/50 hover:border-emerald-700/80 rounded-xl p-5 shadow-sm cursor-pointer transition-all hover:shadow-md group"
          title="Click to view active online nodes"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Connected Telemetry Nodes
            </span>
            <Activity size={16} className="text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 mt-2 flex items-baseline gap-2">
            <span>{loading ? '-' : totalNodes}</span>
            <span className="text-xs font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {onlineNodesCount} Online Now
            </span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-300/80 flex items-center gap-1.5">
            <span>Click to view {onlineNodesCount} online instances</span>
          </div>
        </div>

        {/* Card 3: Security Alerts */}
        <div
          onClick={() => {
            document.getElementById('security-alerts-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-slate-900/90 hover:bg-slate-850 border border-slate-800/80 hover:border-slate-700 rounded-xl p-5 shadow-sm cursor-pointer transition-all hover:shadow-md group"
          title="Click to view security alerts"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-300">
              Security Alerts Detected
            </span>
            <ShieldAlert size={16} className={totalAlerts > 0 ? 'text-red-400' : 'text-slate-500'} />
          </div>
          <div
            className={`text-3xl font-extrabold mt-2 ${
              totalAlerts > 0 ? 'text-red-400' : 'text-slate-400'
            }`}
          >
            {loading ? '-' : totalAlerts}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {totalAlerts > 0 ? '⚠️ Unlicensed attempts recorded' : '✔ All instances authorized'}
          </div>
        </div>

        {/* Card 4: Verification Key */}
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
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedKey ? <Check size={12} /> : <Copy size={12} />}
            <span>{copiedKey ? 'Key Copied!' : 'Copy Verification Key'}</span>
          </button>
        </div>
      </div>

      {/* Section 1: 🚨 Security Telemetry & Unauthorized Alerts */}
      <div id="security-alerts-section" className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
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
                  <th className="py-2.5 px-4 whitespace-nowrap">Alert Event</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Machine ID</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Origin Host / IP</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Violation Reason</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Detected At</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {alerts.map((alt, idx) => (
                  <tr key={idx} className="bg-red-950/10 hover:bg-red-950/20 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950/80 text-red-400 border border-red-800/50">
                        <AlertTriangle size={11} />
                        <span>{alt.alert_type}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-white whitespace-nowrap">
                      {alt.machine_id || 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <div className="font-medium">{alt.hostname || 'N/A'}</div>
                      <div className="font-mono text-[11px] text-slate-400">{alt.ip_address}</div>
                    </td>
                    <td className="py-3 px-4 text-red-200 font-medium">{alt.reason}</td>
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      {String(alt.detected_at || alt.created_at).replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                        <button
                          onClick={() => handleQuickLicenseAlert(alt)}
                          disabled={activatingAlertId === (alt.id || alt.machine_id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap shrink-0"
                          title="Instantly issue signed license & activate node"
                        >
                          <Zap size={12} className={activatingAlertId === (alt.id || alt.machine_id) ? "animate-spin" : ""} />
                          <span>{activatingAlertId === (alt.id || alt.machine_id) ? "Activating..." : "License & Activate"}</span>
                        </button>
                        <button
                          onClick={() => handleCustomizeAlert(alt)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] transition-colors whitespace-nowrap shrink-0"
                          title="Customize license parameters"
                        >
                          <Settings size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Section 2: 💻 Active Deployed Nodes & Connect-Back Telemetry */}
      <div id="deployed-nodes-section" className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              💻 Active Deployed Nodes & Connect-Back Telemetry ({filteredActivations.length} of {activations.length})
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Live heartbeat telemetry from authorized instances • Auto-refreshed via WebSocket
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search node, IP, license..."
              value={nodeSearch}
              onChange={(e) => setNodeSearch(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        {/* Filter Tabs for Nodes */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setNodeFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              nodeFilter === 'all'
                ? 'bg-slate-200 text-slate-900 font-bold'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All Nodes ({activations.length})
          </button>

          <button
            onClick={() => setNodeFilter('online')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              nodeFilter === 'online'
                ? 'bg-emerald-600 text-white font-bold shadow-sm shadow-emerald-950/60'
                : 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Online Now ({onlineNodesCount})</span>
          </button>

          <button
            onClick={() => setNodeFilter('idle')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              nodeFilter === 'idle'
                ? 'bg-slate-700 text-white font-bold'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            ⚪ Offline / Idle ({idleNodesCount})
          </button>

          <button
            onClick={() => setNodeFilter('revoked')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              nodeFilter === 'revoked'
                ? 'bg-red-700 text-white font-bold'
                : 'bg-red-950/40 hover:bg-red-900/50 text-red-400 border border-red-800/60'
            }`}
          >
            🔴 Revoked ({revokedNodesCount})
          </button>
        </div>

        <div className="overflow-x-auto">
          {filteredActivations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No deployed nodes match the selected filter or search query.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                <tr>
                  <th className="py-2.5 px-4 whitespace-nowrap">License ID</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Client / Customer</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Hardware ID</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Host / IP</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Application Suite</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Last Heartbeat</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Live Status</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredActivations.map((node, idx) => {
                  const online = isNodeOnline(node);
                  const hbAgo = getHeartbeatAgo(node);
                  const isRevoked = node.status === 'REVOKED';

                  return (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                        {node.license_id}
                      </td>
                      <td className="py-3 px-4 font-medium text-white whitespace-nowrap">
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
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        <div>{String(node.last_heartbeat).replace('T', ' ').slice(0, 19)}</div>
                        <div className="text-[10px] text-slate-500 font-sans">{hbAgo}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isRevoked ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-950 text-rose-400 border border-rose-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            <span>REVOKED</span>
                          </span>
                        ) : online ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/80 shadow-sm shadow-emerald-950/40">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>ONLINE NOW</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-900 text-slate-400 border border-slate-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                            <span>OFFLINE / IDLE</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleDeleteNodeClick(node)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-950/40 hover:bg-red-800 text-red-400 hover:text-white border border-red-800/60 rounded text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0"
                          title="Remove node from telemetry registry"
                        >
                          <Trash2 size={12} />
                          <span>Remove</span>
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

      {/* Section 3: 📜 Master Licenses Directory & Kill-Switch */}
      <div id="licenses-directory-section" className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              📜 Master Licenses Directory & Kill-Switch ({filteredLicenses.length} of {licenses.length})
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Cryptographically signed Ed25519 licenses • Instant kill-switch & safe permanent deletion
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search licenses..."
                value={licenseSearch}
                onChange={(e) => setLicenseSearch(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setGenModalOpen(true);
                setGeneratedCert(null);
                setGeneratedLicId(null);
              }}
              leftIcon={<Plus size={12} />}
            >
              Issue License
            </Button>
          </div>
        </div>

        {/* Filter Tabs for Licenses */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setLicenseFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              licenseFilter === 'all'
                ? 'bg-slate-200 text-slate-900 font-bold'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All Licenses ({licenses.length})
          </button>

          <button
            onClick={() => setLicenseFilter('online')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              licenseFilter === 'online'
                ? 'bg-emerald-600 text-white font-bold shadow-sm shadow-emerald-950/60'
                : 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/60'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>🟢 Online & Active ({onlineLicensesCount})</span>
          </button>

          <button
            onClick={() => setLicenseFilter('idle')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              licenseFilter === 'idle'
                ? 'bg-slate-700 text-white font-bold'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            ⚪ Active (Idle) ({idleLicensesCount})
          </button>

          <button
            onClick={() => setLicenseFilter('revoked')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              licenseFilter === 'revoked'
                ? 'bg-red-700 text-white font-bold'
                : 'bg-red-950/40 hover:bg-red-900/50 text-red-400 border border-red-800/60'
            }`}
          >
            ⚡ Revoked ({revokedLicensesCount})
          </button>

          <button
            onClick={() => setLicenseFilter('expiring')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              licenseFilter === 'expiring'
                ? 'bg-amber-600 text-white font-bold'
                : 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-400 border border-amber-800/60'
            }`}
          >
            ⚠️ Expiring Soon ({expiringSoonLicensesCount})
          </button>
        </div>

        <div className="overflow-x-auto">
          {filteredLicenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No licenses match the selected filter. Click "Issue License" or clear search.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                <tr>
                  <th className="py-2.5 px-4 whitespace-nowrap">License ID</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Customer & Email</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Product / Tier</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Node Quota</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Live Status</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Expires</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLicenses.map((lic, idx) => {
                  const used = lic.active_nodes ?? 0;
                  const limit = lic.installation_limit ?? 1;
                  const isRevoked = Boolean(lic.is_revoked);
                  const isOnline = isLicenseOnline(lic);
                  const liveNodes = getLicenseOnlineNodesCount(lic);

                  return (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isOnline && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Connected & actively transmitting"></span>
                          )}
                          <span>{lic.license_id}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-200">
                        <div className="font-semibold whitespace-nowrap">{lic.customer}</div>
                        <div className="text-[11px] text-slate-400 whitespace-nowrap">{lic.email || 'N/A'}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        <div className="whitespace-nowrap">{lic.product}</div>
                        <div className="text-[11px] text-slate-400 whitespace-nowrap">{lic.type || 'Enterprise'}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            used >= limit ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {used}
                        </span>{' '}
                        <span className="text-slate-400">/ {limit} Nodes</span>
                        {liveNodes > 0 && (
                          <span className="ml-2 text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/50">
                            {liveNodes} online
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isRevoked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950 text-red-400 border border-red-800/60">
                            ⚡ REVOKED
                          </span>
                        ) : isOnline ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/80 shadow-sm shadow-emerald-950/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>ONLINE & ACTIVE</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-900 text-slate-300 border border-slate-700/60">
                            ● ACTIVE (IDLE)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {String(lic.expires_at || '').slice(0, 10)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handleToggleKillSwitch(lic)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                              isRevoked
                                ? 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-sm'
                                : 'bg-red-900/60 hover:bg-red-700 text-red-200 hover:text-white border border-red-800/60 shadow-sm'
                            }`}
                            title={isRevoked ? 'Restore access to client apps' : 'Instantly trigger emergency kill-switch'}
                          >
                            {isRevoked ? '✓ Restore' : '⚡ Kill-Switch'}
                          </button>

                          <button
                            onClick={() => handleDeleteLicenseClick(lic)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-950/40 hover:bg-red-800 text-red-400 hover:text-white border border-red-800/60 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                            title="Permanently delete license and connected nodes"
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        </div>
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
      <ModalShell
        isOpen={genModalOpen}
        onClose={() => {
          setGenModalOpen(false);
          setTargetAlertId(null);
        }}
        title={targetAlertId ? 'License & Activate Alert Node' : 'Generate Asymmetric Signed License'}
        icon={Key}
        iconClassName="text-emerald-400 bg-emerald-950/80 border-emerald-800/80"
        size="md"
        footer={
          !generatedCert ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setGenModalOpen(false);
                  setTargetAlertId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleGenerateLicense}
                isLoading={generating}
                leftIcon={<Key size={13} />}
              >
                {targetAlertId ? 'Sign & Activate Node' : 'Sign & Issue Certificate'}
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setGenModalOpen(false);
                setGeneratedCert(null);
                setGeneratedLicId(null);
              }}
            >
              Done
            </Button>
          )
        }
      >
        {!generatedCert ? (
          <form onSubmit={handleGenerateLicense} className="space-y-4">
            <InputField
              label="Customer / Institution Name"
              required
              value={genCustomer}
              onChange={(e) => setGenCustomer(e.target.value)}
              placeholder="e.g. RU Smart Campus"
            />
            <InputField
              label="Administrator Email"
              type="email"
              required
              value={genEmail}
              onChange={(e) => setGenEmail(e.target.value)}
              placeholder="e.g. admin@campus.edu"
            />
            <InputField
              label="Software Product Name"
              required
              value={genProduct}
              onChange={(e) => setGenProduct(e.target.value)}
              placeholder="e.g. Smart Campus GatePass & Access Suite"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SelectField
                label="License Tier"
                value={genTier}
                onChange={(e) => setGenTier(e.target.value)}
                options={[
                  { value: 'Enterprise', label: 'Enterprise' },
                  { value: 'Standard', label: 'Standard' },
                  { value: 'Trial', label: 'Trial' },
                  { value: 'Perpetual', label: 'Perpetual' },
                ]}
              />

              <InputField
                label="Node Quota (Nodes)"
                type="number"
                min={1}
                required
                value={genLimit}
                onChange={(e) => setGenLimit(Number(e.target.value))}
              />

              <InputField
                label="Validity (Days)"
                type="number"
                min={1}
                required
                value={genDays}
                onChange={(e) => setGenDays(Number(e.target.value))}
              />
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>
                License <strong>{generatedLicId}</strong> cryptographically generated and signed with Ed25519 vendor key.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Signed Certificate Payload (.lic format)
              </label>
              <textarea
                readOnly
                value={generatedCert}
                className="w-full h-44 bg-black font-mono text-[11px] text-emerald-400 p-3 rounded-lg border border-slate-800 focus:outline-none select-all"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                onClick={handleDownloadCert}
                leftIcon={<Download size={13} />}
              >
                Download .lic File
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyCert}
                leftIcon={copiedCert ? <Check size={13} /> : <Copy size={13} />}
              >
                {copiedCert ? 'Copied!' : 'Copy Certificate Text'}
              </Button>
            </div>
          </div>
        )}
      </ModalShell>

      {/* Delete License Confirmation Modal */}
      <ModalShell
        isOpen={deleteLicModalOpen}
        onClose={() => {
          if (!deletingLic) {
            setDeleteLicModalOpen(false);
            setLicenseToDelete(null);
          }
        }}
        title="Permanently Delete Master License"
        icon={AlertTriangle}
        iconClassName="text-rose-400 bg-rose-950/80 border-rose-800/80"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDeleteLicModalOpen(false);
                setLicenseToDelete(null);
              }}
              disabled={deletingLic}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmDeleteLicense}
              isLoading={deletingLic}
              leftIcon={<Trash2 size={13} />}
            >
              Delete Permanently
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-rose-200 mb-0.5">⚠️ IRREVERSIBLE DELETION ACTION</strong>
              Are you sure you want to permanently delete this master license? All client node activations and telemetry tracking records tied to this license will be permanently wiped.
            </div>
          </div>

          {licenseToDelete && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">License ID:</span>
                <span className="font-mono font-bold text-white">{licenseToDelete.license_id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Customer:</span>
                <span className="font-semibold text-slate-200">{licenseToDelete.customer}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Product:</span>
                <span className="text-slate-300">{licenseToDelete.product}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Active Node Activations:</span>
                <span className="font-mono text-amber-400 font-bold">{licenseToDelete.active_nodes ?? 0}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Expires:</span>
                <span className="font-mono text-slate-300">{String(licenseToDelete.expires_at || 'Never').slice(0, 10)}</span>
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      {/* Delete Connected Node Confirmation Modal */}
      <ModalShell
        isOpen={deleteNodeModalOpen}
        onClose={() => {
          if (!deletingNode) {
            setDeleteNodeModalOpen(false);
            setNodeToDelete(null);
          }
        }}
        title="Remove Connected Node"
        icon={AlertTriangle}
        iconClassName="text-rose-400 bg-rose-950/80 border-rose-800/80"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDeleteNodeModalOpen(false);
                setNodeToDelete(null);
              }}
              disabled={deletingNode}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmDeleteNode}
              isLoading={deletingNode}
              leftIcon={<Trash2 size={13} />}
            >
              Remove Node
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-rose-200 mb-0.5">Disconnect & Remove Node</strong>
              Are you sure you want to remove this client instance from the active telemetry registry? Its connected node slot will be freed immediately.
            </div>
          </div>

          {nodeToDelete && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Machine Hardware ID:</span>
                <span className="font-mono text-white text-[11px] truncate max-w-[240px]" title={nodeToDelete.machine_id}>
                  {nodeToDelete.machine_id}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Host / IP:</span>
                <span className="font-mono text-slate-200">{nodeToDelete.hostname} ({nodeToDelete.ip_address})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Associated License:</span>
                <span className="font-mono text-emerald-400 font-bold">{nodeToDelete.license_id}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Last Transmitted Heartbeat:</span>
                <span className="font-mono text-slate-300">{String(nodeToDelete.last_heartbeat).slice(0, 19)}</span>
              </div>
            </div>
          )}
        </div>
      </ModalShell>
    </div>
  );
};
