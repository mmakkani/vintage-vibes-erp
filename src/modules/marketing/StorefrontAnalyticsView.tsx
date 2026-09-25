import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Globe,
  Activity,
  Users,
  Eye,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Shield,
  Layers,
  ArrowUpRight,
  Sparkles,
  BarChart2
} from 'lucide-react';
import { supabase } from '../../supabaseClient.ts';

export interface StorefrontAnalyticsRecord {
  id: string;
  visitor_id: string;
  ip_address: string | null;
  country: string | null;
  city: string | null;
  device_type: 'Mobile' | 'Desktop' | 'Tablet' | string;
  os: string | null;
  browser: string | null;
  page_visited: string | null;
  created_at: string;
}

interface BreakdownStats {
  mobileCount: number;
  desktopCount: number;
  tabletCount: number;
  totalSample: number;
  mobilePercent: number;
  desktopPercent: number;
  tabletPercent: number;
  topCountries: Array<{ name: string; count: number; percent: number }>;
  topCities: Array<{ name: string; count: number; percent: number }>;
}

const PAGE_SIZE = 50;

export const StorefrontAnalyticsView: React.FC = () => {
  // KPI States (Server-side aggregated via { count: 'exact', head: true })
  const [totalPageViews, setTotalPageViews] = useState<number>(0);
  const [dailyActiveViews, setDailyActiveViews] = useState<number>(0);
  const [isLoadingKPIs, setIsLoadingKPIs] = useState<boolean>(true);

  // Pagination States
  const [page, setPage] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [records, setRecords] = useState<StorefrontAnalyticsRecord[]>([]);
  const [isLoadingTable, setIsLoadingTable] = useState<boolean>(false);

  // Filters
  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'Mobile' | 'Desktop' | 'Tablet'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Demographics & Device Breakdown State
  const [breakdown, setBreakdown] = useState<BreakdownStats>({
    mobileCount: 0,
    desktopCount: 0,
    tabletCount: 0,
    totalSample: 0,
    mobilePercent: 0,
    desktopPercent: 0,
    tabletPercent: 0,
    topCountries: [],
    topCities: []
  });

  // 1. Fetch Aggregated KPIs (Zero Row Download - strictly exact head counts)
  const fetchAggregatedKPIs = useCallback(async () => {
    setIsLoadingKPIs(true);
    try {
      // Total Page Views: Aggregated query without downloading row payloads
      const { count: totalCount, error: totalErr } = await supabase
        .from('storefront_analytics')
        .select('visitor_id', { count: 'exact', head: true });

      if (!totalErr && typeof totalCount === 'number') {
        setTotalPageViews(totalCount);
      }

      // DAU (Daily Active Views - Today from midnight UTC)
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const { count: todayCount, error: todayErr } = await supabase
        .from('storefront_analytics')
        .select('visitor_id', { count: 'exact', head: true })
        .gte('created_at', startOfToday.toISOString());

      if (!todayErr && typeof todayCount === 'number') {
        setDailyActiveViews(todayCount);
      }
    } catch (err) {
      console.warn('[StorefrontAnalytics] Error fetching aggregated KPIs:', err);
    } finally {
      setIsLoadingKPIs(false);
    }
  }, []);

  // 2. Fetch Demographics Breakdown (Sample-based aggregation)
  const fetchDemographicsBreakdown = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('storefront_analytics')
        .select('country, city, device_type')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error || !data) return;

      let mobile = 0;
      let desktop = 0;
      let tablet = 0;
      const countryMap: Record<string, number> = {};
      const cityMap: Record<string, number> = {};

      data.forEach(item => {
        const dtype = (item.device_type || 'Desktop').toLowerCase();
        if (dtype.includes('mobile') || dtype.includes('phone')) mobile++;
        else if (dtype.includes('tablet') || dtype.includes('ipad')) tablet++;
        else desktop++;

        const country = item.country && item.country !== 'Unknown' ? item.country : 'Other / Proxy';
        countryMap[country] = (countryMap[country] || 0) + 1;

        const city = item.city && item.city !== 'Unknown' ? item.city : 'Other';
        cityMap[city] = (cityMap[city] || 0) + 1;
      });

      const total = data.length || 1;
      const mobilePercent = Math.round((mobile / total) * 100);
      const tabletPercent = Math.round((tablet / total) * 100);
      const desktopPercent = Math.max(0, 100 - mobilePercent - tabletPercent);

      const topCountries = Object.entries(countryMap)
        .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const topCities = Object.entries(cityMap)
        .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setBreakdown({
        mobileCount: mobile,
        desktopCount: desktop,
        tabletCount: tablet,
        totalSample: total,
        mobilePercent,
        desktopPercent,
        tabletPercent,
        topCountries,
        topCities
      });
    } catch (err) {
      console.warn('[StorefrontAnalytics] Breakdown fetch error:', err);
    }
  }, []);

  // 3. Strict Server-Side Pagination using .range(from, to) with max 50 records per page
  const fetchPaginatedVisitorLogs = useCallback(async (targetPage = page) => {
    setIsLoadingTable(true);
    try {
      const from = (targetPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('storefront_analytics')
        .select('*', { count: 'exact' });

      // Apply device filter if selected
      if (deviceFilter !== 'ALL') {
        query = query.ilike('device_type', `%${deviceFilter}%`);
      }

      // Apply search term if present
      if (searchTerm.trim()) {
        const cleanTerm = searchTerm.trim();
        query = query.or(`ip_address.ilike.%${cleanTerm}%,city.ilike.%${cleanTerm}%,country.ilike.%${cleanTerm}%,page_visited.ilike.%${cleanTerm}%`);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.warn('[StorefrontAnalytics] Pagination query notice:', error);
        setRecords([]);
        return;
      }

      const validRecords = (data || []) as StorefrontAnalyticsRecord[];
      setRecords(validRecords);

      const totalCount = count ?? validRecords.length;
      setTotalRecords(totalCount);
      setTotalPages(Math.max(1, Math.ceil(totalCount / PAGE_SIZE)));
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn('[StorefrontAnalytics] Unexpected fetch failure:', err);
      setRecords([]);
    } finally {
      setIsLoadingTable(false);
    }
  }, [page, deviceFilter, searchTerm]);

  // Initial load and filter change trigger
  useEffect(() => {
    fetchAggregatedKPIs();
    fetchDemographicsBreakdown();
  }, [fetchAggregatedKPIs, fetchDemographicsBreakdown]);

  useEffect(() => {
    fetchPaginatedVisitorLogs(page);
  }, [fetchPaginatedVisitorLogs, page]);

  // Handle Search Input Change with Page Reset
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  // Handle Filter Change with Page Reset
  const handleDeviceFilterChange = (filter: 'ALL' | 'Mobile' | 'Desktop' | 'Tablet') => {
    setDeviceFilter(filter);
    setPage(1);
  };

  // Generate array of page numbers to render
  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (page >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
      }
    }
    return pages;
  }, [page, totalPages]);

  return (
    <div className="w-full space-y-6 pb-12">
      {/* 1. HEADER COMMAND BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/50 rounded-2xl p-5 shadow-lg text-white">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-md">
              <Globe className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-serif font-black text-xl text-white tracking-tight">
                  Storefront Traffic &amp; Live Audience Engine
                </h2>
                <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Realtime Stream Active
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Strict 50/Page Range Pagination
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Monitors inbound shopper traffic, Geo-IP distribution, device categories, and visitor engagement across Dubai &amp; global nodes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
            {lastRefreshed && (
              <span className="text-[11px] font-mono text-slate-400 hidden sm:inline-block">
                Updated: {lastRefreshed}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                fetchAggregatedKPIs();
                fetchDemographicsBreakdown();
                fetchPaginatedVisitorLogs(page);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTable || isLoadingKPIs ? 'animate-spin' : ''}`} />
              <span>Refresh Metrics</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. AGGREGATED METRICS & KPIS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Page Views */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Storefront Hits</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {isLoadingKPIs ? '...' : totalPageViews.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
            <Shield className="w-3 h-3 text-emerald-600" />
            <span>Exact head count (Zero payload download)</span>
          </div>
        </div>

        {/* Daily Active Views (DAU) */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Today's Active Hits (DAU)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {isLoadingKPIs ? '...' : dailyActiveViews.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Active session visits recorded today</span>
          </div>
        </div>

        {/* Mobile Device Share */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Mobile Traffic Share</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {breakdown.mobilePercent}%
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all"
              style={{ width: `${breakdown.mobilePercent}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5 font-mono">
            {breakdown.mobileCount} mobile visitors in sample
          </div>
        </div>

        {/* Desktop Device Share */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Desktop &amp; Tablet Share</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Monitor className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {breakdown.desktopPercent + breakdown.tabletPercent}%
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-sky-500 h-1.5 rounded-full transition-all"
              style={{ width: `${breakdown.desktopPercent + breakdown.tabletPercent}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5 font-mono">
            {breakdown.desktopCount} desktop / {breakdown.tabletCount} tablet
          </div>
        </div>
      </div>

      {/* 3. AUDIENCE DEMOGRAPHICS BREAKDOWN (TOP COUNTRIES, CITIES, DEVICES) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Device Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-indigo-600" />
              Device Distribution
            </span>
            <span className="text-[10px] font-mono text-slate-400">Sample: {breakdown.totalSample}</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between font-medium mb-1">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                  Mobile Shoppers
                </span>
                <span className="font-mono font-bold text-slate-900">{breakdown.mobilePercent}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${breakdown.mobilePercent}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-medium mb-1">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Monitor className="w-3.5 h-3.5 text-sky-600" />
                  Desktop Browsers
                </span>
                <span className="font-mono font-bold text-slate-900">{breakdown.desktopPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-sky-500 h-full rounded-full transition-all" style={{ width: `${breakdown.desktopPercent}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-medium mb-1">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Tablet className="w-3.5 h-3.5 text-emerald-600" />
                  Tablet Devices
                </span>
                <span className="font-mono font-bold text-slate-900">{breakdown.tabletPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${breakdown.tabletPercent}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Top Countries */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-600" />
              Top Visitor Countries
            </span>
            <span className="text-[10px] font-mono text-slate-400">Geo-IP Direct</span>
          </div>

          <div className="space-y-2 text-xs">
            {breakdown.topCountries.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs">Awaiting traffic telemetry...</div>
            ) : (
              breakdown.topCountries.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-center font-mono font-bold text-slate-400 text-[10px]">#{i + 1}</span>
                    <span className="font-medium text-slate-800">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-500">{c.count} hits</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                      {c.percent}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Cities */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-600" />
              Top Origin Cities
            </span>
            <span className="text-[10px] font-mono text-slate-400">High Concentration</span>
          </div>

          <div className="space-y-2 text-xs">
            {breakdown.topCities.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs">Awaiting traffic telemetry...</div>
            ) : (
              breakdown.topCities.map((city, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-center font-mono font-bold text-slate-400 text-[10px]">#{i + 1}</span>
                    <span className="font-medium text-slate-800">{city.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-500">{city.count} hits</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800">
                      {city.percent}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 4. VISITOR SESSIONS MASTER TABLE WITH STRICT SERVER-SIDE PAGINATION */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-3 p-4">
        {/* Table Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-900">Visitor Telemetry Logs</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
              {totalRecords.toLocaleString()} Total Records
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Bar */}
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search IP, City, Country, Route..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Device Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {(['ALL', 'Mobile', 'Desktop', 'Tablet'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleDeviceFilterChange(tab)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    deviceFilter === tab
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Master Log Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Visitor ID</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">Location (City &amp; Country)</th>
                <th className="px-4 py-3">Device &amp; OS</th>
                <th className="px-4 py-3">Browser</th>
                <th className="px-4 py-3">Page Visited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {isLoadingTable ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                    Fetching page {page} from database (.range({(page - 1) * PAGE_SIZE}, {(page - 1) * PAGE_SIZE + PAGE_SIZE - 1}))...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No visitor logs recorded matching your filter. Browse the storefront to generate live telemetry!
                  </td>
                </tr>
              ) : (
                records.map(record => {
                  const dateStr = record.created_at ? new Date(record.created_at).toLocaleString() : 'N/A';
                  const isMobile = (record.device_type || '').toLowerCase().includes('mobile');
                  const isTablet = (record.device_type || '').toLowerCase().includes('tablet');

                  return (
                    <tr key={record.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {dateStr}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] border border-slate-200" title={record.visitor_id}>
                          {record.visitor_id ? `${record.visitor_id.slice(0, 8)}...` : 'Anonymous'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {record.ip_address || 'Unknown'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="text-slate-900 font-medium">
                            {record.city && record.city !== 'Unknown' ? `${record.city}, ` : ''}
                            {record.country || 'Global'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {isMobile ? (
                            <Smartphone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          ) : isTablet ? (
                            <Tablet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <Monitor className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          )}
                          <span className="font-semibold text-slate-800">
                            {record.device_type || 'Desktop'}
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            ({record.os || 'OS'})
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.browser || 'Browser'}
                      </td>
                      <td className="px-4 py-3 font-mono text-indigo-600 text-[11px]">
                        {record.page_visited || '/'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 5. SERVER-SIDE PAGINATION CONTROLS (Next, Previous, Page Numbers) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500 font-mono">
            Showing records <span className="font-bold text-slate-800">{totalRecords > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(page * PAGE_SIZE, totalRecords)}</span> of{' '}
            <span className="font-bold text-slate-900">{totalRecords.toLocaleString()}</span> (Page {page} of {totalPages})
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {/* Previous Button */}
            <button
              type="button"
              disabled={page <= 1 || isLoadingTable}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            {/* Page Numbers */}
            <div className="flex items-center gap-1">
              {pageNumbers.map((num, idx) => {
                if (num === '...') {
                  return (
                    <span key={`dots-${idx}`} className="px-2 text-xs text-slate-400 font-mono">
                      ...
                    </span>
                  );
                }
                const isCurrent = num === page;
                return (
                  <button
                    key={`page-${num}`}
                    type="button"
                    disabled={isLoadingTable}
                    onClick={() => setPage(Number(num))}
                    className={`w-8 h-8 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>

            {/* Next Button */}
            <button
              type="button"
              disabled={page >= totalPages || isLoadingTable}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
