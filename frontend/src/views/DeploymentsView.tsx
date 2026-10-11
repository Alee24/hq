import React, { useEffect, useState } from 'react';
import {
  Rocket,
  Plus,
  RefreshCw,
  GitBranch,
  RotateCcw,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Filter,
  Search
} from 'lucide-react';
import { api } from '../api/client';
import { DeploymentItem, Application } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useWebSocket } from '../context/WebSocketContext';
import { Button, InputField, SelectField, ModalShell } from '../components/common';

export const DeploymentsView: React.FC = () => {
  const [deployments, setDeployments] = useState<DeploymentItem[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  // Trigger Deployment Modal
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [env, setEnv] = useState('production');
  const [branch, setBranch] = useState('main');
  const [commitHash, setCommitHash] = useState('');
  const [runTests, setRunTests] = useState(true);
  const [createBackup, setCreateBackup] = useState(true);
  const [deploying, setDeploying] = useState(false);

  // Live progress logs
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [currentStepTitle, setCurrentStepTitle] = useState<string | null>(null);

  // Rollback Modal
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [selectedForRollback, setSelectedForRollback] = useState<DeploymentItem | null>(null);

  // Filter state
  const [filterAppId, setFilterAppId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Log View Modal
  const [logModalContent, setLogModalContent] = useState<string | null>(null);

  const { subscribe } = useWebSocket();

  const loadData = async () => {
    try {
      const [depList, appList] = await Promise.all([
        api.listDeployments(),
        api.listApplications(),
      ]);
      setDeployments(depList);
      setApps(appList);
      if (appList.length > 0 && !selectedAppId) {
        setSelectedAppId(appList[0].id);
        setCommitHash(appList[0].current_commit || 'HEAD');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to live deployment progress events
    const unsubProgress = subscribe('deployment_progress', (data) => {
      setCurrentStepTitle(data.step);
      setLiveLogs(prev => [...prev, data.line]);
    });

    const unsubComplete = subscribe('deployment_completed', () => {
      setDeploying(false);
      loadData();
    });

    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, []);

  const handleLaunchDeployment = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeploying(true);
    setLiveLogs([]);
    setCurrentStepTitle('Initiating 13-step pipeline...');
    try {
      await api.triggerDeployment({
        application_id: selectedAppId,
        environment: env,
        branch,
        commit_hash: commitHash,
        run_tests: runTests,
        create_backup: createBackup,
      });
      setTriggerModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Deployment failed');
      setDeploying(false);
    }
  };

  const handleRollbackConfirm = async () => {
    if (!selectedForRollback) return;
    setRollbackModalOpen(false);
    try {
      await api.triggerRollback({
        deployment_id: selectedForRollback.id,
        reason: 'Operator requested emergency rollback',
        confirmation: 'ROLLBACK',
      });
      alert('Rollback completed successfully.');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Rollback failed');
    }
  };

  const filteredDeployments = deployments.filter((d) => {
    const matchesApp = filterAppId === 'ALL' || d.application_id === filterAppId;
    const matchesSearch =
      !searchQuery ||
      d.commit_hash.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.commit_message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.application_name && d.application_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesApp && matchesSearch;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Automated Deployment Pipelines
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Controlled 13-step zero-downtime container swaps, automated backups, health validation, and instant rollbacks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={() => setTriggerModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>Launch Deployment</span>
          </button>
        </div>
      </div>

      {/* Application Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
            <Filter size={13} className="text-brand-400 shrink-0" />
            <span className="text-slate-500 font-medium">Filter by Application:</span>
            <select
              value={filterAppId}
              onChange={(e) => setFilterAppId(e.target.value)}
              className="bg-transparent border-none text-white focus:outline-none text-xs cursor-pointer font-semibold"
            >
              <option value="ALL" className="bg-slate-900 text-white">All Applications ({deployments.length})</option>
              {apps.map(a => {
                const count = deployments.filter(d => d.application_id === a.id).length;
                return (
                  <option key={a.id} value={a.id} className="bg-slate-900 text-white">
                    {a.name} ({count} releases)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by commit message or hash..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-3">
          <span>Showing <strong className="text-white">{filteredDeployments.length}</strong> deployments</span>
        </div>
      </div>

      {/* Live Pipeline Active Banner */}
      {deploying && (
        <div className="p-5 rounded-xl bg-slate-900 border border-brand-500/80 shadow-lg space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-brand-500 animate-ping" />
              <span className="text-xs font-semibold text-white">
                Active Release Pipeline In Progress
              </span>
            </div>
            <span className="text-xs font-mono text-brand-400">{currentStepTitle}</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto space-y-1">
            {liveLogs.map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Deployments Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-4">Application</th>
                <th className="py-3 px-4">Environment</th>
                <th className="py-3 px-4">Commit Hash</th>
                <th className="py-3 px-4">Commit Message</th>
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Loading deployment history...
                  </td>
                </tr>
              ) : filteredDeployments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <div className="space-y-3 max-w-sm mx-auto">
                      <div className="p-3 bg-slate-950 border border-slate-800 w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-slate-400">
                        <Rocket size={24} />
                      </div>
                      <div className="font-semibold text-white text-sm">No Matching Deployments</div>
                      <p className="text-xs text-slate-500">
                        No deployment pipelines found matching current application or search filters.
                      </p>
                      <button
                        onClick={() => setTriggerModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Plus size={14} />
                        <span>Launch First Deployment</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDeployments.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white">
                      {d.application_name || 'Application'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-slate-950 border border-slate-800">
                        {d.environment}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-brand-400">
                      {d.commit_hash}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-200">
                      {d.commit_message}
                    </td>
                    <td className="py-3 px-4 text-slate-400">{d.deployed_by}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={d.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 mono text-slate-400">{d.duration_seconds}s</td>
                    <td className="py-3 px-4 mono text-slate-400">
                      {new Date(d.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          onClick={() => setLogModalContent(d.logs || 'No logs available.')}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium"
                        >
                          Logs
                        </button>
                        <button
                          onClick={() => {
                            setSelectedForRollback(d);
                            setRollbackModalOpen(true);
                          }}
                          className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded text-[11px] font-medium"
                        >
                          Rollback
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trigger New Deployment Modal */}
      <ModalShell
        isOpen={triggerModalOpen}
        onClose={() => setTriggerModalOpen(false)}
        title="Launch Deployment Pipeline"
        description="Trigger zero-downtime 13-step pipeline with automated health verification."
        icon={Rocket}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTriggerModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="deploy-form"
              isLoading={deploying}
            >
              Execute 13-Step Pipeline
            </Button>
          </>
        }
      >
        <form id="deploy-form" onSubmit={handleLaunchDeployment} className="space-y-3.5 text-xs">
          <SelectField
            label="Target Application"
            isRequired
            value={selectedAppId}
            onChange={(e) => setSelectedAppId(e.target.value)}
          >
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.environment})
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Environment"
            isRequired
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            options={[
              { value: 'production', label: 'Production' },
              { value: 'staging', label: 'Staging' },
              { value: 'development', label: 'Development' },
            ]}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InputField
              label="Git Branch / Tag"
              isRequired
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
            <InputField
              label="Commit Hash"
              isRequired
              value={commitHash}
              onChange={(e) => setCommitHash(e.target.value)}
              className="mono"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800 text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={runTests}
                onChange={(e) => setRunTests(e.target.checked)}
                className="rounded bg-slate-950 border-slate-800 text-brand-600 focus:ring-brand-500"
              />
              <span>Run automated unit & integration tests</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createBackup}
                onChange={(e) => setCreateBackup(e.target.checked)}
                className="rounded bg-slate-950 border-slate-800 text-brand-600 focus:ring-brand-500"
              />
              <span>Create pre-deployment safety snapshot backup</span>
            </label>
          </div>
        </form>
      </ModalShell>

      {/* Rollback Confirmation Modal */}
      <ConfirmationModal
        isOpen={rollbackModalOpen}
        title="Emergency Deployment Rollback"
        message={`You are about to roll back deployment ${selectedForRollback?.commit_hash} to its predecessor. This will restore the pre-deployment container image and backup snapshot.`}
        confirmKeyword="ROLLBACK"
        confirmButtonText="Execute Rollback"
        isDestructive={true}
        onConfirm={handleRollbackConfirm}
        onClose={() => setRollbackModalOpen(false)}
      />

      {/* Log Modal */}
      {logModalContent && (
        <ModalShell
          isOpen={Boolean(logModalContent)}
          onClose={() => setLogModalContent(null)}
          title="Deployment Pipeline Audit Log"
          icon={FileText}
          size="lg"
          footer={
            <Button variant="secondary" onClick={() => setLogModalContent(null)}>
              Close
            </Button>
          }
        >
          <pre className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
            {logModalContent}
          </pre>
        </ModalShell>
      )}
    </div>
  );
};
