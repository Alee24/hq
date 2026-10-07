import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginView } from './views/LoginView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { SetupWizardModal } from './components/SetupWizardModal';

// Views
import { DashboardView } from './views/DashboardView';
import { ApplicationsView } from './views/ApplicationsView';
import { ApplicationDetailView } from './views/ApplicationDetailView';
import { ServersView } from './views/ServersView';
import { ServerDetailView } from './views/ServerDetailView';
import { DomainsView } from './views/DomainsView';
import { MonitoringView } from './views/MonitoringView';
import { DeploymentsView } from './views/DeploymentsView';
import { GitView } from './views/GitView';
import { LogsView } from './views/LogsView';
import { LicensesView } from './views/LicensesView';
import { TopologyView } from './views/TopologyView';
import { AlertsView } from './views/AlertsView';
import { BackupsView } from './views/BackupsView';
import { UsersView } from './views/UsersView';
import { RolesView } from './views/RolesView';
import { ApiKeysView } from './views/ApiKeysView';
import { AuditLogView } from './views/AuditLogView';
import { SystemHealthView } from './views/SystemHealthView';
import { SystemSettingsView } from './views/SystemSettingsView';

export const MainAppShell: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState('overview');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [wizardModalOpen, setWizardModalOpen] = useState(false);

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 font-mono text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span>INITIALIZING COMMAND CENTER CORE...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const navigateTo = (view: string, id?: string) => {
    if (view === 'applications' && id) {
      setSelectedAppId(id);
      setCurrentView('application-detail');
    } else if (view === 'servers' && id) {
      setSelectedServerId(id);
      setCurrentView('server-detail');
    } else {
      setSelectedAppId(null);
      setSelectedServerId(null);
      setCurrentView(view);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <Sidebar
        currentView={
          currentView === 'application-detail'
            ? 'applications'
            : currentView === 'server-detail'
            ? 'servers'
            : currentView
        }
        onSelectView={(v) => navigateTo(v)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TopBar */}
        <TopBar
          onOpenSearch={() => setSearchModalOpen(true)}
          onOpenWizard={() => setWizardModalOpen(true)}
          onNavigate={(v) => navigateTo(v)}
          activeAlertsCount={1}
        />

        {/* Viewport Canvas */}
        <main className="flex-1 overflow-y-auto bg-slate-950">
          {currentView === 'overview' && (
            <DashboardView onNavigate={(v, id) => navigateTo(v, id)} />
          )}

          {currentView === 'applications' && (
            <ApplicationsView onSelectApp={(id) => navigateTo('applications', id)} />
          )}

          {currentView === 'application-detail' && selectedAppId && (
            <ApplicationDetailView
              appId={selectedAppId}
              onBack={() => navigateTo('applications')}
              onNavigateToDeployments={() => navigateTo('deployments')}
            />
          )}

          {currentView === 'servers' && (
            <ServersView onSelectServer={(id) => navigateTo('servers', id)} />
          )}

          {currentView === 'server-detail' && selectedServerId && (
            <ServerDetailView
              serverId={selectedServerId}
              onBack={() => navigateTo('servers')}
              onNavigate={(v, id) => navigateTo(v, id)}
            />
          )}

          {currentView === 'domains' && <DomainsView />}

          {currentView === 'monitoring' && <MonitoringView />}

          {currentView === 'deployments' && <DeploymentsView />}

          {currentView === 'git' && <GitView />}

          {currentView === 'logs' && <LogsView />}

          {currentView === 'backups' && <BackupsView />}

          {currentView === 'licenses' && <LicensesView />}

          {currentView === 'alerts' && <AlertsView />}

          {currentView === 'topology' && <TopologyView />}

          {currentView === 'users' && <UsersView />}

          {currentView === 'roles' && <RolesView />}

          {currentView === 'api-keys' && <ApiKeysView />}

          {currentView === 'audit' && <AuditLogView />}

          {currentView === 'system-health' && <SystemHealthView />}

          {currentView === 'settings' && <SystemSettingsView />}
        </main>
      </div>

      {/* Global Modals */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onNavigate={(v, id) => navigateTo(v, id)}
      />

      <SetupWizardModal
        isOpen={wizardModalOpen}
        onClose={() => setWizardModalOpen(false)}
      />
    </div>
  );
};
