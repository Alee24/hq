import React, { useState } from 'react';
import { Shield, Lock, User, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { InputField } from '../components/common/InputField';

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
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-900/40">
            <Shield size={24} />
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Central Software Command Center
          </h1>
          <p className="text-xs text-slate-400">
            Multi-VPS Infrastructure & Application Lifecycle Administration
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs animate-in shake duration-150"
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Production Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <InputField
            label="Username or Email"
            isRequired
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Email address or username"
            leftIcon={<User size={16} />}
          />

          <InputField
            label="Password"
            isRequired
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            leftIcon={<Lock size={16} />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={loading}
            touchTarget
            className="w-full mt-2"
            rightIcon={<ArrowRight size={16} />}
          >
            Sign In to Command Center
          </Button>
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
