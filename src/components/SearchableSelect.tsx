import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X, Check } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SearchableGroup {
  label: string;
  icon?: React.ReactNode;
  options: SearchableOption[];
}

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: SearchableOption[];
  groups?: SearchableGroup[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  dropdownClassName?: string;
  disabled?: boolean;
  allowClear?: boolean;
  maxHeight?: string;
  id?: string;
  name?: string;
  required?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  groups,
  placeholder = 'Select option...',
  searchPlaceholder = 'Type to search...',
  className = '',
  dropdownClassName = '',
  disabled = false,
  allowClear = false,
  maxHeight = 'max-h-64',
  id,
  name
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownCoords, setDropdownCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUpwards: boolean;
    bottom?: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Flatten options for easy label lookup and keyboard navigation
  const allFlatOptions = useMemo(() => {
    const flat: SearchableOption[] = [];
    if (options && options.length > 0) {
      flat.push(...options);
    }
    if (groups && groups.length > 0) {
      for (const grp of groups) {
        flat.push(...grp.options);
      }
    }
    return flat;
  }, [options, groups]);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return allFlatOptions.find(opt => opt.value === value) || null;
  }, [allFlatOptions, value]);

  // Filtered groups and options based on search query
  const { filteredGroups, filteredOptions, totalFilteredCount } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matchesOption = (opt: SearchableOption) => {
      if (!q) return true;
      const label = (opt.label || '').toLowerCase();
      const sublabel = (opt.sublabel || '').toLowerCase();
      const badge = (opt.badge || '').toLowerCase();
      const val = (opt.value || '').toLowerCase();
      return label.includes(q) || sublabel.includes(q) || badge.includes(q) || val.includes(q);
    };

    let fGroups: SearchableGroup[] = [];
    let fOptions: SearchableOption[] = [];
    let count = 0;

    if (groups && groups.length > 0) {
      fGroups = groups
        .map(grp => {
          const groupTitleMatches = (grp.label || '').toLowerCase().includes(q);
          const matchedOpts = grp.options.filter(opt => groupTitleMatches || matchesOption(opt));
          return {
            ...grp,
            options: matchedOpts
          };
        })
        .filter(grp => grp.options.length > 0);

      count = fGroups.reduce((acc, g) => acc + g.options.length, 0);
    }

    if (options && options.length > 0) {
      fOptions = options.filter(matchesOption);
      count += fOptions.length;
    }

    return {
      filteredGroups: fGroups,
      filteredOptions: fOptions,
      totalFilteredCount: count
    };
  }, [searchQuery, options, groups]);

  // List of flat filtered options for keyboard navigation
  const flatFilteredOptions = useMemo(() => {
    const list: SearchableOption[] = [];
    if (filteredOptions.length > 0) {
      list.push(...filteredOptions);
    }
    for (const g of filteredGroups) {
      list.push(...g.options);
    }
    return list;
  }, [filteredOptions, filteredGroups]);

  // Auto focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedIndex(-1);
      // Small timeout to allow render
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto calculate dropdown position & keep in sync on scroll/resize
  useEffect(() => {
    if (!isOpen) {
      setDropdownCoords(null);
      return;
    }

    const updateCoords = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpwards = spaceBelow < 280 && spaceAbove > spaceBelow;
      const width = Math.max(rect.width, 320);

      let left = rect.left;
      if (left + width > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - width - 12);
      }

      setDropdownCoords({
        top: openUpwards ? rect.top - 4 : rect.bottom + 4,
        left,
        width,
        openUpwards,
        bottom: openUpwards ? window.innerHeight - rect.top + 4 : undefined
      });
    };

    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen]);

  // Close on outside click (checks both trigger button and portal dropdown)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev < flatFilteredOptions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : flatFilteredOptions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < flatFilteredOptions.length) {
          const opt = flatFilteredOptions[highlightedIndex];
          if (!opt.disabled) {
            onChange(opt.value);
            setIsOpen(false);
          }
        }
        break;
      default:
        break;
    }
  };

  const handleSelect = (val: string, optDisabled?: boolean) => {
    if (optDisabled) return;
    onChange(val);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left font-sans ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      onKeyDown={handleKeyDown}
      id={id}
    >
      {/* Hidden input for HTML forms if needed */}
      {name && <input type="hidden" name={name} value={value} />}

      {/* Main Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full flex items-center justify-between text-left text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-xs cursor-pointer hover:border-amber-400 ${
          isOpen ? 'ring-2 ring-amber-500 border-amber-500 shadow-md' : ''
        } ${className}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 truncate pr-2">
          {selectedOption ? (
            <>
              {selectedOption.icon && <span className="shrink-0 text-slate-500">{selectedOption.icon}</span>}
              {selectedOption.badge && (
                <span
                  className={`shrink-0 px-1.5 py-0.2 rounded text-[9px] font-bold font-mono uppercase ${
                    selectedOption.badgeColor || 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  {selectedOption.badge}
                </span>
              )}
              <span className="truncate font-medium text-slate-900">{selectedOption.label}</span>
              {selectedOption.sublabel && (
                <span className="text-[10px] text-slate-400 truncate hidden sm:inline">
                  ({selectedOption.sublabel})
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {allowClear && value && !disabled && (
            <span
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-600' : ''}`}
          />
        </div>
      </button>

      {/* Floating Dropdown Panel rendered via Portal into document.body */}
      {isOpen && dropdownCoords && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownCoords.openUpwards ? 'auto' : `${dropdownCoords.top}px`,
            bottom: dropdownCoords.openUpwards ? `${dropdownCoords.bottom}px` : 'auto',
            left: `${dropdownCoords.left}px`,
            width: `${dropdownCoords.width}px`,
            zIndex: 9999999
          }}
          className={`bg-white rounded-xl shadow-2xl border border-amber-300 ring-2 ring-amber-500/20 overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${dropdownClassName}`}
          role="listbox"
          onKeyDown={handleKeyDown}
        >
          {/* Integrated Search Box */}
          <div className="p-2 border-b border-amber-100 bg-amber-50/40 sticky top-0 z-10">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-amber-700 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder={searchPlaceholder}
                className="w-full text-xs pl-8 pr-7 py-1.5 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-sans text-slate-900 placeholder:text-slate-400 shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Filter Counts */}
            <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-slate-500">
              <span>Type code, name, or category</span>
              <span className="font-mono font-bold text-amber-900">
                {totalFilteredCount} matching option{totalFilteredCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* Scrollable Items Container */}
          <div ref={listRef} className={`overflow-y-auto p-1 divide-y divide-slate-100 ${maxHeight}`}>
            {totalFilteredCount === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                <Search className="w-5 h-5 mx-auto text-amber-500/50 mb-1" />
                <p className="font-bold text-slate-700">No matching options</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  No results for &ldquo;<span className="font-mono text-amber-800">{searchQuery}</span>&rdquo;
                </p>
              </div>
            ) : (
              <>
                {/* Flat Options */}
                {filteredOptions.length > 0 && (
                  <div className="space-y-0.5 py-0.5">
                    {filteredOptions.map(opt => {
                      const isSelected = opt.value === value;
                      return (
                        <div
                          key={opt.value}
                          onClick={() => handleSelect(opt.value, opt.disabled)}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            opt.disabled
                              ? 'opacity-40 cursor-not-allowed bg-slate-50'
                              : isSelected
                              ? 'bg-amber-500 text-white font-bold shadow-xs'
                              : 'hover:bg-amber-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {opt.icon && (
                              <span className={`shrink-0 ${isSelected ? 'text-white' : 'text-slate-500'}`}>
                                {opt.icon}
                              </span>
                            )}
                            {opt.badge && (
                              <span
                                className={`shrink-0 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                                  isSelected
                                    ? 'bg-amber-700 text-amber-100 border border-amber-400'
                                    : opt.badgeColor || 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {opt.badge}
                              </span>
                            )}
                            <span className="truncate">{opt.label}</span>
                            {opt.sublabel && (
                              <span
                                className={`text-[10px] truncate ${
                                  isSelected ? 'text-amber-100' : 'text-slate-400'
                                }`}
                              >
                                ({opt.sublabel})
                              </span>
                            )}
                          </div>

                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-white ml-2" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Categorized Groups */}
                {filteredGroups.map((grp, gIdx) => (
                  <div key={grp.label || gIdx} className="pt-1.5 pb-0.5">
                    {/* Group Header */}
                    <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100/50 rounded-md mb-1 font-mono">
                      <div className="flex items-center gap-1">
                        {grp.icon}
                        <span>{grp.label}</span>
                      </div>
                      <span className="text-[9px] bg-amber-200/80 px-1 py-0.2 rounded text-amber-950 font-bold">
                        {grp.options.length}
                      </span>
                    </div>

                    {/* Group Options */}
                    <div className="space-y-0.5 pl-1">
                      {grp.options.map(opt => {
                        const isSelected = opt.value === value;
                        return (
                          <div
                            key={opt.value}
                            onClick={() => handleSelect(opt.value, opt.disabled)}
                            className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                              opt.disabled
                                ? 'opacity-40 cursor-not-allowed bg-slate-50'
                                : isSelected
                                ? 'bg-amber-500 text-white font-bold shadow-xs'
                                : 'hover:bg-amber-50 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              {opt.icon && (
                                <span className={`shrink-0 ${isSelected ? 'text-white' : 'text-slate-500'}`}>
                                  {opt.icon}
                                </span>
                              )}
                              {opt.badge && (
                                <span
                                  className={`shrink-0 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                                    isSelected
                                      ? 'bg-amber-700 text-amber-100 border border-amber-400'
                                      : opt.badgeColor || 'bg-amber-100 text-amber-900 border border-amber-300'
                                  }`}
                                >
                                  {opt.badge}
                                </span>
                              )}
                              <span className="truncate">{opt.label}</span>
                              {opt.sublabel && (
                                <span
                                  className={`text-[10px] truncate ${
                                    isSelected ? 'text-amber-100' : 'text-slate-400'
                                  }`}
                                >
                                  ({opt.sublabel})
                                </span>
                              )}
                            </div>

                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-white ml-2" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
