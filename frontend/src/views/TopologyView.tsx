import React, { useEffect, useState } from 'react';
import { Network, Server, Globe, Shield, RefreshCw, ArrowDown, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export const TopologyView: React.FC = () => {
  const [topology, setTopology] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  const loadTopology = async () => {
    try {
      const res = await api.getTopology();
      setTopology(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopology();
  }, []);

  if (loading && !topology) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        Rendering infrastructure topology mesh...
      </div>
    );
  }

  const nodes = topology?.nodes || [];
  const serverNodes = nodes.filter((n: any) => n.type === 'server');
  const appNodes = nodes.filter((n: any) => n.type === 'application');

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Infrastructure Network Topology Map
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Hierarchical mapping of traffic ingress: Public Internet &rarr; Enterprise WAF &rarr; VPS Host Nodes &rarr; Containerized Applications.
          </p>
        </div>

        <button
          onClick={() => loadTopology()}
          className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Interactive Topology Graph */}
      <div className="p-8 rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl space-y-8">
        {/* Layer 1: Public Internet */}
        <div className="flex justify-center">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex items-center gap-3 w-80 text-center justify-center">
            <Globe size={24} className="text-blue-400" />
            <div className="text-left">
              <div className="text-xs font-bold text-white">Public Internet Ingress</div>
              <div className="text-[10px] text-slate-400 mono">BGP Anycast / IPv4 & IPv6 Gateway</div>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <ArrowDown size={20} className="text-slate-600 animate-bounce" />
        </div>

        {/* Layer 2: Firewall / WAF */}
        <div className="flex justify-center">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex items-center gap-3 w-80 justify-center">
            <Shield size={24} className="text-brand-400" />
            <div className="text-left">
              <div className="text-xs font-bold text-white">Perimeter Firewall & WAF</div>
              <div className="text-[10px] text-emerald-400 mono">DDoS Mitigation & TLS Offload Active</div>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <ArrowDown size={20} className="text-slate-600" />
        </div>

        {/* Layer 3: VPS Host Servers */}
        <div>
          <div className="text-center text-[11px] font-semibold uppercase text-slate-500 tracking-wider mb-4">
            Physical & VPS Host Cluster (Click a host to filter applications)
          </div>
          {serverNodes.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
              No VPS host nodes connected. Register a server to establish cluster ingress topology.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {serverNodes.map((srv: any) => {
                const isSelected = selectedServerId === srv.id;
                return (
                  <div
                    key={srv.id}
                    onClick={() => setSelectedServerId(isSelected ? null : srv.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all space-y-3 ${
                      isSelected
                        ? 'bg-slate-900 border-brand-500 ring-2 ring-brand-500/30'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server size={18} className="text-emerald-400" />
                        <span className="font-semibold text-xs text-white">{srv.label}</span>
                      </div>
                      <StatusBadge status={srv.status} size="sm" />
                    </div>
                    <div className="space-y-1 text-[11px] text-slate-400 mono">
                      <div>Public IP: <span className="text-slate-200">{srv.metadata.ip}</span></div>
                      <div>Hardware: <span className="text-slate-300">{srv.metadata.cores} Cores / {srv.metadata.ram_mb} MB</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <ArrowDown size={20} className="text-slate-600" />
        </div>

        {/* Layer 4: Hosted Applications */}
        <div>
          <div className="text-center text-[11px] font-semibold uppercase text-slate-500 tracking-wider mb-4">
            Containerized Microservices & Web Applications
          </div>
          {appNodes.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
              No applications registered. Register an application to map container endpoints.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {appNodes
                .filter((app: any) => {
                  if (!selectedServerId) return true;
                  // Match edges
                  return topology.edges.some(
                    (e: any) => e.from === selectedServerId && e.to === app.id
                  );
                })
                .map((app: any) => (
                  <div
                    key={app.id}
                    className="p-3.5 rounded-lg bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white truncate max-w-[140px]">
                        {app.label}
                      </span>
                      <StatusBadge status={app.status} size="sm" />
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {app.metadata.domain}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                      <span className="uppercase">{app.metadata.manager}</span>
                      <span className="mono text-brand-400">{app.metadata.version}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
