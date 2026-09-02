import React from 'react';
import {
  Search,
  Filter,
  LayoutGrid,
  List,
  SlidersHorizontal,
  X,
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
}) => {
  const statusTabs = [
    { id: 'ALL', label: 'All Applications' },
    { id: 'ACTION_REQUIRED', label: 'Action Required', highlight: true },
    { id: 'IN_PROGRESS', label: 'In Progress' },
    { id: 'APPROVED', label: 'Approved (CoC Issued)' },
    { id: 'PAYMENT', label: 'Payment Pending' },
  ];

  const schemes: CertificationScheme[] = [
    'Type Approval (MCMC/SIRIM)',
    'Special Approval',
    'Modular Approval',
    'CIDB Certification',
    'Safety & EMC (MS Standards)',
  ];

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'ALL' || schemeFilter !== 'ALL' || assigneeFilter !== 'ALL';

  const resetFilters = () => {
    onSearchChange('');
    onStatusFilterChange('ALL');
    onSchemeFilterChange('ALL');
    onAssigneeFilterChange('ALL');
  };

  return (
    <div className="h-auto md:h-16 border border-slate-200 rounded-t-2xl flex flex-col md:flex-row items-center px-4 py-3 md:py-0 justify-between bg-slate-50 shrink-0 mb-[-1px] relative z-10 gap-4 md:gap-0">
      <div className="flex flex-wrap md:flex-nowrap items-center gap-4 w-full md:w-auto">
        {/* Search Input */}
        <div className="relative flex-1 md:flex-none">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search references..."
            className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full md:w-64"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="hidden md:block h-6 w-px bg-slate-300"></div>

        {/* Scheme Dropdown */}
        <select
          value={schemeFilter}
          onChange={(e) => onSchemeFilterChange(e.target.value)}
          className="text-sm border border-slate-200 rounded-md bg-white py-1.5 pl-3 pr-8 focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none min-w-[140px]"
        >
          <option value="ALL">All Schemes</option>
          {schemes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Assignee Filter */}
        <select
          value={assigneeFilter}
          onChange={(e) => onAssigneeFilterChange(e.target.value)}
          className="text-sm border border-slate-200 rounded-md bg-white py-1.5 pl-3 pr-8 focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none min-w-[140px]"
        >
          <option value="ALL">All Assignees</option>
          <option value="APPLICANT">Pending Applicant (Cytron)</option>
          <option value="SIRIM">Pending SIRIM QAS</option>
          <option value="LAB">Pending Lab</option>
        </select>
      </div>

      <div className="flex items-center gap-2 self-end md:self-auto w-full md:w-auto justify-end">
        <div className="flex items-center bg-white p-0.5 rounded-md border border-slate-200 mr-2">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'grid'
                ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-700'
            }`}
            title="Card Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('table')}
            className={`p-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'table'
                ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-700'
            }`}
            title="Operational Table View"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="text-xs text-slate-500 hover:text-slate-800 underline font-medium cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
};
