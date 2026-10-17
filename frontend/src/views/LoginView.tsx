import React, { useState } from 'react';
import { Shield, Lock, User, ArrowRight, AlertCircle, Eye, EyeOff, Globe, Sparkles, UserPlus, LogIn, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Button } from '../components/common/Button';
import { InputField } from '../components/common/InputField';

interface LoginViewProps {
  onBackToLanding?: () => void;
  initialMode?: 'signin' | 'signup';
}

export const LoginView: React.FC<LoginViewProps> = ({ onBackToLanding, initialMode = 'signin' }) => {
  const { login } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);

  // Sign In fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign Up fields
  const [signupEmail, setSignupEmail] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupFullName, setSignupFullName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail.trim() || !signupUsername.trim() || !signupPassword) {
      setError('Please fill out all required fields.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.registerCustomer({
        email: signupEmail.trim(),
        username: signupUsername.trim(),
        password: signupPassword,
        full_name: signupFullName.trim() || signupUsername.trim(),
        plan_slug: 'starter'
      });
      setSuccessMsg(`Welcome, ${res.username}! Your account has been provisioned. Signing you in...`);
      // Auto login with newly created credentials
      await login({ username_or_email: signupUsername.trim(), password: signupPassword });
    } catch (err: any) {
      setError(err.message || 'Registration failed. Username or email may already be registered.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,140,228,0.15),rgba(255,255,255,0))]">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
        {/* Navigation & Brand Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-md">
              <Shield size={18} />
            </div>
            <span className="font-extrabold text-sm text-white">CloudNode HQ</span>
          </div>

          {onBackToLanding && (
            <button
              onClick={onBackToLanding}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-medium transition-colors"
            >
              <Globe size={13} />
              <span>Back to Website</span>
            </button>
          )}
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              mode === 'signin' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn size={13} />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              mode === 'signup' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus size={13} />
            <span>Create Account</span>
          </button>
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

        {successMsg && (
          <div
            role="status"
            className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs animate-in fade-in"
          >
            <Sparkles size={16} className="shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 1. Sign In Form */}
        {mode === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-4">
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
              Sign In to Portal
            </Button>
          </form>
        ) : (
          /* 2. Customer Registration Form */
          <form onSubmit={handleSignUp} className="space-y-3.5">
            <InputField
              label="Full Name (Optional)"
              type="text"
              value={signupFullName}
              onChange={(e) => setSignupFullName(e.target.value)}
              placeholder="Alex Doe"
              leftIcon={<User size={16} />}
            />

            <InputField
              label="Work Email"
              isRequired
              type="email"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              placeholder="name@company.com"
              leftIcon={<Mail size={16} />}
            />

            <InputField
              label="Username"
              isRequired
              type="text"
              value={signupUsername}
              onChange={(e) => setSignupUsername(e.target.value)}
              placeholder="alexdoe"
              leftIcon={<User size={16} />}
            />

            <InputField
              label="Password"
              isRequired
              type={showPassword ? 'text' : 'password'}
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              placeholder="Create strong password"
              leftIcon={<Lock size={16} />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
              <span className="text-emerald-400 font-bold">Free Trial Included:</span> Instant access to Cloud VPS provisioning, domain search, and 1-click deployments.
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={loading}
              touchTarget
              className="w-full"
              rightIcon={<ArrowRight size={16} />}
            >
              Create Account & Launch Portal
            </Button>
          </form>
        )}

        {/* Security watermark */}
        <div className="pt-2 border-t border-slate-800 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5 mono">
          <Shield size={12} className="text-slate-400" />
          <span>ENTERPRISE ENCRYPTED SESSION</span>
        </div>
      </div>
    </div>
  );
};

