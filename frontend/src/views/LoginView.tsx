import React, { useState } from 'react';
import { Shield, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ username_or_email: username, password });
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (userRoleName: string) => {
    setUsername(userRoleName);
    setPassword('Password123!');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,140,228,0.15),rgba(255,255,255,0))]">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-8 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-900/40">
            <Shield size={24} />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Central Software Command Center
          </h1>
          <p className="text-xs text-slate-400">
            Multi-VPS Infrastructure & Application Lifecycle Administration
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Username or Email
            </label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                placeholder="admin"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Authenticate & Access Command Center</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Credentials */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
            Role Quick Select
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin')}
              className="p-2 rounded bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-left transition-colors"
            >
              <div className="font-semibold text-brand-400">admin</div>
              <div className="text-[10px] text-slate-400">Super Admin (All)</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('infra_admin')}
              className="p-2 rounded bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-left transition-colors"
            >
              <div className="font-semibold text-emerald-400">infra_admin</div>
              <div className="text-[10px] text-slate-400">Infrastructure Lead</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('deploy_admin')}
              className="p-2 rounded bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-left transition-colors"
            >
              <div className="font-semibold text-purple-400">deploy_admin</div>
              <div className="text-[10px] text-slate-400">Deployment Admin</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('viewer')}
              className="p-2 rounded bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-left transition-colors"
            >
              <div className="font-semibold text-slate-400">viewer</div>
              <div className="text-[10px] text-slate-400">Read Only Auditor</div>
            </button>
          </div>
        </div>

        {/* Bottom security watermark */}
        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5 mono">
          <Shield size={12} className="text-slate-400" />
          <span>FIPS 140-2 / ED25519 COMPLIANT MESH</span>
        </div>
      </div>
    </div>
  );
};
