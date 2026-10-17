import React, { useState } from 'react';
import {
  Menu,
  Search,
  Bell,
  Sun,
  Moon,
  ChevronDown,
  LogOut,
  User as UserIcon,
  Shield,
  Activity,
  Layers,
  Sparkles,
  Mail,
  Globe,
  Layout
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEnvironment } from '../context/EnvironmentContext';
import { useTheme } from '../context/ThemeContext';

interface TopBarProps {
  onOpenSearch: () => void;
  onOpenWizard: () => void;
  onNavigate: (view: string) => void;
  onToggleMobileMenu?: () => void;
  activeAlertsCount?: number;
  onGoToPortal?: () => void;
  onGoToLanding?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenSearch,
  onOpenWizard,
  onNavigate,
  onToggleMobileMenu,
  activeAlertsCount = 0,
  onGoToPortal,
  onGoToLanding,
}) => {
  const { user, logout } = useAuth();
  const { environment, setEnvironment } = useEnvironment();
  const { theme, toggleTheme } = useTheme();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 sm:px-5 flex items-center justify-between shrink-0 select-none z-10">
      {/* Left side: Hamburger (Mobile) + Search + Environment */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile Menu Button */}
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg md:hidden transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Omni Search Button */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-xs transition-colors w-36 sm:w-64 md:w-72 lg:w-80 text-left focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          title="Open Global Search (Ctrl+K)"
        >
          <Search size={15} className="shrink-0 text-slate-400" />
          <span className="flex-1 truncate hidden sm:inline">Search applications, servers, IPs...</span>
          <span className="flex-1 truncate sm:hidden">Search...</span>
          <kbd className="hidden md:inline-block px-1.5 py-0.5 bg-slate-800 text-[10px] text-slate-400 border border-slate-700 rounded mono">
            Ctrl+K
          </kbd>
        </button>

        {/* Environment Selector (Hidden on extra-small mobile, visible on sm+) */}
        <div className="hidden sm:flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
          <Layers size={13} className="text-slate-400 ml-1 shrink-0" />
          {(['all', 'production', 'staging', 'development'] as const).map((env) => {
            const isActive = environment === env;
            return (
              <button
                key={env}
                onClick={() => setEnvironment(env)}
                className={`px-2 py-0.5 rounded-md font-medium capitalize transition-colors text-[11px] focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {env === 'all' ? 'All' : env === 'production' ? 'Prod' : env === 'staging' ? 'Stage' : 'Dev'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right side: Health, Setup Wizard, Theme, Notifications, Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* System Health Indicator (Desktop) */}
        <button
          onClick={() => onNavigate('system-health')}
          className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 text-xs font-medium hover:bg-emerald-900/40 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          title="System Health Status"
        >
          <Activity size={13} />
          <span>Systems Normal</span>
        </button>

        {/* Setup Wizard launcher (Tablet/Desktop) */}
        <button
          onClick={onOpenWizard}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          title="Launch Setup Wizard"
        >
          <Sparkles size={13} className="text-amber-400" />
          <span>Setup Wizard</span>
        </button>

        {/* Client Portal Link */}
        {onGoToPortal && (
          <button
            onClick={onGoToPortal}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-950/80 hover:bg-brand-900 border border-brand-800 text-brand-300 hover:text-white text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            title="Open Customer SaaS Portal"
          >
            <Layout size={13} />
            <span>Client Portal</span>
          </button>
        )}

        {/* Public Website Link */}
        {onGoToLanding && (
          <button
            onClick={onGoToLanding}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            title="Open Public Cloud & Domain SaaS Website"
          >
            <Globe size={13} className="text-emerald-400" />
            <span>Public Site</span>
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(prev => !prev)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors relative focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            title="Notifications & Alerts"
            aria-label="View notifications and alerts"
          >
            <Bell size={17} />
            {activeAlertsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-slate-900" />
            )}
          </button>

          {notificationsOpen && (
            <div
              className="absolute right-0 mt-2 w-72 sm:w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-3 z-30 animate-in fade-in duration-100"
              onMouseLeave={() => setNotificationsOpen(false)}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                <span className="text-xs font-semibold text-slate-200">Alerts & System Events</span>
                <button
                  onClick={() => {
                    setNotificationsOpen(false);
                    onNavigate('alerts');
                  }}
                  className="text-[11px] text-brand-400 hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="space-y-2 text-xs">
                {activeAlertsCount > 0 ? (
                  <div
                    onClick={() => {
                      setNotificationsOpen(false);
                      onNavigate('alerts');
                    }}
                    className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 cursor-pointer hover:bg-rose-950/60"
                  >
                    <div className="font-semibold text-rose-200 flex items-center justify-between">
                      <span>CRITICAL ALERT</span>
                      <span className="text-[10px] text-rose-400">Just now</span>
                    </div>
                    <p className="mt-1 text-slate-300 text-[11px]">
                      Smart Campus Dev sandbox returning HTTP 503.
                    </p>
                  </div>
                ) : (
                  <div className="py-4 text-center text-slate-500 text-xs">
                    No unresolved critical alerts.
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-slate-800 mt-2">
                <button
                  onClick={() => {
                    setNotificationsOpen(false);
                    onNavigate('email-notifications');
                  }}
                  className="w-full flex items-center justify-between text-[11px] text-brand-400 hover:text-brand-300 transition-colors py-0.5"
                >
                  <span className="flex items-center gap-1.5">
                    <Mail size={12} />
                    <span>Email & SMTP Gateway</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Configure →</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div className="relative">
          <button
            onClick={() => setUserDropdownOpen(prev => !prev)}
            className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 pr-2 sm:pr-3 py-1 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-lg text-xs transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            aria-label="User account menu"
          >
            <div className="w-6 h-6 rounded-full bg-brand-700 flex items-center justify-center text-white font-semibold text-xs">
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="text-left hidden md:block">
              <div className="font-medium text-slate-200 leading-tight">{user?.username || 'Admin'}</div>
              <div className="text-[10px] text-slate-400 font-mono leading-tight">{user?.role || 'SUPER_ADMIN'}</div>
            </div>
            <ChevronDown size={14} className="text-slate-500" />
          </button>

          {userDropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 z-30 animate-in fade-in duration-100"
              onMouseLeave={() => setUserDropdownOpen(false)}
            >
              <div className="px-3 py-2 border-b border-slate-800 mb-1">
                <div className="text-xs font-semibold text-slate-100">{user?.full_name || user?.username}</div>
                <div className="text-[11px] text-slate-400 truncate">{user?.email}</div>
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-brand-950 text-brand-300 border border-brand-800">
                  <Shield size={10} /> {user?.role}
                </div>
              </div>

              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  onNavigate('users');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-left"
              >
                <UserIcon size={14} className="text-slate-400" />
                <span>Account Profile</span>
              </button>

              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  onNavigate('roles');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-left"
              >
                <Shield size={14} className="text-slate-400" />
                <span>Permissions & RBAC</span>
              </button>

              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  onNavigate('email-notifications');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-left"
              >
                <Mail size={14} className="text-slate-400" />
                <span>Email & Alerts (SMTP)</span>
              </button>

              {onGoToPortal && (
                <button
                  onClick={() => {
                    setUserDropdownOpen(false);
                    onGoToPortal();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-brand-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-left font-semibold"
                >
                  <Layout size={14} className="text-brand-400" />
                  <span>Switch to Client Portal</span>
                </button>
              )}

              {onGoToLanding && (
                <button
                  onClick={() => {
                    setUserDropdownOpen(false);
                    onGoToLanding();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-emerald-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-left"
                >
                  <Globe size={14} className="text-emerald-400" />
                  <span>View Public Website</span>
                </button>
              )}

              <div className="my-1 border-t border-slate-800" />

              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 rounded-lg transition-colors text-left"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
