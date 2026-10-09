import React from 'react';
import { displayApplicationRef } from '../utils/reference';
import {
  Clock,
  User,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Mail,
  Trash2,
  Building2,
  FileCheck,
  AlertTriangle,
  Bot,
} from 'lucide-react';
import { SirimApplication } from '../types';
import {
  getStatusBadgeInfo,
  getPriorityBadge,
  calculateDeadlineInfo,
  formatDate,
  getGmailThreadUrl,
  getSupplierStatusBadgeInfo,
} from '../utils/formatters';
import { separateActionItems, getActionLabelInfo } from '../utils/actionItemUtils';

interface ApplicationCardProps {
  application: SirimApplication;
  currentUserEmail?: string;
  currentUserName?: string;
  onSelect: (app: SirimApplication) => void;
  onToggleActionItem: (appId: string, actionItemId: string) => void;
  onQuickDraftReply: (app: SirimApplication) => void;
  onDelete?: (appId: string, e: React.MouseEvent) => void;
}

export const ApplicationCard: React.FC<ApplicationCardProps> = ({
  application,
  currentUserEmail,
  onSelect,
  onToggleActionItem,
  onQuickDraftReply,
  onDelete,
}) => {
  const [copiedRef, setCopiedRef] = React.useState(false);
  const statusInfo = getStatusBadgeInfo(application.status);
  const deadlineInfo = calculateDeadlineInfo(application.targetDeadline);

  const isAssignedToMe = Boolean(
    currentUserEmail &&
      application.actionItems.some(
        (a) =>
          !a.isCompleted &&
          (a.assignedToUserEmail?.toLowerCase() === currentUserEmail.toLowerCase() ||
            (a.assignedToName && currentUserEmail.toLowerCase().includes(a.assignedToName.toLowerCase())))
      )
  );

  const copyRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(application.applicationRef);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const incompleteItems = application.actionItems.filter((a) => !a.isCompleted);
  const { activeActions, pendingStatements } = separateActionItems(incompleteItems);
  const criticalAction = activeActions.find((a) => a.priority === 'CRITICAL');

  return (
    <div
      onClick={() => onSelect(application)}
      className={`group bg-white border rounded-xl p-4 sm:p-5 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between shadow-2xs hover:shadow-xs relative ${
        criticalAction
          ? 'border-rose-300/80 ring-1 ring-rose-400/10'
          : application.status === 'APPROVED'
          ? 'border-emerald-200/80 ring-1 ring-emerald-400/10'
          : 'border-slate-200/80'
      }`}
    >
      <div className="space-y-3">
        {/* Top: Ref No & Status Dot */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-mono text-slate-600">
            <span className="font-semibold text-slate-800">{displayApplicationRef(application.applicationRef)}</span>
            <button
              onClick={copyRef}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
              title="Copy Reference"
            >
              {copiedRef ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            </button>
            {isAssignedToMe && (
              <span className="text-[10px] text-indigo-700 font-sans font-semibold bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded ml-1">
                Your Task
              </span>
            )}
          </div>

          {/* Status (Zero-pill clean dot + text) */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                application.status === 'APPROVED'
                  ? 'bg-emerald-500'
                  : application.status === 'RFI_ACTION_REQUIRED'
                  ? 'bg-rose-500'
                  : application.status === 'SAMPLE_REQUESTED' || application.status === 'PAYMENT_PENDING'
                  ? 'bg-amber-500'
                  : 'bg-indigo-500'
              }`}
            />
            <span className="text-slate-700 font-semibold">{statusInfo.label}</span>
          </div>
        </div>

        {/* Product Title & Metadata Line */}
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
            {application.productName}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
            <span className="text-slate-700 font-mono font-medium">{application.modelNumber}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>{application.brand}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="truncate max-w-[130px]">
              {application.scheme.replace(' (MCMC/SIRIM)', '').replace(' (MS Standards)', '')}
            </span>
          </div>
        </div>

        {/* Officer, Supplier & SLA info */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 truncate">
            {application.officerName ? (
              <>
                <User className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">
                  Officer: <strong className="text-slate-700 font-medium">{application.officerName}</strong>
                </span>
              </>
            ) : (
              <span>SIRIM e-ComM Register</span>
            )}
          </div>

          {application.targetDeadline && (
            <div
              className={`flex items-center gap-1 font-mono text-[11px] tabular-nums shrink-0 ${
                deadlineInfo.isOverdue
                  ? 'text-rose-600 font-semibold'
                  : deadlineInfo.isDueSoon
                  ? 'text-amber-600 font-semibold'
                  : 'text-slate-500'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{deadlineInfo.text}</span>
            </div>
          )}
        </div>

        {/* Approved Certificate Callout */}
        {application.status === 'APPROVED' && application.certificateNo && (
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-lg p-2.5 space-y-0.5 text-xs">
            <div className="flex items-center justify-between text-emerald-800">
              <span className="font-semibold flex items-center gap-1">
                <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                CoC Certificate Granted
              </span>
              <span className="text-[11px] font-mono text-emerald-700">
                Exp: {formatDate(application.certificateExpiryDate)}
              </span>
            </div>
            <div className="font-mono text-xs font-semibold text-emerald-900 truncate">
              {application.certificateNo}
            </div>
          </div>
        )}

        {/* Action Items Checklist Container */}
        {incompleteItems.length > 0 && (
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-semibold flex items-center gap-1 text-[11px]">
                {activeActions.length > 0 ? (
                  <>
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>Action Required ({activeActions.length})</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span>Pending Statements ({pendingStatements.length})</span>
                  </>
                )}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                {activeActions.length > 0 ? 'Cytron Action' : 'External Follow-up'}
              </span>
            </div>

            <div className="space-y-1.5">
              {incompleteItems.slice(0, 2).map((action) => {
                const pInfo = getPriorityBadge(action.priority);
                const labelInfo = getActionLabelInfo(action);
                const isStmt = labelInfo.isPendingStatement;

                return (
                  <div
                    key={action.id}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-start gap-2 bg-white border border-slate-200/80 rounded-md p-2 shadow-2xs hover:border-slate-300 transition-colors"
                  >
                    {isStmt ? (
                      <div
                        className="mt-0.5 p-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200 shrink-0"
                        title={`Awaiting third party (${labelInfo.shortLabel}) — Cannot be ticked manually`}
                      >
                        <Clock className="w-3 h-3" />
                      </div>
                    ) : (
                      <input
                        type="checkbox"
                        checked={action.isCompleted}
                        onChange={() => onToggleActionItem(application.id, action.id)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                        title="Mark action as completed"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5 text-[10px]">
                        <span className="font-semibold text-slate-700">
                          {isStmt ? labelInfo.shortLabel : 'Action Required'}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className={`font-semibold ${action.priority === 'CRITICAL' ? 'text-rose-600' : 'text-slate-500'}`}>
                          {action.priority}
                        </span>
                        {action.autoResolvedByAi && (
                          <span className="inline-flex items-center gap-0.5 text-indigo-600 font-medium ml-auto">
                            <Bot className="w-2.5 h-2.5" /> AI Verified
                          </span>
                        )}
                        {action.dueDate && !action.autoResolvedByAi && (
                          <span className="text-slate-400 ml-auto font-mono tabular-nums">
                            {formatDate(action.dueDate)}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-slate-800 line-clamp-1 text-xs">{action.title}</p>
                    </div>
                  </div>
                );
              })}

              {incompleteItems.length > 2 && (
                <div className="text-[11px] text-slate-400 text-center font-medium pt-0.5">
                  +{incompleteItems.length - 2} more requirements
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer / Quick Actions */}
      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-500 truncate min-w-0">
          <a
            href={getGmailThreadUrl(application)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium hover:underline truncate"
            title={application.emailSubject || 'Open email thread'}
          >
            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">Thread</span>
            <ExternalLink className="w-2.5 h-2.5 text-slate-400 shrink-0" />
          </a>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="font-mono text-[11px] tabular-nums shrink-0 text-slate-400">
            {formatDate(application.lastActivityDate)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {incompleteItems.length > 0 && (
            <button
              onClick={() => onQuickDraftReply(application)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-md transition-colors shadow-2xs"
              title="Draft Official AI Reply"
            >
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>Draft</span>
            </button>
          )}

          <button
            onClick={() => onSelect(application)}
            className="px-2 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
          >
            Details
          </button>

          {onDelete && (
            <button
              onClick={(e) => onDelete(application.id, e)}
              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
              title="Delete application"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
