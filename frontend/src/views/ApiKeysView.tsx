import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  Shield,
  Bot,
  Sparkles,
  Eye,
  EyeOff,
  Radio,
  Zap,
  Activity,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Save
} from 'lucide-react';
import { api, AiKeysConfigResponse, AiKeysTestResponse } from '../api/client';
import { Button, InputField, Card, ModalShell } from '../components/common';

export const ApiKeysView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ai' | 'machine'>('ai');

  // Machine Keys State
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [role, setRole] = useState('READ_ONLY');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // AI Providers Keys State
  const [aiConfig, setAiConfig] = useState<AiKeysConfigResponse | null>(null);
  const [loadingAi, setLoadingAi] = useState(true);
  const [savingAi, setSavingAi] = useState(false);
  
  // Inputs for keys
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [activeProvider, setActiveProvider] = useState('auto');

  // Show/Hide password toggles
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    gemini: false,
    openai: false,
    deepseek: false,
    anthropic: false,
  });

  // Test connection state
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AiKeysTestResponse | null>>({});

  // Toast feedback state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadMachineKeys = async () => {
    try {
      const res = await api.listApiKeys();
      setApiKeys(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingKeys(false);
    }
  };

  const loadAiConfig = async () => {
    setLoadingAi(true);
    try {
      const res = await api.getAiKeysConfig();
      setAiConfig(res);
      setActiveProvider(res.active_provider || 'auto');
      setGeminiKey(res.gemini.configured ? res.gemini.masked_key || '' : '');
      setOpenaiKey(res.openai.configured ? res.openai.masked_key || '' : '');
      setDeepseekKey(res.deepseek.configured ? res.deepseek.masked_key || '' : '');
      setAnthropicKey(res.anthropic.configured ? res.anthropic.masked_key || '' : '');
    } catch (e: any) {
      console.error('Failed to load AI keys config', e);
      showToast(e.message || 'Failed to load AI configurations', 'error');
    } finally {
      setLoadingAi(false);
    }
  };

  useEffect(() => {
    loadMachineKeys();
    loadAiConfig();
  }, []);

  const handleSaveAiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true);
    try {
      const payload: any = { active_provider: activeProvider };
      if (geminiKey && !geminiKey.includes('...')) payload.gemini_api_key = geminiKey;
      if (openaiKey && !openaiKey.includes('...')) payload.openai_api_key = openaiKey;
      if (deepseekKey && !deepseekKey.includes('...')) payload.deepseek_api_key = deepseekKey;
      if (anthropicKey && !anthropicKey.includes('...')) payload.anthropic_api_key = anthropicKey;

      const res = await api.updateAiKeysConfig(payload);
      setAiConfig(res);
      setActiveProvider(res.active_provider || 'auto');
      setGeminiKey(res.gemini.configured ? res.gemini.masked_key || '' : '');
      setOpenaiKey(res.openai.configured ? res.openai.masked_key || '' : '');
      setDeepseekKey(res.deepseek.configured ? res.deepseek.masked_key || '' : '');
      setAnthropicKey(res.anthropic.configured ? res.anthropic.masked_key || '' : '');
      showToast('AI Provider API Keys saved and updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save AI configuration', 'error');
    } finally {
      setSavingAi(false);
    }
  };

  const handleTestConnection = async (provider: string, currentInput: string) => {
    setTestingProvider(provider);
    setTestResults(prev => ({ ...prev, [provider]: null }));
    try {
      const rawToSend = currentInput && !currentInput.includes('...') ? currentInput : undefined;
      const res = await api.testAiKey(provider, rawToSend);
      setTestResults(prev => ({ ...prev, [provider]: res }));
      if (res.success) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [provider]: {
          success: false,
          provider,
          message: err.message || 'Connection test failed',
          latency_ms: 0
        }
      }));
      showToast(err.message || 'Connection test failed', 'error');
    } finally {
      setTestingProvider(null);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createApiKey(keyName, role);
      setCreatedSecret(res.api_key);
      setKeyName('');
      loadMachineKeys();
      showToast('API Key generated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to generate API Key', 'error');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API token? Any remote agent using this key will immediately lose access.')) return;
    try {
      await api.revokeApiKey(id);
      loadMachineKeys();
      showToast('API Key revoked successfully', 'info');
    } catch (err: any) {
      showToast(err.message || 'Revocation failed', 'error');
    }
  };

  const copyToClipboard = () => {
    if (createdSecret) {
      navigator.clipboard.writeText(createdSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('API Token copied to clipboard', 'info');
    }
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-top-2 duration-200 ${
          toast.type === 'success'
            ? 'bg-emerald-950 border-emerald-700 text-emerald-200'
            : toast.type === 'error'
            ? 'bg-rose-950 border-rose-700 text-rose-200'
            : 'bg-sky-950 border-sky-700 text-sky-200'
        }`}>
          {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle size={16} className="text-rose-400" />}
          {toast.type === 'info' && <Zap size={16} className="text-sky-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <KeyRound className="text-brand-400" size={24} />
            <span>API Keys & Machine Integrations</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure generative AI providers (Gemini, OpenAI, DeepSeek, Claude) for real-time error diagnostics and generate machine tokens for remote agents.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'ai'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles size={14} className={activeTab === 'ai' ? 'text-amber-300' : ''} />
            <span>AI Model Keys (Gemini, OpenAI, Claude)</span>
          </button>

          <button
            onClick={() => setActiveTab('machine')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'machine'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield size={14} />
            <span>Machine Bearer Tokens ({apiKeys.length})</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: AI MODEL KEYS CONFIGURATION */}
      {/* ============================================================== */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          {/* Hero Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-brand-950/60 via-slate-900 to-slate-900 border border-brand-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0">
                <Bot size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Generative AI Infrastructure SRE Agents</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                    Live Diagnostics
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  When you run health probes or detect failures, these AI models automatically inspect the error, identify the root cause, and formulate exact Linux/Docker command fixes.
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={loadAiConfig}
              isLoading={loadingAi}
              leftIcon={<RefreshCw size={13} />}
            >
              Reload Status
            </Button>
          </div>

          <form onSubmit={handleSaveAiKeys} className="space-y-6">
            {/* Preferred Active Provider Selector */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Radio size={13} className="text-brand-400" />
                    <span>Default AI Model for Live Error Diagnosis</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Choose which AI provider handles error investigations when you click "Run AI Health Diagnostics".
                  </p>
                </div>
                {aiConfig?.has_any_key && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    AI Engine Ready
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                {[
                  { id: 'auto', label: 'Auto (First Available)', icon: Sparkles, badge: 'Recommended' },
                  { id: 'gemini', label: 'Google Gemini', icon: Bot, badge: 'Fastest' },
                  { id: 'openai', label: 'OpenAI GPT-4o', icon: Zap, badge: 'Standard' },
                  { id: 'deepseek', label: 'DeepSeek V3', icon: Activity, badge: 'Cost-Effective' },
                  { id: 'anthropic', label: 'Claude 3.5 Sonnet', icon: Shield, badge: 'Deep Reasoning' },
                ].map(opt => {
                  const Icon = opt.icon;
                  const isSelected = activeProvider === opt.id;
                  return (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => setActiveProvider(opt.id)}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-brand-600/20 border-brand-500 text-white shadow-sm ring-1 ring-brand-500/50'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <Icon size={16} className={isSelected ? 'text-brand-400' : 'text-slate-500'} />
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          {opt.badge}
                        </span>
                      </div>
                      <div className="text-xs font-bold truncate">{opt.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Providers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Google Gemini */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-xs">
                      G
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Google Gemini</span>
                        <span className="text-[10px] text-sky-400 font-mono font-normal">(gemini-3.8-flash / fallback)</span>
                      </h4>
                      <p className="text-[10px] text-slate-400">Google AI Studio key with fast multimodal analysis</p>
                    </div>
                  </div>

                  {aiConfig?.gemini.configured ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Configured
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-950 text-slate-500 border border-slate-800">
                      Not Configured
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-300 flex items-center justify-between">
                    <span>Gemini API Key</span>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <span>Get Free Key</span>
                      <ExternalLink size={10} />
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeys.gemini ? 'text' : 'password'}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full pl-3 pr-20 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 font-mono"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleShowKey('gemini')}
                        className="p-1 text-slate-500 hover:text-slate-300 rounded"
                        title={showKeys.gemini ? 'Hide' : 'Show'}
                      >
                        {showKeys.gemini ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Test Connection Button & Result */}
                <div className="pt-1 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => handleTestConnection('gemini', geminiKey)}
                    isLoading={testingProvider === 'gemini'}
                    leftIcon={<Zap size={11} />}
                  >
                    Test Gemini Connection
                  </Button>

                  {testResults.gemini && (
                    <span className={`text-[10px] font-semibold flex items-center gap-1 truncate max-w-[200px] ${
                      testResults.gemini.success ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {testResults.gemini.success ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      <span>{testResults.gemini.success ? `Connected (${testResults.gemini.latency_ms}ms)` : 'Failed'}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* 2. OpenAI */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
                      OA
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>OpenAI</span>
                        <span className="text-[10px] text-emerald-400 font-mono font-normal">(gpt-4o-mini / gpt-4o)</span>
                      </h4>
                      <p className="text-[10px] text-slate-400">OpenAI platform API key for high-intelligence fixes</p>
                    </div>
                  </div>

                  {aiConfig?.openai.configured ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Configured
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-950 text-slate-500 border border-slate-800">
                      Not Configured
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-300 flex items-center justify-between">
                    <span>OpenAI API Key</span>
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <span>OpenAI Dashboard</span>
                      <ExternalLink size={10} />
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeys.openai ? 'text' : 'password'}
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder="sk-proj-..."
                      className="w-full pl-3 pr-20 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 font-mono"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleShowKey('openai')}
                        className="p-1 text-slate-500 hover:text-slate-300 rounded"
                        title={showKeys.openai ? 'Hide' : 'Show'}
                      >
                        {showKeys.openai ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Test Connection Button & Result */}
                <div className="pt-1 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => handleTestConnection('openai', openaiKey)}
                    isLoading={testingProvider === 'openai'}
                    leftIcon={<Zap size={11} />}
                  >
                    Test OpenAI Connection
                  </Button>

                  {testResults.openai && (
                    <span className={`text-[10px] font-semibold flex items-center gap-1 truncate max-w-[200px] ${
                      testResults.openai.success ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {testResults.openai.success ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      <span>{testResults.openai.success ? `Connected (${testResults.openai.latency_ms}ms)` : 'Failed'}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* 3. DeepSeek */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs">
                      DS
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>DeepSeek</span>
                        <span className="text-[10px] text-indigo-400 font-mono font-normal">(deepseek-chat / V3)</span>
                      </h4>
                      <p className="text-[10px] text-slate-400">DeepSeek open reasoning platform key</p>
                    </div>
                  </div>

                  {aiConfig?.deepseek.configured ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Configured
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-950 text-slate-500 border border-slate-800">
                      Not Configured
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-300 flex items-center justify-between">
                    <span>DeepSeek API Key</span>
                    <a
                      href="https://platform.deepseek.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <span>DeepSeek Portal</span>
                      <ExternalLink size={10} />
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeys.deepseek ? 'text' : 'password'}
                      value={deepseekKey}
                      onChange={(e) => setDeepseekKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full pl-3 pr-20 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 font-mono"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleShowKey('deepseek')}
                        className="p-1 text-slate-500 hover:text-slate-300 rounded"
                        title={showKeys.deepseek ? 'Hide' : 'Show'}
                      >
                        {showKeys.deepseek ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Test Connection Button & Result */}
                <div className="pt-1 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => handleTestConnection('deepseek', deepseekKey)}
                    isLoading={testingProvider === 'deepseek'}
                    leftIcon={<Zap size={11} />}
                  >
                    Test DeepSeek Connection
                  </Button>

                  {testResults.deepseek && (
                    <span className={`text-[10px] font-semibold flex items-center gap-1 truncate max-w-[200px] ${
                      testResults.deepseek.success ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {testResults.deepseek.success ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      <span>{testResults.deepseek.success ? `Connected (${testResults.deepseek.latency_ms}ms)` : 'Failed'}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* 4. Anthropic Claude */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
                      CL
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Anthropic Claude</span>
                        <span className="text-[10px] text-amber-400 font-mono font-normal">(claude-3-5-sonnet)</span>
                      </h4>
                      <p className="text-[10px] text-slate-400">Anthropic console key for advanced SRE reasoning</p>
                    </div>
                  </div>

                  {aiConfig?.anthropic.configured ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Configured
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-950 text-slate-500 border border-slate-800">
                      Not Configured
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-300 flex items-center justify-between">
                    <span>Claude API Key</span>
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <span>Anthropic Console</span>
                      <ExternalLink size={10} />
                    </a>
                  </label>
                  <div className="relative">
                    <input
                      type={showKeys.anthropic ? 'text' : 'password'}
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="w-full pl-3 pr-20 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 font-mono"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleShowKey('anthropic')}
                        className="p-1 text-slate-500 hover:text-slate-300 rounded"
                        title={showKeys.anthropic ? 'Hide' : 'Show'}
                      >
                        {showKeys.anthropic ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Test Connection Button & Result */}
                <div className="pt-1 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => handleTestConnection('anthropic', anthropicKey)}
                    isLoading={testingProvider === 'anthropic'}
                    leftIcon={<Zap size={11} />}
                  >
                    Test Claude Connection
                  </Button>

                  {testResults.anthropic && (
                    <span className={`text-[10px] font-semibold flex items-center gap-1 truncate max-w-[200px] ${
                      testResults.anthropic.success ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {testResults.anthropic.success ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      <span>{testResults.anthropic.success ? `Connected (${testResults.anthropic.latency_ms}ms)` : 'Failed'}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Save Action Toolbar */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Shield size={14} className="text-emerald-400 shrink-0" />
                <span>API keys are stored securely in database system settings and masked in all audit outputs.</span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={savingAi}
                leftIcon={<Save size={14} />}
              >
                Save All AI Provider Keys
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: MACHINE BEARER TOKENS */}
      {/* ============================================================== */}
      {activeTab === 'machine' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Machine Bearer Tokens</h3>
              <p className="text-xs text-slate-400">Tokens for automated CI/CD runners, monitoring agents, and webhooks.</p>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setCreatedSecret(null);
                setCreateModalOpen(true);
              }}
              leftIcon={<Plus size={14} />}
            >
              Generate API Key
            </Button>
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
                  {loadingKeys ? (
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
        </div>
      )}

      {/* Create Key Modal Shell */}
      <ModalShell
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={createdSecret ? "Generated Machine API Key" : "Generate Scoped API Token"}
        description={createdSecret ? "Copy and store your secret key securely now." : "Create a new bearer token for automated external integrations."}
        size="md"
      >
        {createdSecret ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-950/80 border border-amber-800 text-amber-300 text-xs rounded-xl">
              <strong>Save your token now:</strong> This secret key will NEVER be shown again!
            </div>
            <div className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <span className="flex-1 font-mono text-xs text-brand-300 break-all select-all">
                {createdSecret}
              </span>
              <button
                onClick={copyToClipboard}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors shrink-0"
                title="Copy Key"
              >
                {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                onClick={() => setCreateModalOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateKey} className="space-y-4 text-xs">
            <InputField
              label="Key Description / Client Name"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. GitHub Actions Deploy Runner"
              required
            />

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Access Role Scope</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-brand-500"
              >
                <option value="READ_ONLY">READ_ONLY (Telemetry & Logs)</option>
                <option value="DEPLOYMENT_ADMIN">DEPLOYMENT_ADMIN (Pipelines & Git)</option>
                <option value="INFRASTRUCTURE_ADMIN">INFRASTRUCTURE_ADMIN (Servers & Agents)</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN (Full Privileges)</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
              >
                Generate Token
              </Button>
            </div>
          </form>
        )}
      </ModalShell>
    </div>
  );
};
