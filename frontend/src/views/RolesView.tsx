import React from 'react';
import { ShieldCheck, Check, X, Shield, Lock } from 'lucide-react';

export const RolesView: React.FC = () => {
  const roles = [
    { id: 'SUPER_ADMIN', name: 'Super Admin', desc: 'Full root administrative access across all infrastructure, settings, and users.' },
    { id: 'INFRASTRUCTURE_ADMIN', name: 'Infrastructure Admin', desc: 'Can manage VPS hosts, initiate reboot operations, and control OS services.' },
    { id: 'DEPLOYMENT_ADMIN', name: 'Deployment Admin', desc: 'Can trigger 13-step release pipelines, pull Git branches, and execute rollbacks.' },
    { id: 'APPLICATION_ADMIN', name: 'Application Admin', desc: 'Can restart applications, configure routing, and toggle maintenance mode.' },
    { id: 'LICENSE_ADMIN', name: 'License Admin', desc: 'Can generate, sign, renew, and revoke cryptographic Ed25519 licenses.' },
    { id: 'MONITORING_ADMIN', name: 'Monitoring Admin', desc: 'Can configure synthetic monitoring probes, intervals, and alert threshold rules.' },
    { id: 'READ_ONLY', name: 'Read Only Auditor', desc: 'Can inspect live dashboards, metrics, logs, and telemetry without mutation privileges.' },
  ];

  const permissions = [
    { name: 'View Telemetry & Metrics', allowed: ['SUPER_ADMIN', 'INFRASTRUCTURE_ADMIN', 'DEPLOYMENT_ADMIN', 'APPLICATION_ADMIN', 'LICENSE_ADMIN', 'MONITORING_ADMIN', 'READ_ONLY'] },
    { name: 'View Centralized Logs', allowed: ['SUPER_ADMIN', 'INFRASTRUCTURE_ADMIN', 'DEPLOYMENT_ADMIN', 'APPLICATION_ADMIN', 'LICENSE_ADMIN', 'MONITORING_ADMIN', 'READ_ONLY'] },
    { name: 'Restart Application Services', allowed: ['SUPER_ADMIN', 'APPLICATION_ADMIN'] },
    { name: 'Toggle Maintenance Mode', allowed: ['SUPER_ADMIN', 'APPLICATION_ADMIN'] },
    { name: 'Deploy Git Releases', allowed: ['SUPER_ADMIN', 'DEPLOYMENT_ADMIN'] },
    { name: 'Emergency Version Rollback', allowed: ['SUPER_ADMIN', 'DEPLOYMENT_ADMIN'] },
    { name: 'Server Safe Commands (Reboot/Service)', allowed: ['SUPER_ADMIN', 'INFRASTRUCTURE_ADMIN'] },
    { name: 'Configure Threshold Rules & Probes', allowed: ['SUPER_ADMIN', 'MONITORING_ADMIN'] },
    { name: 'Sign & Issue Digital Licenses', allowed: ['SUPER_ADMIN', 'LICENSE_ADMIN'] },
    { name: 'Revoke / Renew Licenses', allowed: ['SUPER_ADMIN', 'LICENSE_ADMIN'] },
    { name: 'Manage Users & RBAC Matrix', allowed: ['SUPER_ADMIN'] },
    { name: 'Issue & Revoke API Tokens', allowed: ['SUPER_ADMIN'] },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="pb-2 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          Role-Based Access Control (RBAC) Specification
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Least-privilege operational matrix enforced across all REST API endpoints and UI operations.
        </p>
      </div>

      {/* Roles Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((r) => (
          <div key={r.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-brand-400">
              <ShieldCheck size={18} />
              <h3 className="font-semibold text-sm text-white">{r.name}</h3>
            </div>
            <div className="text-[11px] font-mono text-slate-400">{r.id}</div>
            <p className="text-xs text-slate-400 leading-relaxed">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Permission Matrix Table (Section 20) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 text-xs font-semibold uppercase text-slate-400 tracking-wider">
          Enterprise Operational Capabilities Matrix
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[11px]">
                <th className="py-3 px-4 font-semibold">Permission Capability</th>
                <th className="py-3 px-2 text-center font-mono">SUPER</th>
                <th className="py-3 px-2 text-center font-mono">INFRA</th>
                <th className="py-3 px-2 text-center font-mono">DEPLOY</th>
                <th className="py-3 px-2 text-center font-mono">APP</th>
                <th className="py-3 px-2 text-center font-mono">LICENSE</th>
                <th className="py-3 px-2 text-center font-mono">MONITOR</th>
                <th className="py-3 px-2 text-center font-mono">READ_ONLY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {permissions.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-medium text-white">{p.name}</td>
                  <td className="py-2.5 px-2 text-center">
                    {p.allowed.includes('SUPER_ADMIN') ? <Check size={14} className="text-emerald-400 mx-auto" /> : <X size={14} className="text-slate-600 mx-auto" />}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {p.allowed.includes('INFRASTRUCTURE_ADMIN') ? <Check size={14} className="text-emerald-400 mx-auto" /> : <X size={14} className="text-slate-600 mx-auto" />}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {p.allowed.includes('DEPLOYMENT_ADMIN') ? <Check size={14} className="text-emerald-400 mx-auto" /> : <X size={14} className="text-slate-600 mx-auto" />}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {p.allowed.includes('APPLICATION_ADMIN') ? <Check size={14} className="text-emerald-400 mx-auto" /> : <X size={14} className="text-slate-600 mx-auto" />}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {p.allowed.includes('LICENSE_ADMIN') ? <Check size={14} className="text-emerald-400 mx-auto" /> : <X size={14} className="text-slate-600 mx-auto" />}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {p.allowed.includes('MONITORING_ADMIN') ? <Check size={14} className="text-emerald-400 mx-auto" /> : <X size={14} className="text-slate-600 mx-auto" />}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {p.allowed.includes('READ_ONLY') ? <Check size={14} className="text-emerald-400 mx-auto" /> : <X size={14} className="text-slate-600 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
