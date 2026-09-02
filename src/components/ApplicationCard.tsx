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
} from '../utils/formatters';
import { Mail } from 'lucide-react';

interface ApplicationCardProps {
  application: SirimApplication;
  onSelect: (app: SirimApplication) => void;
  onToggleActionItem: (appId: string, actionItemId: string) => void;
  onQuickDraftReply: (app: SirimApplication) => void;
}

export const ApplicationCard: React.FC<ApplicationCardProps> = ({
  application,
  onSelect,
  onToggleActionItem,
  onQuickDraftReply,
}) => {
  const [copiedRef, setCopiedRef] = React.useState(false);
  const statusInfo = getStatusBadgeInfo(application.status);
  const deadlineInfo = calculateDeadlineInfo(application.targetDeadline);

  const copyRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(application.applicationRef);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const pendingActions = application.actionItems.filter((a) => !a.isCompleted);
  const criticalAction = pendingActions.find((a) => a.priority === 'CRITICAL');

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
        <div className="flex items-start justify-between gap-2">
          {/* Scheme pill */}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getSchemeColor(
              application.scheme
            )}`}
          >
            {application.scheme}
          </span>

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

        {/* Officer Information */}
        {application.officerName && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              Officer: <strong className="text-slate-700">{application.officerName}</strong>
            </span>
          </div>
        )}

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

        {/* Pending Action Items Box */}
        {pendingActions.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Pending Actions ({pendingActions.length})
              </span>
              <span className="text-[11px] text-slate-500">
                {pendingActions.some((a) => a.assignedTo === 'APPLICANT') ? 'Cytron Action' : 'SIRIM Action'}
              </span>
            </div>

            <div className="space-y-1">
              {pendingActions.slice(0, 2).map((action) => {
                const pInfo = getPriorityBadge(action.priority);
                return (
                  <div
                    key={action.id}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-start gap-2 text-xs bg-white p-1.5 rounded border border-slate-200/80"
                  >
                    <input
                      type="checkbox"
                      checked={action.isCompleted}
                      onChange={() => onToggleActionItem(application.id, action.id)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 line-clamp-1">{action.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`text-[10px] font-bold px-1 rounded border ${pInfo.bg} ${pInfo.text} ${pInfo.border}`}
                        >
                          {action.priority}
                        </span>
                        {action.dueDate && (
                          <span className="text-[10px] text-slate-500">
                            Due: {formatDate(action.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {pendingActions.length > 2 && (
                <div className="text-[11px] text-slate-500 text-center font-medium">
                  +{pendingActions.length - 2} more action items
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
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {pendingActions.length > 0 && (
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
        </div>
      </div>
    </div>
  );
};
