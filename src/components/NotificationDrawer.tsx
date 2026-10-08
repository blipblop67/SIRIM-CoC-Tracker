import React, { useState } from 'react';
import {
  X,
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  Sparkles,
  Volume2,
  VolumeX,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { SirimApplication, ActionItem, ActionItemPriority } from '../types';
import {
  getPriorityBadge,
  calculateDeadlineInfo,
  formatDate,
} from '../utils/formatters';
import { isActionRequired, isPendingStatement, getActionLabelInfo } from '../utils/actionItemUtils';
import { notificationAudio } from '../utils/audio';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  applications: SirimApplication[];
  onToggleActionItem: (appId: string, actionItemId: string) => void;
  onSelectApplication: (app: SirimApplication) => void;
  onQuickDraftReply: (app: SirimApplication) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  applications,
  onToggleActionItem,
  onSelectApplication,
  onQuickDraftReply,
}) => {
  if (!isOpen) return null;

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'ACTIONS' | 'STATEMENTS'>('ALL');

  // Flatten and sort pending actions across all applications
  const allPendingActions: {
    app: SirimApplication;
    action: ActionItem;
  }[] = [];

  applications.forEach((app) => {
    app.actionItems
      .filter((act) => !act.isCompleted)
      .forEach((action) => {
        allPendingActions.push({ app, action });
      });
  });

  // Sort: CRITICAL -> HIGH -> MEDIUM -> LOW, then by due date
  const priorityWeight: Record<ActionItemPriority, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  allPendingActions.sort((a, b) => {
    const pDiff = priorityWeight[b.action.priority] - priorityWeight[a.action.priority];
    if (pDiff !== 0) return pDiff;
    if (!a.action.dueDate) return 1;
    if (!b.action.dueDate) return -1;
    return new Date(a.action.dueDate).getTime() - new Date(b.action.dueDate).getTime();
  });

  const activeActionsCount = allPendingActions.filter((i) => isActionRequired(i.action)).length;
  const pendingStatementsCount = allPendingActions.filter((i) => isPendingStatement(i.action)).length;
  const criticalCount = allPendingActions.filter((i) => i.action.priority === 'CRITICAL' && isActionRequired(i.action)).length;

  const handleActionCheck = (appId: string, actionId: string) => {
    if (soundEnabled) {
      notificationAudio.playSuccessTone();
    }
    onToggleActionItem(appId, actionId);
  };

  const displayedItems = allPendingActions.filter((i) => {
    if (filterType === 'ACTIONS') return isActionRequired(i.action);
    if (filterType === 'STATEMENTS') return isPendingStatement(i.action);
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-xs">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col">
          {/* Header */}
          <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative p-2 rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-400/30">
                <Bell className="w-5 h-5" />
                {criticalCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900 animate-pulse" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Action Center & Alerts
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                    {activeActionsCount} Actions • {pendingStatementsCount} Waiting
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Active team tasks and external counterparty waiting statements
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subheader Toolbar & Filter Pills */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                {criticalCount > 0 ? (
                  <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    {criticalCount} Critical action{criticalCount > 1 ? 's' : ''} require attention
                  </span>
                ) : (
                  <span>All active actions on schedule</span>
                )}
              </div>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1 text-slate-500 hover:text-slate-800 rounded transition-colors"
                title={soundEnabled ? 'Mute Alert Sounds' : 'Enable Alert Sounds'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-600" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                  filterType === 'ALL'
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All ({allPendingActions.length})
              </button>
              <button
                onClick={() => setFilterType('ACTIONS')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                  filterType === 'ACTIONS'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Action Required ({activeActionsCount})</span>
              </button>
              <button
                onClick={() => setFilterType('STATEMENTS')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                  filterType === 'STATEMENTS'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'bg-white text-purple-800 hover:bg-purple-50 border border-purple-200'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>Pending Statements ({pendingStatementsCount})</span>
              </button>
            </div>
          </div>

          {/* Action Items List */}
          <div className="p-4 space-y-3 overflow-y-auto flex-1 bg-slate-50/50">
            {allPendingActions.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">No Pending Action Items!</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  All SIRIM QAS queries, sample shipments, and fees have been completed.
                </p>
              </div>
            ) : (
              displayedItems.map(({ app, action }) => {
                const pInfo = getPriorityBadge(action.priority);
                const labelInfo = getActionLabelInfo(action);
                const isStmt = labelInfo.isPendingStatement;
                const deadline = calculateDeadlineInfo(action.dueDate || app.targetDeadline);

                return (
                  <div
                    key={`${app.id}-${action.id}`}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isStmt
                        ? 'bg-purple-50/20 border-purple-200/90 shadow-2xs'
                        : action.priority === 'CRITICAL'
                        ? 'bg-white border-rose-300 ring-1 ring-rose-400/20 shadow-xs'
                        : 'bg-white border-slate-200 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {isStmt ? (
                        <div
                          className="mt-1 flex items-center justify-center w-4 h-4 rounded bg-purple-100 text-purple-700 border border-purple-200 shrink-0 cursor-default"
                          title={`Awaiting external response from ${labelInfo.shortLabel} — Cannot be ticked manually`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                        </div>
                      ) : (
                        <input
                          type="checkbox"
                          checked={action.isCompleted}
                          onChange={() => handleActionCheck(app.id, action.id)}
                          className="mt-1 h-4 w-4 rounded cursor-pointer border-slate-300 text-blue-600 focus:ring-blue-500"
                          title="Mark action as completed"
                        />
                      )}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h5 className={`text-xs font-bold leading-snug ${isStmt ? 'text-purple-950' : 'text-slate-900'}`}>
                            {action.title}
                          </h5>
                          <div className="flex items-center gap-1 shrink-0">
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${labelInfo.tagClass}`}
                            >
                              {labelInfo.shortLabel}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1 rounded border ${pInfo.bg} ${pInfo.text} ${pInfo.border}`}
                            >
                              {action.priority}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {action.description}
                        </p>

                        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
                          <span className="font-bold text-slate-700">{app.applicationRef}</span>
                          <span>•</span>
                          <span className="truncate">{app.productName}</span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                          {deadline.daysRemaining !== null ? (
                            <span
                              className={`flex items-center gap-1 font-semibold ${
                                deadline.isOverdue
                                  ? 'text-rose-700'
                                  : deadline.isDueSoon
                                  ? 'text-amber-700'
                                  : 'text-slate-600'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              {deadline.text}
                            </span>
                          ) : (
                            <span className="text-slate-400">No deadline</span>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                onQuickDraftReply(app);
                                onClose();
                              }}
                              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>AI Reply</span>
                            </button>
                            <button
                              onClick={() => {
                                onSelectApplication(app);
                                onClose();
                              }}
                              className="text-slate-700 hover:text-slate-900 font-medium flex items-center gap-0.5"
                            >
                              <span>View Dossier</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-white border-t border-slate-200 flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="w-full py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Close Action Center
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
