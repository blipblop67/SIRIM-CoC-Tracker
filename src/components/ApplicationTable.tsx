import React from 'react';
import { displayApplicationRef } from '../utils/reference';
import {
  FileCheck,
  Clock,
  Sparkles,
  ChevronRight,
  AlertTriangle,
  Copy,
  Check,
  Mail,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { SirimApplication } from '../types';
import {
  getStatusBadgeInfo,
  calculateDeadlineInfo,
  formatDate,
  getGmailThreadUrl,
} from '../utils/formatters';
import { separateActionItems, getActionLabelInfo } from '../utils/actionItemUtils';

interface ApplicationTableProps {
  applications: SirimApplication[];
  currentUserEmail?: string;
  onSelect: (app: SirimApplication) => void;
  onQuickDraftReply: (app: SirimApplication) => void;
  onDelete?: (appId: string, e: React.MouseEvent) => void;
}

export const ApplicationTable: React.FC<ApplicationTableProps> = ({
  applications,
  currentUserEmail,
  onSelect,
  onQuickDraftReply,
  onDelete,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, id: string, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Ref / Status</th>
              <th className="py-3 px-4 font-semibold">Product & Model</th>
              <th className="py-3 px-4 font-semibold">Email Thread</th>
              <th className="py-3 px-4 font-semibold">Scheme</th>
              <th className="py-3 px-4 font-semibold">Officer</th>
              <th className="py-3 px-4 font-semibold">Active Requirements</th>
              <th className="py-3 px-4 font-semibold">Target SLA</th>
              <th className="py-3 px-4 font-semibold">Certificate / Fee</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {applications.map((app) => {
              const statusInfo = getStatusBadgeInfo(app.status);
              const deadline = calculateDeadlineInfo(app.targetDeadline);
              const incompleteItems = app.actionItems.filter((a) => !a.isCompleted);
              const { activeActions, pendingStatements } = separateActionItems(incompleteItems);
              const hasCritical = activeActions.some((a) => a.priority === 'CRITICAL');
              const emailSubject =
                app.emailSubject || app.emailThreads?.[app.emailThreads.length - 1]?.subject || `Ref: ${app.applicationRef}`;
              const gmailUrl = getGmailThreadUrl(app);

              return (
                <tr
                  key={app.id}
                  onClick={() => onSelect(app)}
                  className="hover:bg-slate-50/60 cursor-pointer transition-colors group"
                >
                  {/* 1. Ref & Status */}
                  <td className="py-3 px-4 space-y-1">
                    <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                      <span>{displayApplicationRef(app.applicationRef)}</span>
                      <button
                        onClick={(e) => handleCopy(e, app.id, app.applicationRef)}
                        className="text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                        title="Copy Reference"
                      >
                        {copiedId === app.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          app.status === 'APPROVED'
                            ? 'bg-emerald-500'
                            : app.status === 'RFI_ACTION_REQUIRED'
                            ? 'bg-rose-500'
                            : app.status === 'SAMPLE_REQUESTED' || app.status === 'PAYMENT_PENDING'
                            ? 'bg-amber-500'
                            : 'bg-indigo-500'
                        }`}
                      />
                      <span className="text-[11px] font-medium text-slate-700">{statusInfo.label}</span>
                    </div>
                  </td>

                  {/* 2. Product & Model */}
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                      {app.productName}
                    </div>
                    <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                      {app.modelNumber} <span className="text-slate-300 font-sans">·</span>{' '}
                      <span className="font-sans font-medium text-slate-600">{app.brand}</span>
                    </div>
                  </td>

                  {/* 3. Email Thread & Link */}
                  <td className="py-3 px-4 max-w-xs" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={gmailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="group/link flex items-start gap-1.5 text-slate-600 hover:text-slate-900"
                      title="Open thread in Gmail"
                    >
                      <Mail className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0 group-hover/link:text-slate-600" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium line-clamp-1 group-hover/link:underline">
                          {emailSubject}
                        </p>
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-600">
                          Open <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </a>
                  </td>

                  {/* 4. Scheme */}
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                    {app.scheme.replace(' (MCMC/SIRIM)', '').replace(' (MS Standards)', '')}
                  </td>

                  {/* 5. Officer */}
                  <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                    <span className="font-medium">{app.officerName || 'SIRIM Officer'}</span>
                  </td>

                  {/* 6. Active Requirements */}
                  <td className="py-3 px-4 max-w-xs">
                    {incompleteItems.length > 0 ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          {activeActions.length > 0 ? (
                            <span className="font-semibold text-rose-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-rose-500" />
                              {activeActions.length} Action{activeActions.length === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="font-semibold text-slate-600 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-indigo-500" />
                              {pendingStatements.length} Waiting
                            </span>
                          )}
                          {(() => {
                            const primaryItem = activeActions[0] || pendingStatements[0];
                            const labelInfo = getActionLabelInfo(primaryItem);
                            return (
                              <span className="text-[10px] text-slate-500">
                                · {labelInfo.shortLabel}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-1">
                          {(activeActions[0] || pendingStatements[0]).title}
                        </p>
                      </div>
                    ) : (
                      <span className="text-emerald-600 font-medium text-[11px] flex items-center gap-1">
                        <FileCheck className="w-3.5 h-3.5" />
                        All Clear
                      </span>
                    )}
                  </td>

                  {/* 7. Target SLA */}
                  <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums">
                    {app.targetDeadline ? (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          deadline.isOverdue
                            ? 'text-rose-600 font-semibold'
                            : deadline.isDueSoon
                            ? 'text-amber-600 font-semibold'
                            : 'text-slate-600'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {deadline.text}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  {/* 8. Certificate / Fee */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {app.certificateNo ? (
                      <span className="font-mono text-[11px] font-semibold text-emerald-700">
                        {app.certificateNo}
                      </span>
                    ) : app.processingFeeRm ? (
                      <span className="font-mono tabular-nums text-slate-700">
                        RM {app.processingFeeRm.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  {/* 9. Actions */}
                  <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {incompleteItems.length > 0 && (
                        <button
                          onClick={() => onQuickDraftReply(app)}
                          className="px-2 py-1 rounded text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-medium flex items-center gap-1 transition-colors"
                          title="Draft Reply"
                        >
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          <span>Draft</span>
                        </button>
                      )}
                      <button
                        onClick={() => onSelect(app)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        title="View Details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      {onDelete && (
                        <button
                          onClick={(e) => onDelete(app.id, e)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Delete application"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
