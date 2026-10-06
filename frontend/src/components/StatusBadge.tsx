import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock, ShieldCheck, ShieldAlert, Activity } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const norm = status ? status.toUpperCase() : 'UNKNOWN';

  let bg = 'bg-slate-800 text-slate-300 border-slate-700';
  let Icon = Activity;

  switch (norm) {
    case 'ONLINE':
    case 'HEALTHY':
    case 'SUCCESS':
    case 'ACTIVE':
    case 'RESOLVED':
    case 'VALID':
    case 'COMPLETED':
      bg = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
      Icon = CheckCircle2;
      break;

    case 'DEGRADED':
    case 'WARNING':
    case 'EXPIRING':
    case 'EXPIRING_SOON':
    case 'UPDATE_AVAILABLE':
      bg = 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      Icon = AlertTriangle;
      break;

    case 'OFFLINE':
    case 'FAILED':
    case 'EXPIRED':
    case 'CRITICAL':
    case 'REVOKED':
    case 'UNAVAILABLE':
    case 'INVALID':
      bg = 'bg-rose-950/80 text-rose-300 border-rose-800/80';
      Icon = XCircle;
      break;

    case 'MAINTENANCE':
    case 'SUSPENDED':
    case 'INVESTIGATING':
    case 'PENDING':
    case 'BUILDING':
    case 'DEPLOYING':
    case 'ROLLED_BACK':
      bg = 'bg-blue-950/80 text-blue-300 border-blue-800/80';
      Icon = Clock;
      break;

    default:
      bg = 'bg-slate-800 text-slate-300 border-slate-700';
      Icon = Activity;
      break;
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${bg} ${padding} transition-colors tracking-wide`}
      role="status"
    >
      <Icon size={iconSize} className="shrink-0" aria-hidden="true" />
      <span>{norm.replace(/_/g, ' ')}</span>
    </span>
  );
};
