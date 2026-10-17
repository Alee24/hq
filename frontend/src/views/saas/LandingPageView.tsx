import React, { useState, useEffect } from 'react';
import {
  Server,
  Globe,
  ShieldCheck,
  Zap,
  Rocket,
  Search,
  Check,
  CheckCircle2,
  ArrowRight,
  Terminal,
  Layers,
  Lock,
  Cpu,
  HardDrive,
  RefreshCw,
  Sliders,
  HelpCircle,
  Sparkles,
  Star,
  CreditCard,
  ExternalLink,
  Box,
  Layout,
  Activity,
  ChevronDown,
  Copy,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { api } from '../../api/client';

interface LandingPageViewProps {
  onGoToPortal: () => void;
  onGoToAdmin: () => void;
  onLoginClick: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  currentUser?: any;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  onGoToPortal,
  onGoToAdmin,
  onLoginClick,
  isAuthenticated,
  isAdmin,
  currentUser
}) => {
  // Domain Search State
  const [domainQuery, setDomainQuery] = useState('');
  const [searchingDomain, setSearchingDomain] = useState(false);
  const [domainSearchResults, setDomainSearchResults] = useState<any | null>(null);
  const [selectedDomainForOrder, setSelectedDomainForOrder] = useState<any | null>(null);

  // Cloud Configurator State
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(1); // Standard $10/mo default
  const [selectedRegion, setSelectedRegion] = useState('Frankfurt (eu-central-1)');
  const [annualBilling, setAnnualBilling] = useState(false);

  // Marketplace Templates & Plans State
  const [templates, setTemplates] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedTemplateForDeploy, setSelectedTemplateForDeploy] = useState<any | null>(null);

  // Modals & Order States
  const [domainModalOpen, setDomainModalOpen] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  // Form states for modals
  const [targetAppName, setTargetAppName] = useState('');
  const [targetDomainName, setTargetDomainName] = useState('');
  const [targetServerName, setTargetServerName] = useState('Production-Node-01');
  const [paymentMethod, setPaymentMethod] = useState('CARD');

  // FAQ Accordion
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const serverTiers = [
    { name: 'Cloud Micro', cpu: 1, ram: 2, disk: 40, bandwidth: 1, monthly: 5, annual: 50 },
    { name: 'Cloud Standard', cpu: 2, ram: 4, disk: 80, bandwidth: 2, monthly: 10, annual: 100, popular: true },
    { name: 'Cloud Performance', cpu: 4, ram: 8, disk: 160, bandwidth: 4, monthly: 20, annual: 200 },
    { name: 'Cloud Dedicated', cpu: 8, ram: 16, disk: 320, bandwidth: 8, monthly: 40, annual: 400 },
  ];

  const regions = [
    { id: 'fra', name: 'Frankfurt (eu-central-1)', flag: '🇩🇪', ping: '12ms' },
    { id: 'lon', name: 'London (uk-south-1)', flag: '🇬🇧', ping: '18ms' },
    { id: 'nyc', name: 'New York (us-east-1)', flag: '🇺🇸', ping: '72ms' },
    { id: 'sin', name: 'Singapore (ap-southeast-1)', flag: '🇸🇬', ping: '140ms' },
    { id: 'nbo', name: 'Nairobi (af-south-1)', flag: '🇰🇪', ping: '24ms' },
  ];

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const [tplList, planList] = await Promise.all([
        api.getMarketplaceTemplates().catch(() => []),
        api.getSubscriptionPlans().catch(() => [])
      ]);
      setTemplates(tplList);
      setPlans(planList);
    } catch (e) {
      console.error('Failed to load SaaS catalog:', e);
    }
  };

  const handleDomainSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainQuery.trim()) return;
    setSearchingDomain(true);
    setDomainSearchResults(null);
    try {
      const res = await api.searchDomains(domainQuery.trim());
      setDomainSearchResults(res);
    } catch (err: any) {
      alert(`Domain search error: ${err.message || 'Failed'}`);
    } finally {
      setSearchingDomain(false);
    }
  };

  const handleOpenDomainOrder = (domItem: any) => {
    setSelectedDomainForOrder(domItem);
    setDomainModalOpen(true);
  };

  const handleExecuteDomainOrder = async () => {
    if (!selectedDomainForOrder) return;
    setOrderLoading(true);
    try {
      const res = await api.orderDomain({
        domain_name: selectedDomainForOrder.domain_name,
        registration_years: 1,
        privacy_protection: true,
        auto_renew: true,
        payment_method: paymentMethod
      });
      setOrderSuccess(res.message);
      setTimeout(() => {
        setDomainModalOpen(false);
        setOrderSuccess(null);
        onGoToPortal();
      }, 2000);
    } catch (err: any) {
      alert(`Domain registration failed: ${err.message || 'Failed'}`);
    } finally {
      setOrderLoading(false);
    }
  };

  const handleExecuteServerProvision = async () => {
    const tier = serverTiers[selectedPlanIndex];
    setOrderLoading(true);
    try {
      const res = await api.provisionCloudServer({
        instance_name: targetServerName || `Node-${tier.name.replace(' ', '-')}`,
        plan_name: tier.name,
        region: selectedRegion,
        cpu_cores: tier.cpu,
        ram_gb: tier.ram,
        disk_gb: tier.disk,
        monthly_price_usd: annualBilling ? Math.round(tier.annual / 12) : tier.monthly,
        payment_method: paymentMethod
      });
      setOrderSuccess(`Server provisioned at IP ${res.ip_address}! Root credentials configured.`);
      setTimeout(() => {
        setServerModalOpen(false);
        setOrderSuccess(null);
        onGoToPortal();
      }, 2200);
    } catch (err: any) {
      alert(`Server provisioning failed: ${err.message || 'Failed'}`);
    } finally {
      setOrderLoading(false);
    }
  };

  const handleExecuteDeployTemplate = async () => {
    if (!selectedTemplateForDeploy) return;
    setOrderLoading(true);
    try {
      const res = await api.deployMarketplaceTemplate({
        template_slug: selectedTemplateForDeploy.slug,
        app_name: targetAppName || selectedTemplateForDeploy.title.split(' ')[0],
        domain: targetDomainName || `${(targetAppName || selectedTemplateForDeploy.slug).toLowerCase()}.cloudnode.io`
      });
      setOrderSuccess(res.message);
      setTimeout(() => {
        setDeployModalOpen(false);
        setOrderSuccess(null);
        onGoToPortal();
      }, 2200);
    } catch (err: any) {
      alert(`Deployment failed: ${err.message || 'Failed'}`);
    } finally {
      setOrderLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-brand-500 selection:text-white">
      {/* 1. Global Announcement Top Bar */}
      <div className="bg-gradient-to-r from-brand-900 via-indigo-900 to-slate-900 border-b border-brand-800/50 py-2 px-4 text-center text-xs text-brand-200 flex items-center justify-center gap-2">
        <Sparkles size={13} className="text-amber-400 shrink-0 animate-pulse" />
        <span><strong>New Release:</strong> High-Speed NVMe Cloud Nodes in Frankfurt, London, Singapore & Nairobi Now Live with Automated Zero-Trust Deploy Keys!</span>
        <button
          onClick={() => {
            setSelectedPlanIndex(1);
            setServerModalOpen(true);
          }}
          className="text-white underline font-semibold hover:text-amber-300 ml-1 inline-flex items-center gap-0.5"
        >
          <span>Provision from $5/mo</span>
          <ChevronRight size={12} />
        </button>
      </div>

      {/* 2. Glassmorphism Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-brand-500/20 text-white font-bold">
              <Server size={18} />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                <span>CloudNode</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">HQ</span>
              </span>
              <p className="text-[10px] font-mono text-slate-400 leading-none">Cloud & Domain Portal</p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-300">
            <a href="#domains" className="hover:text-white transition-colors">Domains</a>
            <a href="#servers" className="hover:text-white transition-colors">Cloud Servers</a>
            <a href="#marketplace" className="hover:text-white transition-colors">1-Click Apps</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#features" className="hover:text-white transition-colors">Infrastructure</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <button
                onClick={onGoToPortal}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Layout size={13} className="text-brand-400" />
                <span>Client Portal</span>
              </button>

              {isAdmin && (
                <button
                  onClick={onGoToAdmin}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Sliders size={13} />
                  <span>Admin Console</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onLoginClick}
                className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-900 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={onLoginClick}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 via-indigo-600 to-cyan-600 hover:from-brand-500 hover:to-cyan-500 text-white text-xs font-bold shadow-md shadow-brand-500/20 flex items-center gap-1.5 transition-all active:scale-95"
              >
                <span>Get Started Free</span>
                <ArrowRight size={13} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* 3. Hero Section with Interactive Domain Search */}
      <section className="relative pt-16 pb-20 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full text-center space-y-8 overflow-hidden">
        {/* Ambient glow backgrounds */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-brand-600/15 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 -translate-y-1/2 w-[350px] h-[250px] bg-indigo-600/15 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative space-y-4 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs text-brand-300 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Next-Generation Multi-Tenant Cloud Architecture</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
            Enterprise Cloud Servers & Instant Domain Registration Portal
          </h1>

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
            Deploy dedicated high-speed VPS instances, register global domains with sub-millisecond DNS, and launch containerized applications in 60 seconds with automated zero-trust SSH deploy keys.
          </p>
        </div>

        {/* DOMAIN SEARCH BAR */}
        <div id="domains" className="relative max-w-3xl mx-auto pt-2">
          <form
            onSubmit={handleDomainSearch}
            className="p-2 sm:p-2.5 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-2xl flex flex-col sm:flex-row items-center gap-2"
          >
            <div className="relative flex-1 w-full flex items-center pl-3">
              <Globe size={18} className="text-slate-400 shrink-0 mr-2.5" />
              <input
                type="text"
                value={domainQuery}
                onChange={(e) => setDomainQuery(e.target.value)}
                placeholder="Search your perfect domain (e.g. mycompany.com or brand.io)..."
                className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none font-mono py-1.5"
              />
            </div>
            <button
              type="submit"
              disabled={searchingDomain || !domainQuery.trim()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {searchingDomain ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              <span>{searchingDomain ? 'Searching...' : 'Check Availability'}</span>
            </button>
          </form>

          {/* Quick popular TLD pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-3 text-[11px] font-mono text-slate-400">
            <span>Popular TLDs:</span>
            {['.com $12.99', '.io $38.99', '.co.ke $9.99', '.org $13.99', '.app $14.00', '.ai $69.00'].map((tld) => (
              <button
                key={tld}
                type="button"
                onClick={() => {
                  const ext = tld.split(' ')[0];
                  setDomainQuery((prev) => (prev ? prev.split('.')[0] + ext : `mybrand${ext}`));
                }}
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                {tld}
              </button>
            ))}
          </div>

          {/* SEARCH RESULTS ACCORDION */}
          {domainSearchResults && (
            <div className="mt-5 p-4 rounded-xl bg-slate-900/95 border border-slate-800 shadow-xl text-left space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Search Results for: <code className="text-brand-300">{domainSearchResults.query}</code>
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Verified via Live DNS & WHOIS Engine
                </span>
              </div>

              {/* Exact match card */}
              {domainSearchResults.exact_match && (
                <div className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  domainSearchResults.exact_match.available
                    ? 'bg-emerald-950/40 border-emerald-800/80'
                    : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      domainSearchResults.exact_match.available
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Globe size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold font-mono text-white">
                          {domainSearchResults.exact_match.domain_name}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          domainSearchResults.exact_match.available
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}>
                          {domainSearchResults.exact_match.status_badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {domainSearchResults.exact_match.available
                          ? 'Ready for instant registration with automated DNS and Free Let\'s Encrypt SSL.'
                          : 'This domain is already registered. Check our recommended alternatives below.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="text-right">
                      <span className="text-base font-extrabold text-white">
                        ${domainSearchResults.exact_match.price_usd}
                      </span>
                      <span className="text-[10px] text-slate-400">/year</span>
                    </div>
                    {domainSearchResults.exact_match.available && (
                      <button
                        onClick={() => handleOpenDomainOrder(domainSearchResults.exact_match)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition-all active:scale-95"
                      >
                        Register Now
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Suggestions Grid */}
              {domainSearchResults.suggestions && domainSearchResults.suggestions.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-semibold text-slate-400">Top Alternative TLD Extensions:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {domainSearchResults.suggestions.map((s: any) => (
                      <div
                        key={s.domain_name}
                        className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-200">{s.domain_name}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            s.available ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-900 text-slate-500'
                          }`}>
                            {s.available ? 'AVAILABLE' : 'TAKEN'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">${s.price_usd}<span className="text-[10px] text-slate-500 font-normal">/yr</span></span>
                          {s.available && (
                            <button
                              onClick={() => handleOpenDomainOrder(s)}
                              className="px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-medium transition-colors"
                            >
                              Register
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 4. Interactive Cloud Server Configurator */}
      <section id="servers" className="py-16 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-brand-300 font-mono">
            <Cpu size={13} />
            <span>NVMe Cloud Compute</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            High-Speed Cloud VPS with Instant Provisioning
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Powered by modern AMD EPYC™ processors, PCIe 4.0 NVMe storage, and pre-configured Docker runtime. Ready in 45 seconds.
          </p>

          {/* Monthly / Annual Toggle */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <span className={`text-xs font-semibold ${!annualBilling ? 'text-white' : 'text-slate-400'}`}>Monthly</span>
            <button
              onClick={() => setAnnualBilling(!annualBilling)}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${annualBilling ? 'bg-brand-600' : 'bg-slate-800'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${annualBilling ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
            <span className={`text-xs font-semibold flex items-center gap-1 ${annualBilling ? 'text-white' : 'text-slate-400'}`}>
              <span>Annual</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                SAVE 20%
              </span>
            </span>
          </div>
        </div>

        {/* Server Specs Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {serverTiers.map((tier, idx) => {
            const isSelected = selectedPlanIndex === idx;
            const price = annualBilling ? Math.round(tier.annual / 12) : tier.monthly;
            return (
              <div
                key={tier.name}
                onClick={() => setSelectedPlanIndex(idx)}
                className={`p-5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between gap-4 ${
                  isSelected
                    ? 'bg-slate-900 border-brand-500 shadow-xl shadow-brand-500/10 ring-1 ring-brand-500'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-sm">
                    Most Popular
                  </span>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">{tier.name}</h3>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-brand-500 bg-brand-500' : 'border-slate-700'
                    }`}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-white">${price}</span>
                    <span className="text-xs text-slate-400">/month</span>
                  </div>

                  <ul className="space-y-2 text-xs text-slate-300 font-mono pt-2 border-t border-slate-800">
                    <li className="flex items-center gap-2">
                      <Cpu size={13} className="text-brand-400" />
                      <span>{tier.cpu} vCPU (Dedicated AMD)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Layers size={13} className="text-indigo-400" />
                      <span>{tier.ram} GB DDR5 RAM</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <HardDrive size={13} className="text-cyan-400" />
                      <span>{tier.disk} GB NVMe PCIe 4.0 SSD</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Zap size={13} className="text-emerald-400" />
                      <span>{tier.bandwidth} TB High-Speed Transfer</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Terminal size={13} className="text-amber-400" />
                      <span>Root SSH & Automated Deploy Key</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPlanIndex(idx);
                    setServerModalOpen(true);
                  }}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                    isSelected
                      ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <Rocket size={13} />
                  <span>Provision Node</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Regional Data Center Selector Bar */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-brand-400 shrink-0" />
            <span className="font-semibold text-white">Choose Deployment Region:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {regions.map((reg) => (
              <button
                key={reg.id}
                onClick={() => setSelectedRegion(reg.name)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  selectedRegion === reg.name
                    ? 'bg-brand-950 text-brand-300 border-brand-800 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <span>{reg.flag}</span>
                <span>{reg.name.split(' ')[0]}</span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">{reg.ping}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 5. 1-Click Application Marketplace Showcase */}
      <section id="marketplace" className="py-16 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full space-y-8 bg-slate-900/30 rounded-3xl border border-slate-800/80">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-brand-300 font-mono">
            <Box size={13} />
            <span>Application Store</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            1-Click Application & Container Marketplace
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Launch pre-configured, production-hardened web applications and database stacks in seconds with zero command-line headaches.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(templates.length > 0 ? templates : [
            { slug: 'wordpress', title: 'WordPress & MySQL', category: 'CMS & Publishing', description: 'Production-grade WordPress with PHP 8.3 FPM, MySQL 8.0, and automated SSL caching.', badge: 'Most Popular', install_time_estimate: '45 seconds' },
            { slug: 'nodejs-nextjs', title: 'Next.js & Node.js 20', category: 'Fullstack Framework', description: 'High-performance React / Next.js production SSR application powered by Node.js 20 LTS.', badge: 'DevOps Ready', install_time_estimate: '30 seconds' },
            { slug: 'python-fastapi', title: 'Python FastAPI & PostgreSQL', category: 'Backend API', description: 'Asynchronous Python 3.12 microservice with FastAPI, SQLAlchemy 2.0, and PostgreSQL.', badge: 'High Speed', install_time_estimate: '25 seconds' },
            { slug: 'laravel-php', title: 'Laravel 11 & PHP 8.3', category: 'Fullstack Framework', description: 'Full-featured Laravel 11 enterprise stack with PHP 8.3 FPM, Composer, and Redis.', badge: 'Enterprise', install_time_estimate: '40 seconds' },
            { slug: 'static-html', title: 'Static Website & Tailwind', category: 'Static Site', description: 'Ultra-lightweight static landing page served directly through Nginx with Brotli compression.', badge: 'Instant Launch', install_time_estimate: '10 seconds' },
            { slug: 'docker-compose', title: 'Custom Docker Compose', category: 'Custom Stack', description: 'Bring your own multi-container docker-compose.yml file and deploy with automated webhooks.', badge: 'Customizable', install_time_estimate: '60 seconds' },
          ]).map((tpl: any) => (
            <div
              key={tpl.slug}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between gap-4 group"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
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
                  <h3 className="text-base font-bold text-white group-hover:text-brand-300 transition-colors">
                    {tpl.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {tpl.description}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500 flex items-center gap-1">
                  <RefreshCw size={11} className="text-emerald-400" />
                  <span>{tpl.install_time_estimate || '45 seconds'}</span>
                </span>
                <button
                  onClick={() => {
                    setSelectedTemplateForDeploy(tpl);
                    setTargetAppName(tpl.title.split(' ')[0]);
                    setDeployModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-brand-600 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1 transition-all"
                >
                  <span>1-Click Deploy</span>
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Enterprise Features & Architecture Grid */}
      <section id="features" className="py-16 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-brand-300 font-mono">
            <ShieldCheck size={13} />
            <span>Zero-Trust Infrastructure</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Built for High-Availability Production Workloads
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            From zero-trust SSH deploy keys to automated Let's Encrypt certificates, CloudNode automates the hardest parts of DevOps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Lock size={20} />
            </div>
            <h3 className="text-base font-bold text-white">Automated SSH Deploy Keys</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              No need to make your GitHub or GitLab repositories public. CloudNode automatically provisions dedicated Ed25519 deploy keys on each VPS node with 1-click handshake verification.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Zap size={20} />
            </div>
            <h3 className="text-base font-bold text-white">Sub-Millisecond Anycast DNS</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Global DNS propagation within 3 seconds. Pre-configured A, CNAME, and TXT records auto-link to your VPS instances without manual zone file editing.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Terminal size={20} />
            </div>
            <h3 className="text-base font-bold text-white">Web Root Terminal Console</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Secure in-browser bash terminal connected over SSH directly to your server document root. Run composer, pip, npm, and systemctl commands with full ANSI formatting.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Rocket size={20} />
            </div>
            <h3 className="text-base font-bold text-white">Push-to-Deploy Git Webhooks</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Continuous deployment simplified. Pushing code to GitHub or GitLab triggers automated pulls, image rebuilds, and rolling container reloads with zero downtime.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <Activity size={20} />
            </div>
            <h3 className="text-base font-bold text-white">Spike Detection & Auto-Heal</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Continuous real-time telemetry monitors CPU, RAM, Disk bloat, and zombie processes. 1-click diagnostic suites drop caches and prune orphan Docker containers instantly.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <h3 className="text-base font-bold text-white">Automated SSL & Wildcards</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              ZeroSSL and Let's Encrypt certificates issued and renewed automatically 30 days before expiry. Full HTTPS redirection and modern TLS 1.3 encryption enabled by default.
            </p>
          </div>
        </div>
      </section>

      {/* 7. Transparent Pricing Plans */}
      <section id="pricing" className="py-16 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-brand-300 font-mono">
            <CreditCard size={13} />
            <span>Transparent SaaS Plans</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Simple, Predictable Infrastructure Pricing
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            No surprise bandwidth fees. No hidden add-ons. Upgrade or downgrade at any time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(plans.length > 0 ? plans : [
            {
              name: 'Cloud Starter',
              slug: 'starter',
              description: 'Ideal for freelance developers, fast MVP launches, and production blogs.',
              monthly_price_usd: 9.0,
              badge: 'Most Popular',
              is_popular: true,
              features: [
                'Up to 3 High-Speed Cloud VPS Nodes',
                '10 Managed Domains with Instant DNS',
                '15 1-Click Containerized Applications',
                'Private Git Sync & Deploy Keys',
                'Push-to-Deploy Webhook Automation',
                'Daily Web Server & DB Backups',
                'Standard SLA & Live Email Support'
              ]
            },
            {
              name: 'DevOps Pro',
              slug: 'pro',
              description: 'Comprehensive fleet orchestrator for growing agencies and SaaS startups.',
              monthly_price_usd: 29.0,
              badge: 'DevOps Power',
              is_popular: false,
              features: [
                '10 Production VPS Instances',
                '50 Custom Domains & Catch-All VirtualHosts',
                'Unlimited Application Deployments',
                'Docker Swarm & Container Tuning Hub',
                'Automated Performance Spike Remediation',
                'Multi-User Team RBAC Access',
                'Priority 24/7 DevOps Support'
              ]
            },
            {
              name: 'Enterprise Fleet',
              slug: 'enterprise',
              description: 'Unlimited multi-region infrastructure for mission-critical SaaS platforms.',
              monthly_price_usd: 99.0,
              badge: 'Enterprise SLA',
              is_popular: false,
              features: [
                '50+ Dedicated Cloud & Bare Metal Servers',
                'Unlimited Domains & Wildcard SSL',
                'High-Availability Load Balancing',
                'Custom Isolated Docker Networks',
                'SOC2 / HIPAA Compliant Audit Trails',
                'Dedicated Infrastructure Engineer',
                '99.99% Uptime Guarantee'
              ]
            }
          ]).map((p: any) => (
            <div
              key={p.slug}
              className={`p-6 rounded-2xl border transition-all flex flex-col justify-between gap-6 relative ${
                p.is_popular
                  ? 'bg-slate-900 border-brand-500 shadow-xl shadow-brand-500/10 ring-1 ring-brand-500'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              {p.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-600 text-white shadow-sm">
                  {p.badge}
                </span>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{p.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{p.description}</p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">${p.monthly_price_usd}</span>
                  <span className="text-xs text-slate-400">/month</span>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-2.5">
                  <span className="text-[11px] font-semibold text-slate-300">Plan Highlights:</span>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {(p.features || []).map((feat: string, fIdx: number) => (
                      <li key={fIdx} className="flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <button
                onClick={onLoginClick}
                className={`w-full py-3 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                  p.is_popular
                    ? 'bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white shadow-md'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <span>Subscribe to {p.name}</span>
                <ArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 8. Interactive FAQ Accordion */}
      <section id="faq" className="py-16 px-4 sm:px-6 md:px-8 max-w-4xl mx-auto w-full space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-xs text-slate-400">
            Everything you need to know about domain registration, VPS servers, and automated deployment.
          </p>
        </div>

        <div className="space-y-3">
          {[
            {
              q: 'How fast are domains and cloud servers provisioned?',
              a: 'Domains and Cloud VPS instances are provisioned instantly. DNS records propagate across our global anycast edge in 3 to 10 seconds. Cloud servers are ready for SSH and application deployment in under 45 seconds.'
            },
            {
              q: 'Do I need to make my GitHub or GitLab repository public?',
              a: 'No! CloudNode generates automated Ed25519 deploy keys on each server. You simply copy the public key to your private repository settings once, and our automated Git engine synchronizes your private code safely.'
            },
            {
              q: 'Can I bring my own existing VPS or bare metal servers?',
              a: 'Yes! CloudNode provides a 1-click curl enrollment command to connect any remote Ubuntu or Debian server into your Central Command Center regardless of hosting provider.'
            },
            {
              q: 'Are SSL certificates included and automatically renewed?',
              a: 'Yes, 100% free Let\'s Encrypt and ZeroSSL certificates with automated 90-day renewal loops are pre-configured on all provisioned domains and virtual hosts.'
            },
            {
              q: 'What happens if my server experiences high memory or CPU contention?',
              a: 'CloudNode includes an automated Performance Spike Detection Engine that identifies memory leaks, high-load daemons, and disk bloat, with 1-click remediation tools to drop cached pages and prune inactive Docker layers.'
            }
          ].map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full p-4 text-left text-sm font-bold text-white flex items-center justify-between gap-4 hover:bg-slate-850"
                >
                  <span>{faq.q}</span>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-brand-400' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 9. High-Impact Call-to-Action Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-slate-950 py-12 px-4 sm:px-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white">
                <Server size={14} />
              </div>
              <span className="font-bold text-sm text-white">CloudNode HQ</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Enterprise Cloud VPS, Instant Domain Registration, and Automated 1-Click Container Deployment.
            </p>
            <div className="text-[10px] text-slate-500 font-mono">
              Status: <span className="text-emerald-400 font-semibold">All Systems 99.99% Operational</span>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Products</h4>
            <ul className="space-y-1.5 text-[11px]">
              <li><a href="#domains" className="hover:text-white transition-colors">Domain Registration</a></li>
              <li><a href="#servers" className="hover:text-white transition-colors">Cloud VPS Instances</a></li>
              <li><a href="#marketplace" className="hover:text-white transition-colors">1-Click App Store</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Deploy Key Automation</a></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Infrastructure</h4>
            <ul className="space-y-1.5 text-[11px]">
              <li><span className="text-slate-300">Frankfurt (eu-central-1)</span></li>
              <li><span className="text-slate-300">London (uk-south-1)</span></li>
              <li><span className="text-slate-300">New York (us-east-1)</span></li>
              <li><span className="text-slate-300">Nairobi (af-south-1)</span></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Access</h4>
            <div className="space-y-2">
              <button
                onClick={onLoginClick}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                Sign In to Portal
              </button>
              <button
                onClick={onGoToAdmin}
                className="w-full py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Central Command Center
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 border-t border-slate-850 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <span>&copy; {new Date().getFullYear()} CloudNode HQ Inc. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Security Compliance</span>
          </div>
        </div>
      </footer>

      {/* ==================================================== */}
      {/* MODAL 1: DOMAIN REGISTRATION CHECKOUT */}
      {/* ==================================================== */}
      {domainModalOpen && selectedDomainForOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Globe size={18} className="text-emerald-400" />
                <h3 className="font-bold text-white text-base">Register Domain</h3>
              </div>
              <button onClick={() => setDomainModalOpen(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            {orderSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-medium space-y-2 text-center">
                <CheckCircle2 size={24} className="mx-auto text-emerald-400 animate-bounce" />
                <p>{orderSuccess}</p>
                <p className="text-[11px] text-emerald-400 font-mono">Redirecting to your Client Dashboard...</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <span className="font-mono text-white text-sm font-bold">{selectedDomainForOrder.domain_name}</span>
                  <span className="font-bold text-white text-sm">${selectedDomainForOrder.price_usd} / yr</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold">Payment Method:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['CARD', 'PAYPAL', 'MPESA', 'PROMO'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`p-2.5 rounded-lg border text-center font-bold text-[11px] transition-colors ${
                          paymentMethod === m
                            ? 'bg-brand-950 text-brand-300 border-brand-700'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {m === 'CARD' ? '💳 Credit Card' : m === 'PAYPAL' ? '🅿️ PayPal' : m === 'MPESA' ? '📱 M-Pesa' : '🎁 Free Trial'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 text-slate-400 text-[11px]">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Check size={12} />
                    <span>Includes Free WHOIS Privacy Protection</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Check size={12} />
                    <span>Includes Automated Let's Encrypt SSL</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Check size={12} />
                    <span>Instant DNS record propagation</span>
                  </div>
                </div>

                <button
                  onClick={handleExecuteDomainOrder}
                  disabled={orderLoading}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {orderLoading ? <RefreshCw size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                  <span>{orderLoading ? 'Provisioning...' : `Pay $${selectedDomainForOrder.price_usd} & Register`}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 2: CLOUD SERVER PROVISIONING */}
      {/* ==================================================== */}
      {serverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Server size={18} className="text-brand-400" />
                <h3 className="font-bold text-white text-base">Provision Cloud VPS</h3>
              </div>
              <button onClick={() => setServerModalOpen(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            {orderSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-medium space-y-2 text-center">
                <CheckCircle2 size={24} className="mx-auto text-emerald-400 animate-bounce" />
                <p>{orderSuccess}</p>
                <p className="text-[11px] text-emerald-400 font-mono">Redirecting to Server Control Center...</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Instance Hostname / Name:</label>
                  <input
                    type="text"
                    value={targetServerName}
                    onChange={(e) => setTargetServerName(e.target.value)}
                    placeholder="e.g. Production-Node-01"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-slate-300">
                  <div className="flex items-center justify-between font-bold text-white">
                    <span>{serverTiers[selectedPlanIndex].name}</span>
                    <span className="text-brand-400">${annualBilling ? Math.round(serverTiers[selectedPlanIndex].annual / 12) : serverTiers[selectedPlanIndex].monthly}/mo</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {serverTiers[selectedPlanIndex].cpu} vCPU • {serverTiers[selectedPlanIndex].ram}GB RAM • {serverTiers[selectedPlanIndex].disk}GB NVMe SSD
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Region: <span className="text-white">{selectedRegion}</span>
                  </div>
                </div>

                <button
                  onClick={handleExecuteServerProvision}
                  disabled={orderLoading}
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {orderLoading ? <RefreshCw size={13} className="animate-spin" /> : <Rocket size={13} />}
                  <span>{orderLoading ? 'Deploying VPS Node...' : 'Launch Cloud Instance'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 3: 1-CLICK APP MARKETPLACE DEPLOY */}
      {/* ==================================================== */}
      {deployModalOpen && selectedTemplateForDeploy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Box size={18} className="text-brand-400" />
                <h3 className="font-bold text-white text-base">Deploy {selectedTemplateForDeploy.title}</h3>
              </div>
              <button onClick={() => setDeployModalOpen(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            {orderSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-medium space-y-2 text-center">
                <CheckCircle2 size={24} className="mx-auto text-emerald-400 animate-bounce" />
                <p>{orderSuccess}</p>
                <p className="text-[11px] text-emerald-400 font-mono">Redirecting to Application Console...</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Application Service Name:</label>
                  <input
                    type="text"
                    value={targetAppName}
                    onChange={(e) => setTargetAppName(e.target.value)}
                    placeholder="e.g. MyWordPressSite"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Domain / Hostname to Bind:</label>
                  <input
                    type="text"
                    value={targetDomainName}
                    onChange={(e) => setTargetDomainName(e.target.value)}
                    placeholder="e.g. blog.mycompany.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                  />
                  <p className="text-[10px] text-slate-500">Free SSL certificate will be automatically issued for this domain.</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-[11px] space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Check size={12} />
                    <span>Includes pre-configured Docker container stack</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Check size={12} />
                    <span>Automated Push-to-Deploy Webhook generated</span>
                  </div>
                </div>

                <button
                  onClick={handleExecuteDeployTemplate}
                  disabled={orderLoading || !targetDomainName.trim()}
                  className="w-full py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {orderLoading ? <RefreshCw size={13} className="animate-spin" /> : <Rocket size={13} />}
                  <span>{orderLoading ? 'Deploying Stack...' : 'Deploy to Cloud Server'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
