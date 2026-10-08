import React from 'react';
import {
  Search,
  LayoutGrid,
  List,
  X,
  Download,
  Filter,
} from 'lucide-react';
import { CertificationScheme } from '../types';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  schemeFilter: string;
  onSchemeFilterChange: (scheme: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (assignee: string) => void;
  viewMode: 'grid' | 'table';
  onViewModeChange: (mode: 'grid' | 'table') => void;
  totalFilteredCount: number;
  totalAppsCount?: number;
  currentUserEmail?: string;
  onClearAll?: () => void;
  onExportCsv?: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  schemeFilter,
  onSchemeFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  viewMode,
  onViewModeChange,
  totalFilteredCount,
  totalAppsCount = 0,
  currentUserEmail,
  onExportCsv,
}) => {
  const statusTabs = [
    { id: 'ALL', label: 'All' },
    { id: 'ACTION_REQUIRED', label: 'Action Required', dot: 'bg-rose-500' },
    { id: 'IN_PROGRESS', label: 'In Progress', dot: 'bg-indigo-500' },
    { id: 'APPROVED', label: 'Approved', dot: 'bg-emerald-500' },
    { id: 'PAYMENT', label: 'Payment', dot: 'bg-amber-500' },
  ];

  const schemes: CertificationScheme[] = [
    'Type Approval (MCMC/SIRIM)',
    'Special Approval',
    'Modular Approval',
    'CIDB Certification',
    'Safety & EMC (MS Standards)',
  ];

  const hasActiveFilters =
    searchQuery !== '' || statusFilter !== 'ALL' || schemeFilter !== 'ALL' || assigneeFilter !== 'ALL';

  const resetFilters = () => {
    onSearchChange('');
    onStatusFilterChange('ALL');
    onSchemeFilterChange('ALL');
    onAssigneeFilterChange('ALL');
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-3 mb-4 shadow-2xs space-y-3">
      {/* Top Controls Row */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Left: Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by reference, product, model, or officer..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200/80 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition-all font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Center: Segmented Status Filter Tabs */}
        <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-medium self-start lg:self-auto overflow-x-auto max-w-full">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onStatusFilterChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.dot && <span className={`w-1.5 h-1.5 rounded-full ${tab.dot}`} />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Scheme, Assignee, View Switcher & Export */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between lg:justify-end">
          {/* Scheme Dropdown */}
          <select
            value={schemeFilter}
            onChange={(e) => onSchemeFilterChange(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200/80 text-slate-700 rounded-lg py-1.5 pl-2.5 pr-7 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors cursor-pointer"
          >
            <option value="ALL">All Schemes</option>
            {schemes.map((s) => (
              <option key={s} value={s}>
                {s.replace(' (MCMC/SIRIM)', '').replace(' (MS Standards)', '')}
              </option>
            ))}
          </select>

          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => onAssigneeFilterChange(e.target.value)}
            className={`text-xs border rounded-lg py-1.5 pl-2.5 pr-7 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors cursor-pointer ${
              assigneeFilter === 'ME'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                : 'bg-slate-50 border-slate-200/80 text-slate-700'
            }`}
          >
            <option value="ALL">All Assignees</option>
            {currentUserEmail && (
              <option value="ME">👤 Assigned to Me</option>
            )}
            <option value="APPLICANT">Pending Cytron</option>
            <option value="SIRIM">Pending SIRIM QAS</option>
            <option value="LAB">Pending Lab</option>
          </select>

          {/* View Mode Toggle */}
          <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Grid Cards"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('table')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {onExportCsv && (
            <button
              onClick={onExportCsv}
              className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-lg transition-colors"
              title="Export filtered records to CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-slate-500 hover:text-slate-900 font-medium underline px-1 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Filter Status Bar Summary */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
        <span className="font-mono tabular-nums">
          Showing <strong className="text-slate-700 font-semibold">{totalFilteredCount}</strong> of{' '}
          <strong className="text-slate-700 font-semibold">{totalAppsCount}</strong> applications
        </span>
        {hasActiveFilters && (
          <span className="text-slate-500 flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-400" />
            Filtered active
          </span>
        )}
      </div>
    </div>
  );
};
