import React, { useState, useEffect, useRef } from 'react';
import { Search, X, FileText, Users, Package, ArrowRight, Loader2, ExternalLink } from 'lucide-react';
import { ActiveTab } from './Navigation.tsx';

interface SearchResultItem {
  category: 'INVOICES' | 'PARTIES' | 'INVENTORY';
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  badge?: string;
  amount?: string;
  tab: ActiveTab;
  data?: any;
}

interface GlobalSearchBarProps {
  onNavigate: (tab: ActiveTab, entityId?: string) => void;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({ onNavigate }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<'ALL' | 'INVOICES' | 'PARTIES' | 'INVENTORY'>('ALL');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: Ctrl+K or / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search query
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const filteredResults = results.filter(item => {
    if (activeCategory === 'ALL') return true;
    return item.category === activeCategory;
  });

  const handleSelectResult = (item: SearchResultItem) => {
    onNavigate(item.tab, item.id);
    setIsOpen(false);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'INVOICES':
        return <FileText className="w-3.5 h-3.5 text-blue-500" />;
      case 'PARTIES':
        return <Users className="w-3.5 h-3.5 text-emerald-500" />;
      case 'INVENTORY':
        return <Package className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <Search className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md lg:max-w-lg z-30">
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          id="global-erp-search-input"
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Quick search invoices, parties, barcodes (Ctrl+K)..."
          className="w-full pl-9 pr-14 py-1.5 bg-white/95 text-slate-800 placeholder-slate-400 text-xs rounded-md border border-white/40 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:bg-white shadow-inner font-medium transition-all"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute right-3 p-0.5 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="absolute right-2.5 hidden sm:flex items-center gap-0.5 text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
            <span>⌘</span>
            <span>K</span>
          </div>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (query.trim().length > 0 || loading) && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden text-slate-800 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 p-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold">
            {(['ALL', 'INVOICES', 'PARTIES', 'INVENTORY'] as const).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-0.5 rounded uppercase tracking-wider transition-colors ${
                  activeCategory === cat
                    ? 'bg-[#0056b3] text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
            {loading && (
              <div className="ml-auto flex items-center gap-1 text-slate-400 text-[10px]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Searching...</span>
              </div>
            )}
          </div>

          {/* Results List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {filteredResults.length > 0 ? (
              filteredResults.map(item => (
                <button
                  key={`${item.category}-${item.id}`}
                  type="button"
                  onClick={() => handleSelectResult(item)}
                  className="w-full text-left p-2.5 hover:bg-blue-50/70 transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-start gap-2.5 min-w-0 pr-2">
                    <div className="p-1.5 rounded bg-slate-100 border border-slate-200 shrink-0 mt-0.5">
                      {getCategoryIcon(item.category)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 truncate">{item.title}</span>
                        {item.status && (
                          <span
                            className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded border ${
                              item.status === 'POSTED'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : item.status === 'DRAFT'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {item.status}
                          </span>
                        )}
                        {item.badge && (
                          <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 rounded">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{item.subtitle}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.amount && (
                      <div className="font-mono text-xs font-bold text-slate-800">{item.amount}</div>
                    )}
                    <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                      <span>View</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </button>
              ))
            ) : !loading ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                No matching invoices, parties, or items found for &ldquo;{query}&rdquo;
              </div>
            ) : null}
          </div>

          <div className="p-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
            <span>Press Enter to select, Esc to dismiss</span>
            <span className="font-mono">{filteredResults.length} matches found</span>
          </div>
        </div>
      )}
    </div>
  );
};
