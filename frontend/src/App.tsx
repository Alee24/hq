import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginView } from './views/LoginView';
import { LandingPageView } from './views/saas/LandingPageView';
import { ClientPortalView } from './views/saas/ClientPortalView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { SetupWizardModal } from './components/SetupWizardModal';

// Command Center Views
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
import { EmailNotificationsView } from './views/EmailNotificationsView';

// ==========================================
// Central Admin Command Center Shell
// ==========================================
interface AdminShellProps {
  onGoToLanding: () => void;
  onGoToPortal: () => void;
  user: any;
  logout: () => void;
}

const AdminCommandCenterShell: React.FC<AdminShellProps> = ({
  onGoToLanding,
  onGoToPortal,
  user,
  logout
}) => {
  const [currentView, setCurrentView] = useState('overview');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [wizardModalOpen, setWizardModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const navigateTo = (view: string, id?: string) => {
    setMobileMenuOpen(false);
    if (view === 'applications' && id) {
      setSelectedAppId(id);
      setSelectedServerId(null);
      setSelectedDomainId(null);
      setCurrentView('application-detail');
    } else if (view === 'servers' && id) {
      setSelectedServerId(id);
      setSelectedAppId(null);
      setSelectedDomainId(null);
      setCurrentView('server-detail');
    } else if (view === 'domains' && id) {
      setSelectedDomainId(id);
      setSelectedAppId(null);
      setSelectedServerId(null);
      setCurrentView('domains');
    } else {
      setSelectedAppId(null);
      setSelectedServerId(null);
      setSelectedDomainId(null);
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
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TopBar */}
        <TopBar
          onOpenSearch={() => setSearchModalOpen(true)}
          onOpenWizard={() => setWizardModalOpen(true)}
          onNavigate={(v) => navigateTo(v)}
          onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)}
          activeAlertsCount={1}
          onGoToPortal={onGoToPortal}
          onGoToLanding={onGoToLanding}
        />

        {/* Viewport Canvas */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-950 w-full min-w-0 max-w-full">
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

          {currentView === 'domains' && (
            <DomainsView
              initialDomainId={selectedDomainId || undefined}
              onNavigate={(v, id) => navigateTo(v, id)}
            />
          )}

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

          {currentView === 'email-notifications' && <EmailNotificationsView />}
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

// ==========================================
// Root Application Shell (Multi-Mode SaaS)
// ==========================================
export const MainAppShell: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const [viewMode, setViewMode] = useState<'landing' | 'portal' | 'admin' | 'auth'>('landing');
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup'>('signin');

  // Intelligent URL / Auth State Synchronization
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'admin' && user && user.role !== 'CUSTOMER') {
      setViewMode('admin');
    } else if (hash === 'portal' && user) {
      setViewMode('portal');
    } else if (hash === 'website') {
      setViewMode('landing');
    } else if (hash === 'signin') {
      setAuthInitialMode('signin');
      setViewMode('auth');
    } else if (hash === 'signup') {
      setAuthInitialMode('signup');
      setViewMode('auth');
    } else if (user) {
      // Role-aware defaults
      if (user.role === 'CUSTOMER') {
        setViewMode('portal');
      } else {
        setViewMode('admin');
      }
    } else {
      setViewMode('landing');
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 font-mono text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span>INITIALIZING CLOUDNODE CORE...</span>
        </div>
      </div>
    );
  }

  // 1. Auth View (Sign In or Sign Up)
  if (viewMode === 'auth') {
    return (
      <LoginView
        initialMode={authInitialMode}
        onBackToLanding={() => setViewMode('landing')}
      />
    );
  }

  // 2. Client SaaS Portal
  if (viewMode === 'portal') {
    if (!user) {
      return (
        <LoginView
          initialMode="signin"
          onBackToLanding={() => setViewMode('landing')}
        />
      );
    }
    return (
      <ClientPortalView
        onGoToLanding={() => setViewMode('landing')}
        onGoToAdmin={() => setViewMode('admin')}
        onLogout={() => {
          logout();
          setViewMode('landing');
        }}
        isAdmin={user.role === 'SUPER_ADMIN' || user.role === 'INFRASTRUCTURE_ADMIN'}
        currentUser={user}
      />
    );
  }

  // 3. Central Infrastructure Admin Command Center
  if (viewMode === 'admin') {
    if (!user) {
      return (
        <LoginView
          initialMode="signin"
          onBackToLanding={() => setViewMode('landing')}
        />
      );
    }
    return (
      <AdminCommandCenterShell
        onGoToLanding={() => setViewMode('landing')}
        onGoToPortal={() => setViewMode('portal')}
        user={user}
        logout={() => {
          logout();
          setViewMode('landing');
        }}
      />
    );
  }

  // 4. Public SaaS Website & Cloud/Domain Registration Portal (Default)
  return (
    <LandingPageView
      onGoToPortal={() => {
        if (user) {
          setViewMode('portal');
        } else {
          setAuthInitialMode('signin');
          setViewMode('auth');
        }
      }}
      onGoToAdmin={() => {
        if (user) {
          setViewMode('admin');
        } else {
          setAuthInitialMode('signin');
          setViewMode('auth');
        }
      }}
      onLoginClick={() => {
        setAuthInitialMode('signin');
        setViewMode('auth');
      }}
      isAuthenticated={Boolean(user)}
      isAdmin={user ? user.role === 'SUPER_ADMIN' || user.role === 'INFRASTRUCTURE_ADMIN' : false}
      currentUser={user}
    />
  );
};
