import React from 'react';
import {
  X,
  Activity,
  CheckCircle2,
  Clock,
  FileText,
  RefreshCw,
  Trash2,
  Send,
  Users,
  Search,
  ExternalLink,
} from 'lucide-react';
import { TeamActivityLog } from '../types';

interface TeamActivityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activities: TeamActivityLog[];
  onSelectApplicationRef?: (ref: string) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const TeamActivityDrawer: React.FC<TeamActivityDrawerProps> = ({
  isOpen,
  onClose,
  activities,
  onSelectApplicationRef,
  isLoading = false,
  onRefresh,
}) => {
  const [filterQuery, setFilterQuery] = React.useState('');
  const [selectedType, setSelectedType] = React.useState<string>('ALL');

  if (!isOpen) return null;

  const filtered = activities.filter((act) => {
    if (selectedType !== 'ALL' && act.actionType !== selectedType) return false;
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      const matchesText =
        (act.description && act.description.toLowerCase().includes(q)) ||
        (act.userEmail && act.userEmail.toLowerCase().includes(q)) ||
        (act.userName && act.userName.toLowerCase().includes(q)) ||
        (act.applicationRef && act.applicationRef.toLowerCase().includes(q)) ||
        (act.productName && act.productName.toLowerCase().includes(q));
      if (!matchesText) return false;
    }
    return true;
  });

  const getActionIcon = (type: TeamActivityLog['actionType']) => {
    switch (type) {
      case 'ACTION_TOGGLE':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'STATUS_CHANGE':
        return <Activity className="w-4 h-4 text-indigo-500" />;
      case 'APP_ADDED':
        return <FileText className="w-4 h-4 text-sky-500" />;
      case 'APP_EDITED':
        return <FileText className="w-4 h-4 text-amber-500" />;
      case 'APP_DELETED':
        return <Trash2 className="w-4 h-4 text-rose-500" />;
      case 'SHEET_SYNC':
        return <RefreshCw className="w-4 h-4 text-teal-500" />;
      case 'GMAIL_SCAN':
        return <Search className="w-4 h-4 text-violet-500" />;
      case 'MEMBER_JOINED':
        return <Users className="w-4 h-4 text-blue-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const getActionBadgeClass = (type: TeamActivityLog['actionType']) => {
    switch (type) {
      case 'ACTION_TOGGLE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'STATUS_CHANGE':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'APP_ADDED':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'APP_EDITED':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'APP_DELETED':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'SHEET_SYNC':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'GMAIL_SCAN':
        return 'bg-violet-50 text-violet-700 border-violet-200';
      case 'MEMBER_JOINED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const now = Date.now();
      const past = new Date(isoString).getTime();
      const diffMs = now - past;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 45) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return new Date(isoString).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      });
    } catch {
      return '';
    }
  };

  return (
    <div
      id="team-activity-drawer-overlay"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        id="team-activity-drawer-panel"
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 transform transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Team Activity & Audit Feed
              </h2>
              <p className="text-xs text-slate-500">
                Live audit trail across team members
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onRefresh && (
              <button
                id="refresh-team-activity-btn"
                onClick={onRefresh}
                disabled={isLoading}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                title="Refresh team activity"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
              </button>
            )}
            <button
              id="close-team-activity-drawer-btn"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              title="Close activity feed"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 border-b border-slate-100 bg-white space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search by user, ref no, product..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] scrollbar-thin">
            {[
              { id: 'ALL', label: 'All Activities' },
              { id: 'ACTION_TOGGLE', label: 'Actions' },
              { id: 'STATUS_CHANGE', label: 'Statuses' },
              { id: 'SHEET_SYNC', label: 'Sheet' },
              { id: 'GMAIL_SCAN', label: 'Scans' },
              { id: 'MEMBER_JOINED', label: 'Presence' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedType(tab.id)}
                className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                  selectedType === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Activity List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center">
              <Activity className="w-8 h-8 text-slate-300 mb-2 stroke-1" />
              <p className="font-semibold text-slate-600">No activity recorded yet</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[240px]">
                Collaborative actions by Lead, Boss, and team members will be logged here automatically.
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              const displayName =
                item.userName || (item.userEmail ? item.userEmail.split('@')[0] : 'Team Member');
              const initial = displayName.charAt(0).toUpperCase();

              return (
                <div key={item.id} className="pt-3 first:pt-0">
                  <div className="flex items-start gap-3">
                    {/* User Avatar */}
                    {item.userPicture ? (
                      <img
                        src={item.userPicture}
                        alt={displayName}
                        className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5 border border-slate-200"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                        {initial}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">
                            {displayName}
                          </span>
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${getActionBadgeClass(
                              item.actionType
                            )}`}
                          >
                            {item.actionType.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 mt-1 leading-snug break-words">
                        {item.description}
                      </p>

                      {/* Application Reference pill if available */}
                      {item.applicationRef && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (onSelectApplicationRef && item.applicationRef) {
                                onSelectApplicationRef(item.applicationRef);
                                onClose();
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200 transition-colors"
                          >
                            <span>Ref: {item.applicationRef}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                          {item.productName && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                              {item.productName}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
          <p className="text-[11px] text-slate-500">
            Audit logs are synchronized across all connected Google accounts in real-time.
          </p>
        </div>
      </div>
    </div>
  );
};
