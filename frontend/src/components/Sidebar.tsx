import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  Layers,
  Server,
  Globe,
  Activity,
  Rocket,
  GitBranch,
  FileText,
  Archive,
  Key,
  Bell,
  Network,
  Users,
  ShieldCheck,
  KeyRound,
  Settings,
  ClipboardList,
  HeartPulse,
  Mail,
  X
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  isOpen = false,
  onClose,
}) => {
  const commandCenterNav = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'servers', label: 'Servers', icon: Server },
    { id: 'applications', label: 'Applications', icon: Layers },
    { id: 'domains', label: 'Domains & SSL', icon: Globe },
    { id: 'monitoring', label: 'Monitoring', icon: Activity },
    { id: 'deployments', label: 'Deployments', icon: Rocket },
    { id: 'git', label: 'Git Repositories', icon: GitBranch },
    { id: 'logs', label: 'Logs', icon: FileText },
    { id: 'backups', label: 'Backups', icon: Archive },
    { id: 'licenses', label: 'Licenses', icon: Key },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'email-notifications', label: 'Email & SMTP Alerts', icon: Mail },
    { id: 'topology', label: 'Infrastructure Map', icon: Network },
  ];

  const adminNav = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'roles', label: 'Roles & Permissions', icon: ShieldCheck },
    { id: 'api-keys', label: 'API Keys', icon: KeyRound },
    { id: 'system-health', label: 'System Health', icon: HeartPulse },
    { id: 'audit', label: 'Audit Log', icon: ClipboardList },
    { id: 'email-notifications', label: 'Email Notifications (SMTP)', icon: Mail },
    { id: 'settings', label: 'System Settings', icon: Settings },
  ];

  // Close on Escape when mobile drawer is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleNavClick = (viewId: string) => {
    onSelectView(viewId);
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-150"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none shadow-2xl md:shadow-none transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        aria-label="Sidebar Navigation"
      >
        {/* Brand Header */}
        <div className="h-14 px-4 sm:px-5 flex items-center justify-between border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold shadow-md shadow-brand-900/30">
              HQ
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-100 tracking-tight">COMMAND CENTER</div>
              <div className="text-[10px] text-slate-400 font-mono">INFRASTRUCTURE OS</div>
            </div>
          </div>

          {/* Close button on mobile */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg md:hidden transition-colors"
              aria-label="Close navigation sidebar"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Command Center Group */}
          <div>
            <div className="px-2.5 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Command Center
            </div>
            <nav className="space-y-0.5">
              {commandCenterNav.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors text-left focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon size={17} className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Administration Group */}
          <div>
            <div className="px-2.5 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Administration
            </div>
            <nav className="space-y-0.5">
              {adminNav.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-2 rounded-lg text-sm font-medium transition-colors text-left focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon size={17} className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Node Heartbeat */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-mono text-[11px]">MESH ONLINE</span>
          </div>
          <span className="mono text-[11px] text-slate-500">v1.0.0</span>
        </div>
      </aside>
    </>
  );
};
