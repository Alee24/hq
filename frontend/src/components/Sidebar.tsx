import React from 'react';
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
  HeartPulse
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  collapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onSelectView }) => {
  const commandCenterNav = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'applications', label: 'Applications', icon: Layers },
    { id: 'servers', label: 'Servers', icon: Server },
    { id: 'domains', label: 'Domains & SSL', icon: Globe },
    { id: 'monitoring', label: 'Monitoring', icon: Activity },
    { id: 'deployments', label: 'Deployments', icon: Rocket },
    { id: 'git', label: 'Git Repositories', icon: GitBranch },
    { id: 'logs', label: 'Logs', icon: FileText },
    { id: 'backups', label: 'Backups', icon: Archive },
    { id: 'licenses', label: 'Licenses', icon: Key },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'topology', label: 'Infrastructure Map', icon: Network },
  ];

  const adminNav = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'roles', label: 'Roles & Permissions', icon: ShieldCheck },
    { id: 'api-keys', label: 'API Keys', icon: KeyRound },
    { id: 'system-health', label: 'System Health', icon: HeartPulse },
    { id: 'audit', label: 'Audit Log', icon: ClipboardList },
    { id: 'settings', label: 'System Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none z-20">
      {/* Brand Header */}
      <div className="h-14 px-5 flex items-center gap-3 border-b border-slate-800 bg-slate-950/40">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold shadow-md shadow-brand-900/30">
          HQ
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-100 tracking-tight">COMMAND CENTER</div>
          <div className="text-[10px] text-slate-400 font-mono">INFRASTRUCTURE OS</div>
        </div>
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
                  onClick={() => onSelectView(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                  onClick={() => onSelectView(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-mono text-[11px]">MESH ONLINE</span>
        </div>
        <span className="mono text-[11px] text-slate-500">v1.0.0</span>
      </div>
    </aside>
  );
};
