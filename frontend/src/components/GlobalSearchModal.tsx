import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Server, Globe, Key, User, FileText, ArrowRight, CornerDownLeft } from 'lucide-react';
import { api } from '../api/client';
import { GlobalSearchResult } from '../types';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string, id?: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.globalSearch(query);
        setResults(res);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  const handleSelect = (item: GlobalSearchResult) => {
    onClose();
    if (item.type === 'application') {
      onNavigate('applications', item.id);
    } else if (item.type === 'server') {
      onNavigate('servers');
    } else if (item.type === 'domain') {
      onNavigate('domains');
    } else if (item.type === 'license') {
      onNavigate('licenses');
    } else if (item.type === 'user') {
      onNavigate('users');
    } else {
      onNavigate('overview');
    }
  };

  if (!isOpen) return null;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'application': return <Globe size={16} className="text-brand-400" />;
      case 'server': return <Server size={16} className="text-emerald-400" />;
      case 'domain': return <Globe size={16} className="text-blue-400" />;
      case 'license': return <Key size={16} className="text-purple-400" />;
      case 'user': return <User size={16} className="text-amber-400" />;
      default: return <FileText size={16} className="text-slate-400" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/50">
          <Search size={20} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search applications, servers, domains, IP addresses, licenses..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded mono">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-md transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60 p-2">
          {query.trim() === '' ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <p>Type to search across infrastructure, IPs, licenses, and repositories.</p>
              <div className="flex items-center justify-center gap-4 mt-3 text-xs text-slate-400">
                <span>Quick examples:</span>
                <button onClick={() => setQuery('109.199')} className="text-brand-400 hover:underline">109.199.111.51</button>
                <button onClick={() => setQuery('Smart Campus')} className="text-brand-400 hover:underline">Smart Campus</button>
                <button onClick={() => setQuery('LIC-2026')} className="text-brand-400 hover:underline">LIC-2026</button>
              </div>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No results found for "<span className="text-slate-300 font-medium">{query}</span>"
            </div>
          ) : (
            results.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/50 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800 shrink-0">
                      {getTypeIcon(item.type)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{item.title}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                          {item.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5 mono">{item.subtitle}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status && (
                      <span className="text-xs text-slate-400 font-medium">{item.status}</span>
                    )}
                    {isSelected && <CornerDownLeft size={16} className="text-brand-400" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-slate-800 rounded text-[10px] mono">↑</kbd>
              <kbd className="px-1 bg-slate-800 rounded text-[10px] mono">↓</kbd> to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-slate-800 rounded text-[10px] mono">↵</kbd> to select
            </span>
          </div>
          <span>Central Software Command Center</span>
        </div>
      </div>
    </div>
  );
};
