import React, { useState } from 'react';
import { Shield, Lock, User, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter your username/email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login({ username_or_email: username.trim(), password });
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
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

        {/* Production Login Form */}
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
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                placeholder="Email address or username"
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
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 focus:outline-none transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
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
                <span>Sign In to Command Center</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Security watermark */}
        <div className="pt-2 border-t border-slate-800 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5 mono">
          <Shield size={12} className="text-slate-400" />
          <span>ENTERPRISE ENCRYPTED SESSION</span>
        </div>
      </div>
    </div>
  );
};
