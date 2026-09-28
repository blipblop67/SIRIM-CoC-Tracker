import React from 'react';
import {
  Shield,
  FileCheck,
  AlertTriangle,
  Clock,
  User,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Calendar,
  Layers,
  CircleDot,
  FileSpreadsheet,
} from 'lucide-react';
import { SirimApplication, ActionItem } from '../types';
import {
  getStatusBadgeInfo,
  getPriorityBadge,
  getSchemeColor,
  calculateDeadlineInfo,
  formatDate,
  getGmailThreadUrl,
  getSupplierStatusBadgeInfo,
  getAssigneeBadgeInfo,
} from '../utils/formatters';
import { separateActionItems, getActionLabelInfo, isPendingStatement } from '../utils/actionItemUtils';
import { Mail, Trash2, Building2 } from 'lucide-react';

interface ApplicationCardProps {
  application: SirimApplication;
  currentUserEmail?: string;
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
      className={`group relative bg-white border rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between overflow-hidden ${
        criticalAction
          ? 'border-rose-300 ring-1 ring-rose-400/20'
          : application.status === 'APPROVED'
          ? 'border-emerald-200 ring-1 ring-emerald-400/10'
          : 'border-slate-200/90 hover:border-slate-300'
      }`}
    >
      {/* Top Banner: Status & Scheme */}
      <div className="p-4 pb-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Scheme pill */}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getSchemeColor(
                application.scheme
              )}`}
            >
              {application.scheme}
            </span>

            {/* My Task badge */}
            {isAssignedToMe && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 shadow-2xs">
                <User className="w-2.5 h-2.5" />
                <span>Your Task</span>
              </span>
            )}
          </div>

          {/* Status Badge */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {statusInfo.label}
          </span>
        </div>

        {/* Product & Model Header */}
        <div>
          <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
            {application.productName}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium">
            <span className="text-slate-700 font-mono font-semibold">{application.modelNumber}</span>
            <span>•</span>
            <span>{application.brand}</span>
          </div>
        </div>

        {/* Ref No Pill & SLA Target */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
            <span>{application.applicationRef}</span>
            <button
              onClick={copyRef}
              className="text-slate-400 hover:text-slate-700 transition-colors"
              title="Copy Reference"
            >
              {copiedRef ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>

          {application.targetDeadline && (
            <div
              className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                deadlineInfo.isOverdue
                  ? 'bg-rose-100 text-rose-700 font-semibold animate-pulse'
                  : deadlineInfo.isDueSoon
                  ? 'bg-amber-100 text-amber-800 font-semibold'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{deadlineInfo.text}</span>
            </div>
          )}
        </div>

        {/* Officer & Supplier Information */}
        <div className="space-y-1">
          {application.officerName && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                Officer: <strong className="text-slate-700">{application.officerName}</strong>
              </span>
            </div>
          )}

          {/* Supplier tracking pill */}
          {(application.supplierName || (application.supplierStatus && application.supplierStatus !== 'NOT_INVOLVED')) && (
            <div className="flex items-center justify-between gap-1 text-xs bg-slate-50 border border-slate-200/90 rounded px-2 py-1">
              <div className="flex items-center gap-1.5 min-w-0 text-slate-700 truncate">
                <Building2 className="w-3 h-3 text-purple-600 shrink-0" />
                <span className="font-medium truncate">{application.supplierName || 'Hardware Supplier'}</span>
              </div>
              {(() => {
                const suppBadge = getSupplierStatusBadgeInfo(application.supplierStatus);
                if (!suppBadge) return null;
                return (
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${suppBadge.bg} ${suppBadge.text} ${suppBadge.border}`}>
                    {suppBadge.shortLabel}
                  </span>
                );
              })()}
            </div>
          )}
        </div>

        {/* Approved Certificate Callout */}
        {application.status === 'APPROVED' && application.certificateNo && (
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-900 flex items-center gap-1">
                <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                CoC Granted
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">
                Exp: {formatDate(application.certificateExpiryDate)}
              </span>
            </div>
            <div className="font-mono text-xs font-bold text-emerald-800 truncate">
              {application.certificateNo}
            </div>
          </div>
        )}

        {/* Action Items & Pending Statements Box */}
        {incompleteItems.length > 0 && (
          <div
            className={`border rounded-lg p-2.5 space-y-2 ${
              activeActions.length > 0
                ? 'bg-amber-50/50 border-amber-200/80'
                : 'bg-purple-50/50 border-purple-200/80'
            }`}
          >
            {/* Header distinguishes Active Action vs Pending Statement */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold flex items-center gap-1.5">
                {activeActions.length > 0 ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-amber-900">
                      Action Required ({activeActions.length})
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span className="text-purple-900">
                      Pending Statement ({pendingStatements.length})
                    </span>
                  </>
                )}
              </span>

              <div className="flex items-center gap-1">
                {activeActions.length > 0 && pendingStatements.length > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200">
                    +{pendingStatements.length} waiting
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">
                  {activeActions.length > 0
                    ? 'Cytron Action'
                    : pendingStatements.some((a) => a.assignedTo === 'SUPPLIER')
                    ? 'Waiting on Supplier'
                    : pendingStatements.some((a) => a.assignedTo === 'SIRIM')
                    ? 'Waiting on SIRIM'
                    : 'Waiting on Lab'}
                </span>
              </div>
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
                    className={`flex items-start gap-2 text-xs p-2 rounded-lg border transition-all ${
                      isStmt
                        ? 'bg-white/95 border-purple-200/70 shadow-2xs'
                        : 'bg-white border-amber-200/80 shadow-2xs'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={action.isCompleted}
                      onChange={() => onToggleActionItem(application.id, action.id)}
                      className={`mt-0.5 h-3.5 w-3.5 rounded cursor-pointer ${
                        isStmt
                          ? 'border-purple-300 text-purple-600 focus:ring-purple-500'
                          : 'border-amber-300 text-amber-600 focus:ring-amber-500'
                      }`}
                      title={isStmt ? "Mark statement as resolved/received" : "Mark action as completed"}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${labelInfo.tagClass}`}
                        >
                          {isStmt ? labelInfo.shortLabel : 'Action Required'}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1 rounded border ${pInfo.bg} ${pInfo.text} ${pInfo.border}`}
                        >
                          {action.priority}
                        </span>
                        {action.dueDate && (
                          <span className="text-[10px] text-slate-500 ml-auto font-mono">
                            {formatDate(action.dueDate)}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-slate-800 line-clamp-1">{action.title}</p>
                    </div>
                  </div>
                );
              })}
              {incompleteItems.length > 2 && (
                <div className="text-[11px] text-slate-500 text-center font-medium pt-0.5">
                  +{incompleteItems.length - 2} more items
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer / Quick Actions */}
      <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0 truncate">
          <a
            href={getGmailThreadUrl(application)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-sky-600 hover:text-sky-800 hover:underline font-medium truncate"
            title={application.emailSubject ? `Open email: "${application.emailSubject}"` : 'Open in Gmail'}
          >
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{application.emailSubject ? 'Gmail Thread' : `${application.emailThreads.length} emails`}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
          </a>
          <span>•</span>
          <span className="shrink-0">{formatDate(application.lastActivityDate)}</span>
          {application.lastModifiedBy && (
            <>
              <span>•</span>
              <span className="shrink-0 text-slate-400 truncate max-w-[90px]" title={`Last updated by ${application.lastModifiedBy}`}>
                by {application.lastModifiedBy.split('@')[0]}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {incompleteItems.length > 0 && (
            <button
              onClick={() => onQuickDraftReply(application)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors shadow-2xs"
              title="Draft Official AI Reply to SIRIM"
            >
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>AI Reply</span>
            </button>
          )}

          <button
            onClick={() => onSelect(application)}
            className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-colors"
          >
            Details →
          </button>

          {onDelete && (
            <button
              onClick={(e) => onDelete(application.id, e)}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
              title="Delete this application record"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
