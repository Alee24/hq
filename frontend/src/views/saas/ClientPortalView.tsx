import React, { useState, useEffect } from 'react';
import {
  Server,
  Globe,
  Rocket,
  ShieldCheck,
  CreditCard,
  Plus,
  RefreshCw,
  Terminal,
  Activity,
  Layers,
  Cpu,
  HardDrive,
  Copy,
  Check,
  ExternalLink,
  RotateCw,
  Sliders,
  Box,
  Search,
  CheckCircle2,
  AlertTriangle,
  Download,
  ArrowRight,
  LogOut,
  Zap,
  Lock,
  ChevronRight
} from 'lucide-react';
import { api } from '../../api/client';

interface ClientPortalViewProps {
  onGoToLanding: () => void;
  onGoToAdmin: () => void;
  onLogout: () => void;
  isAdmin: boolean;
  currentUser?: any;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({
  onGoToLanding,
  onGoToAdmin,
  onLogout,
  isAdmin,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'servers' | 'domains' | 'marketplace' | 'billing'>('overview');
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals & Action States
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [domainModalOpen, setDomainModalOpen] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [terminalModalOpen, setTerminalModalOpen] = useState(false);
  const [terminalServer, setTerminalServer] = useState<any | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [terminalCommand, setTerminalCommand] = useState<string>('uptime && docker ps');
  const [terminalRunning, setTerminalRunning] = useState<boolean>(false);

  // Forms
  const [targetServerName, setTargetServerName] = useState('Production-Node-01');
  const [selectedPlanIdx, setSelectedPlanIdx] = useState(1);
  const [selectedRegion, setSelectedRegion] = useState('Frankfurt (eu-central-1)');

  const [domainSearchQuery, setDomainSearchQuery] = useState('');
  const [domainSearchResults, setDomainSearchResults] = useState<any | null>(null);
  const [domainSearching, setDomainSearching] = useState(false);

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [appName, setAppName] = useState('');
  const [appDomain, setAppDomain] = useState('');

  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const serverTiers = [
    { name: 'Cloud Micro', cpu: 1, ram: 2, disk: 40, price: 5 },
    { name: 'Cloud Standard', cpu: 2, ram: 4, disk: 80, price: 10, popular: true },
    { name: 'Cloud Performance', cpu: 4, ram: 8, disk: 160, price: 20 },
    { name: 'Cloud Dedicated', cpu: 8, ram: 16, disk: 320, price: 40 },
  ];

  useEffect(() => {
    loadDashboard();
    loadMarketplace();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomerDashboard();
      setDashboardData(data);
    } catch (e) {
      console.error('Failed to load customer dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadMarketplace = async () => {
    try {
      const tpls = await api.getMarketplaceTemplates();
      setTemplates(tpls);
    } catch (e) {
      console.error('Failed to load templates:', e);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const handleSearchDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainSearchQuery.trim()) return;
    setDomainSearching(true);
    try {
      const res = await api.searchDomains(domainSearchQuery.trim());
      setDomainSearchResults(res);
    } catch (e: any) {
      alert(`Search error: ${e.message}`);
    } finally {
      setDomainSearching(false);
    }
  };

  const handleOrderDomain = async (domainName: string) => {
    setActionLoading(true);
    try {
      const res = await api.orderDomain({
        domain_name: domainName,
        registration_years: 1,
        privacy_protection: true,
        auto_renew: true
      });
      setActionSuccess(res.message);
      setTimeout(() => setActionSuccess(null), 4000);
      setDomainModalOpen(false);
      setDomainSearchResults(null);
      await loadDashboard();
    } catch (e: any) {
      alert(`Domain registration failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleProvisionServer = async () => {
    setActionLoading(true);
    const tier = serverTiers[selectedPlanIdx];
    try {
      const res = await api.provisionCloudServer({
        instance_name: targetServerName || `Node-${tier.name.replace(' ', '-')}`,
        plan_name: tier.name,
        region: selectedRegion,
        cpu_cores: tier.cpu,
        ram_gb: tier.ram,
        disk_gb: tier.disk,
        monthly_price_usd: tier.price
      });
      setActionSuccess(`Cloud VPS ${res.instance_name} provisioned at ${res.ip_address}!`);
      setTimeout(() => setActionSuccess(null), 4000);
      setServerModalOpen(false);
      await loadDashboard();
    } catch (e: any) {
      alert(`Provision failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeployApp = async () => {
    if (!selectedTemplate) return;
    setActionLoading(true);
    try {
      const res = await api.deployMarketplaceTemplate({
        template_slug: selectedTemplate.slug,
        app_name: appName || selectedTemplate.title.split(' ')[0],
        domain: appDomain || `${(appName || selectedTemplate.slug).toLowerCase()}.cloudnode.io`
      });
      setActionSuccess(res.message);
      setTimeout(() => setActionSuccess(null), 4000);
      setDeployModalOpen(false);
      await loadDashboard();
    } catch (e: any) {
      alert(`Deployment failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunTerminalCommand = async () => {
    if (!terminalServer) return;
    setTerminalRunning(true);
    try {
      const res = await api.executeServerCommand(terminalServer.id, terminalCommand);
      setTerminalOutput(res.output || res.message || 'Execution completed with 0 errors.');
    } catch (e: any) {
      setTerminalOutput(`Execution error: ${e.message}`);
    } finally {
      setTerminalRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={onGoToLanding}
            title="Return to Public Website"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white font-bold">
              <Server size={16} />
            </div>
            <div>
              <span className="font-extrabold text-sm text-white">CloudNode Client Portal</span>
              <p className="text-[10px] font-mono text-slate-400 leading-none">Self-Service DevOps Console</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-950 text-brand-300 border border-brand-800">
            <Zap size={11} className="text-amber-400" />
            <span>{dashboardData?.current_plan?.name || 'Cloud Starter Plan'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isAdmin && (
            <button
              onClick={onGoToAdmin}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              title="Open Global Multi-Server Infrastructure Command Center"
            >
              <Sliders size={13} />
              <span className="hidden sm:inline">Admin Command Center</span>
            </button>
          )}

          <button
            onClick={onGoToLanding}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Globe size={13} className="text-slate-400" />
            <span className="hidden sm:inline">Public Website</span>
          </button>

          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/70 hover:border-rose-800 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors"
            title="Sign Out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Action Toast Feedback */}
      {actionSuccess && (
        <div className="bg-emerald-950/90 border-b border-emerald-800 py-2.5 px-4 text-center text-xs font-bold text-emerald-300 flex items-center justify-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* 2. Navigation Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/40 px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'servers', label: 'Cloud Servers', icon: Server, count: dashboardData?.total_servers || 1 },
            { id: 'domains', label: 'Domains & DNS', icon: Globe, count: dashboardData?.total_domains || 0 },
            { id: 'marketplace', label: '1-Click Apps', icon: Box, count: dashboardData?.total_applications || 0 },
            { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-3 sm:px-4 border-b-2 text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-brand-500 text-brand-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive ? 'bg-brand-500/20 text-brand-300' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Action Button */}
        <div className="hidden md:flex items-center gap-2 py-2">
          <button
            onClick={() => setServerModalOpen(true)}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            <Plus size={13} />
            <span>Provision VPS</span>
          </button>
          <button
            onClick={() => setDomainModalOpen(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            <Plus size={13} />
            <span>Register Domain</span>
          </button>
        </div>
      </div>

      {/* 3. Main Tab Contents */}
      <main className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 flex-1">
        {/* ==================================================== */}
        {/* TAB 1: CLIENT OVERVIEW */}
        {/* ==================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Top Stat Vitals Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Cloud Servers</span>
                  <div className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400">
                    <Server size={14} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-white">{dashboardData?.total_servers || 1}</span>
                  <span className="text-[11px] font-mono text-emerald-400 font-semibold">All Online</span>
                </div>
                <p className="text-[10px] text-slate-500">Frankfurt & Nairobi High-Speed Edge</p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Registered Domains</span>
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Globe size={14} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-white">{dashboardData?.total_domains || 0}</span>
                  <span className="text-[11px] font-mono text-emerald-400 font-semibold">DNS Active</span>
                </div>
                <p className="text-[10px] text-slate-500">Automated SSL certificates enabled</p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Deployed Apps</span>
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <Box size={14} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-white">{dashboardData?.total_applications || 0}</span>
                  <span className="text-[11px] font-mono text-emerald-400 font-semibold">Containers</span>
                </div>
                <p className="text-[10px] text-slate-500">Push-to-Deploy Webhooks Active</p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                  <span>Monthly Spend</span>
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <CreditCard size={14} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-white">${dashboardData?.monthly_spend || 10.0}</span>
                  <span className="text-[11px] font-mono text-slate-400">USD / mo</span>
                </div>
                <p className="text-[10px] text-slate-500">Next renewal: Nov 01, 2026</p>
              </div>
            </div>

            {/* Quick Server & App Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cloud Servers Summary Card */}
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-brand-400" />
                    <h3 className="font-bold text-white text-sm">Active Cloud Nodes</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('servers')}
                    className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1"
                  >
                    <span>Manage</span>
                    <ChevronRight size={12} />
                  </button>
                </div>

                <div className="space-y-2">
                  {(dashboardData?.recent_servers?.length ? dashboardData.recent_servers : [
                    { id: 'srv-1', name: 'Primary-Cloud-Node', ip: '185.192.97.84', region: 'Frankfurt (eu-central-1)', status: 'ACTIVE', specs: '4 vCPU, 8GB RAM, 160GB SSD' }
                  ]).map((srv: any) => (
                    <div
                      key={srv.id}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{srv.name}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            ONLINE
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 flex items-center gap-2">
                          <span>{srv.ip}</span>
                          <span>•</span>
                          <span>{srv.region}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setTerminalServer(srv);
                          setTerminalModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium flex items-center gap-1 transition-colors"
                      >
                        <Terminal size={11} className="text-emerald-400" />
                        <span>Terminal</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Applications Summary Card */}
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Box size={16} className="text-indigo-400" />
                    <h3 className="font-bold text-white text-sm">Running Applications</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('marketplace')}
                    className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1"
                  >
                    <span>Deploy New</span>
                    <ChevronRight size={12} />
                  </button>
                </div>

                <div className="space-y-2">
                  {(dashboardData?.recent_apps?.length ? dashboardData.recent_apps : [
                    { id: 'app-1', name: 'Command Center Portal', domain: 'hq.kkdes.co.ke', framework: 'FastAPI / React', status: 'RUNNING', port: 80 }
                  ]).map((a: any) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{a.name}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {a.status}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-brand-300 flex items-center gap-1">
                          <Globe size={10} className="text-slate-500" />
                          <span>{a.domain}</span>
                        </div>
                      </div>

                      <a
                        href={`https://${a.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium flex items-center gap-1 transition-colors"
                      >
                        <span>Open</span>
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: CLOUD SERVERS */}
        {/* ==================================================== */}
        {activeTab === 'servers' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Your Cloud VPS Instances</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Direct root SSH access, automated Ed25519 deploy keys, and Docker container engine pre-installed.
                </p>
              </div>

              <button
                onClick={() => setServerModalOpen(true)}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
              >
                <Plus size={13} />
                <span>Provision New Server</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(dashboardData?.recent_servers?.length ? dashboardData.recent_servers : [
                { id: 'srv-1', name: 'Primary-Cloud-Node', ip: '185.192.97.84', region: 'Frankfurt (eu-central-1)', status: 'ACTIVE', specs: '4 vCPU, 8GB RAM, 160GB SSD' }
              ]).map((srv: any) => (
                <div
                  key={srv.id}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
                          <Server size={18} />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm">{srv.name}</h3>
                          <p className="text-[10px] text-slate-400 font-mono">{srv.region}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {srv.status}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 space-y-1 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Dedicated IP:</span>
                        <div className="flex items-center gap-1 text-white font-bold">
                          <span>{srv.ip}</span>
                          <button
                            onClick={() => copyToClipboard(srv.ip, srv.ip)}
                            className="text-slate-400 hover:text-white"
                            title="Copy IP"
                          >
                            {copiedText === srv.ip ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Resources:</span>
                        <span className="text-brand-300 font-semibold">{srv.specs}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">SSH Deploy Key:</span>
                        <span className="text-emerald-400 font-semibold">Configured</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => {
                        setTerminalServer(srv);
                        setTerminalModalOpen(true);
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Terminal size={12} className="text-emerald-400" />
                      <span>Root Terminal</span>
                    </button>

                    <button
                      onClick={async () => {
                        if (confirm(`Reboot server ${srv.name}?`)) {
                          try {
                            await api.executeServerCommand(srv.id, 'reboot');
                            alert(`Reboot command sent to ${srv.name}`);
                          } catch (e: any) {
                            alert(`Failed: ${e.message}`);
                          }
                        }
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                      title="Reboot Server"
                    >
                      <RotateCw size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: DOMAINS & DNS */}
        {/* ==================================================== */}
        {activeTab === 'domains' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Managed Domains & Instant DNS</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sub-millisecond global DNS resolution with automated Let's Encrypt SSL certificates.
                </p>
              </div>

              <button
                onClick={() => setDomainModalOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
              >
                <Plus size={13} />
                <span>Register New Domain</span>
              </button>
            </div>

            {/* Domains Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Domain Name</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">SSL Security</th>
                      <th className="py-3 px-4">Nameservers</th>
                      <th className="py-3 px-4">Expires</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {(dashboardData?.recent_domains?.length ? dashboardData.recent_domains : [
                      { id: 'dom-1', domain_name: 'hq.kkdes.co.ke', tld: '.co.ke', status: 'ACTIVE', ssl: 'ACTIVE', expires: 'Oct 17, 2027' },
                      { id: 'dom-2', domain_name: 'cloudnode.io', tld: '.io', status: 'ACTIVE', ssl: 'ACTIVE', expires: 'Nov 12, 2027' }
                    ]).map((dom: any) => (
                      <tr key={dom.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                          <Globe size={14} className="text-emerald-400" />
                          <span>{dom.domain_name}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {dom.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1 w-fit">
                            <ShieldCheck size={10} />
                            <span>Let's Encrypt TLS 1.3</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                          ns1.cloudnode.io, ns2.cloudnode.io
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {dom.expires}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <a
                            href={`https://${dom.domain_name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                          >
                            <span>Visit</span>
                            <ExternalLink size={10} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: 1-CLICK APP MARKETPLACE */}
        {/* ==================================================== */}
        {activeTab === 'marketplace' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Application Marketplace</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Launch fullstack applications, CMS engines, and database clusters with automated Nginx reverse proxy.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(templates.length > 0 ? templates : [
                { slug: 'wordpress', title: 'WordPress & MySQL', category: 'CMS & Publishing', description: 'Production-grade WordPress with PHP 8.3 FPM, MySQL 8.0, and automated SSL caching.', badge: 'Most Popular', install_time_estimate: '45 seconds' },
                { slug: 'nodejs-nextjs', title: 'Next.js & Node.js 20', category: 'Fullstack Framework', description: 'High-performance React / Next.js production SSR application powered by Node.js 20 LTS.', badge: 'DevOps Ready', install_time_estimate: '30 seconds' },
                { slug: 'python-fastapi', title: 'Python FastAPI & PostgreSQL', category: 'Backend API', description: 'Asynchronous Python 3.12 microservice with FastAPI, SQLAlchemy 2.0, and PostgreSQL.', badge: 'High Speed', install_time_estimate: '25 seconds' },
              ]).map((tpl: any) => (
                <div
                  key={tpl.slug}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
                        <Box size={20} />
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-950 text-slate-400 border border-slate-800">
                        {tpl.badge || 'Popular'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono text-brand-400 uppercase tracking-wider font-semibold">
                        {tpl.category}
                      </span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        {tpl.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {tpl.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500">{tpl.install_time_estimate || '45s'}</span>
                    <button
                      onClick={() => {
                        setSelectedTemplate(tpl);
                        setAppName(tpl.title.split(' ')[0]);
                        setDeployModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                    >
                      <Rocket size={12} />
                      <span>Deploy App</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 5: BILLING & INVOICES */}
        {/* ==================================================== */}
        {activeTab === 'billing' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Subscription & Billing Management</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage your cloud subscriptions, view invoices, and upgrade resource quotas.
                </p>
              </div>
            </div>

            {/* Current Plan Overview Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-brand-950/70 via-slate-900 to-indigo-950/40 border border-brand-800/70 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-500/20 text-brand-300 border border-brand-500/40">
                    Active Subscription
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Renews monthly</span>
                </div>
                <h3 className="text-2xl font-extrabold text-white">
                  {dashboardData?.current_plan?.name || 'Cloud Starter Tier ($9/mo)'}
                </h3>
                <p className="text-xs text-slate-300 max-w-xl">
                  Includes 3 high-speed cloud VPS nodes, 10 managed domains with instant DNS, and unlimited container deployments.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onGoToLanding}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
                >
                  View All Plans
                </button>
                <button
                  onClick={() => alert('Plan upgrade simulation: Unlimited Enterprise quotas enabled.')}
                  className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-md shadow-brand-500/20 transition-all active:scale-95"
                >
                  Upgrade Plan
                </button>
              </div>
            </div>

            {/* Invoices History Table */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-white">Billing History & Invoices</h4>
              <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Payment Method</th>
                      <th className="py-3 px-4 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {(dashboardData?.invoices?.length ? dashboardData.invoices : [
                      { id: 'inv-1', invoice_number: 'INV-2026-001', description: 'Cloud Starter Subscription (Monthly)', amount_usd: 9.0, status: 'PAID', payment_method: 'CARD' },
                      { id: 'inv-2', invoice_number: 'INV-2026-002', description: 'Domain Registration: hq.kkdes.co.ke', amount_usd: 9.99, status: 'PAID', payment_method: 'MPESA' }
                    ]).map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white">{inv.invoice_number}</td>
                        <td className="py-3.5 px-4 text-slate-300 font-sans">{inv.description}</td>
                        <td className="py-3.5 px-4 font-bold text-white">${inv.amount_usd}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">{inv.payment_method}</td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => alert(`Downloading official PDF receipt for ${inv.invoice_number}...`)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                          >
                            <Download size={10} />
                            <span>PDF</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ==================================================== */}
      {/* MODAL: ROOT TERMINAL RUNNER */}
      {/* ==================================================== */}
      {terminalModalOpen && terminalServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-emerald-400" />
                <h3 className="font-bold text-white text-base">Root Terminal: {terminalServer.name}</h3>
                <span className="text-xs font-mono text-slate-400">({terminalServer.ip})</span>
              </div>
              <button onClick={() => setTerminalModalOpen(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs">
                  <span className="text-emerald-400 mr-2">root@vps:~#</span>
                  <input
                    type="text"
                    value={terminalCommand}
                    onChange={(e) => setTerminalCommand(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunTerminalCommand()}
                    placeholder="Enter bash command (e.g. docker ps, uptime, git status)..."
                    className="w-full bg-transparent text-white focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleRunTerminalCommand}
                  disabled={terminalRunning}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  {terminalRunning ? 'Running...' : 'Execute'}
                </button>
              </div>

              {/* Output Console */}
              <div className="p-3 bg-black/80 rounded-xl border border-slate-800/80 font-mono text-xs text-slate-300 max-h-64 overflow-y-auto whitespace-pre-wrap select-all">
                {terminalOutput || 'Waiting for command execution...'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: PROVISION NEW SERVER */}
      {/* ==================================================== */}
      {serverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Server size={18} className="text-brand-400" />
                <h3 className="font-bold text-white text-base">Provision New Cloud VPS</h3>
              </div>
              <button onClick={() => setServerModalOpen(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Instance Name:</label>
                <input
                  type="text"
                  value={targetServerName}
                  onChange={(e) => setTargetServerName(e.target.value)}
                  placeholder="e.g. Production-Node-01"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Select Tier:</label>
                <div className="grid grid-cols-2 gap-2">
                  {serverTiers.map((t, idx) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => setSelectedPlanIdx(idx)}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        selectedPlanIdx === idx
                          ? 'bg-brand-950 text-brand-300 border-brand-700'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-white text-xs">{t.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">${t.price}/mo • {t.cpu}vCPU {t.ram}GB</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Target Region:</label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                >
                  <option value="Frankfurt (eu-central-1)">🇩🇪 Frankfurt (eu-central-1)</option>
                  <option value="London (uk-south-1)">🇬🇧 London (uk-south-1)</option>
                  <option value="New York (us-east-1)">🇺🇸 New York (us-east-1)</option>
                  <option value="Singapore (ap-southeast-1)">🇸🇬 Singapore (ap-southeast-1)</option>
                  <option value="Nairobi (af-south-1)">🇰🇪 Nairobi (af-south-1)</option>
                </select>
              </div>

              <button
                onClick={handleProvisionServer}
                disabled={actionLoading}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                {actionLoading ? <RefreshCw size={13} className="animate-spin" /> : <Rocket size={13} />}
                <span>{actionLoading ? 'Provisioning...' : `Deploy Node ($${serverTiers[selectedPlanIdx].price}/mo)`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: REGISTER DOMAIN */}
      {/* ==================================================== */}
      {domainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Globe size={18} className="text-emerald-400" />
                <h3 className="font-bold text-white text-base">Search & Register Domain</h3>
              </div>
              <button onClick={() => setDomainModalOpen(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleSearchDomain} className="flex gap-2">
              <input
                type="text"
                value={domainSearchQuery}
                onChange={(e) => setDomainSearchQuery(e.target.value)}
                placeholder="Search domain (e.g. mycompany.com)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={domainSearching}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors"
              >
                {domainSearching ? '...' : 'Search'}
              </button>
            </form>

            {domainSearchResults?.exact_match && (
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono">
                <div>
                  <div className="text-white font-bold">{domainSearchResults.exact_match.domain_name}</div>
                  <div className="text-slate-500 text-[11px]">${domainSearchResults.exact_match.price_usd}/yr • Free SSL</div>
                </div>
                <button
                  onClick={() => handleOrderDomain(domainSearchResults.exact_match.domain_name)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs"
                >
                  {actionLoading ? 'Ordering...' : 'Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: 1-CLICK DEPLOY */}
      {/* ==================================================== */}
      {deployModalOpen && selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Box size={18} className="text-brand-400" />
                <h3 className="font-bold text-white text-base">Deploy {selectedTemplate.title}</h3>
              </div>
              <button onClick={() => setDeployModalOpen(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Application Service Name:</label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="e.g. MyWordPressSite"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Domain to Bind:</label>
                <input
                  type="text"
                  value={appDomain}
                  onChange={(e) => setAppDomain(e.target.value)}
                  placeholder="e.g. blog.mycompany.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <button
                onClick={handleDeployApp}
                disabled={actionLoading}
                className="w-full py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                {actionLoading ? <RefreshCw size={13} className="animate-spin" /> : <Rocket size={13} />}
                <span>{actionLoading ? 'Deploying...' : 'Deploy Stack'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
