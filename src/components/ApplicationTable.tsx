import React from 'react';
import {
  FileCheck,
  Clock,
  Sparkles,
  ChevronRight,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react';
import { SirimApplication } from '../types';
import {
  getStatusBadgeInfo,
  getSchemeColor,
  calculateDeadlineInfo,
  formatDate,
} from '../utils/formatters';

interface ApplicationTableProps {
  applications: SirimApplication[];
  onSelect: (app: SirimApplication) => void;
  onQuickDraftReply: (app: SirimApplication) => void;
}

export const ApplicationTable: React.FC<ApplicationTableProps> = ({
  applications,
  onSelect,
  onQuickDraftReply,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, id: string, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider">
              <th className="py-3 px-4">Ref No / Status</th>
              <th className="py-3 px-4">Product & Model</th>
              <th className="py-3 px-4">Scheme</th>
              <th className="py-3 px-4">Officer</th>
              <th className="py-3 px-4">Pending Action Items</th>
              <th className="py-3 px-4">Target SLA</th>
              <th className="py-3 px-4">Certificate / Fee</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {applications.map((app) => {
              const statusInfo = getStatusBadgeInfo(app.status);
              const deadline = calculateDeadlineInfo(app.targetDeadline);
              const pendingActions = app.actionItems.filter((a) => !a.isCompleted);
              const hasCritical = pendingActions.some((a) => a.priority === 'CRITICAL');

              return (
                <tr
                  key={app.id}
                  onClick={() => onSelect(app)}
                  className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                >
                  {/* 1. Ref & Status */}
                  <td className="py-3 px-4 space-y-1">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      <span>{app.applicationRef}</span>
                      <button
                        onClick={(e) => handleCopy(e, app.id, app.applicationRef)}
                        className="text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy Reference"
                      >
                        {copiedId === app.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {statusInfo.label}
                      </span>
                    </div>
                  </td>

                  {/* 2. Product & Model */}
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                      {app.productName}
                    </div>
                    <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                      {app.modelNumber} • <span className="font-sans font-medium">{app.brand}</span>
                    </div>
                  </td>

                  {/* 3. Scheme */}
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getSchemeColor(
                        app.scheme
                      )}`}
                    >
                      {app.scheme}
                    </span>
                  </td>

                  {/* 4. Officer */}
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-800">{app.officerName || 'Not Assigned'}</div>
                    {app.officerEmail && (
                      <div className="text-slate-400 text-[11px] font-mono">{app.officerEmail}</div>
                    )}
                  </td>

                  {/* 5. Pending Action Items */}
                  <td className="py-3 px-4 max-w-xs">
                    {pendingActions.length > 0 ? (
                      <div className="space-y-1">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            hasCritical
                              ? 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {pendingActions.length} Pending (
                          {pendingActions[0].assignedTo === 'APPLICANT' ? 'Applicant' : 'SIRIM'})
                        </span>
                        <p className="text-[11px] text-slate-600 line-clamp-1 font-medium">
                          {pendingActions[0].title}
                        </p>
                      </div>
                    ) : (
                      <span className="text-emerald-700 font-medium text-[11px] flex items-center gap-1">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                        All Clear
                      </span>
                    )}
                  </td>

                  {/* 6. Target SLA */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {app.targetDeadline ? (
                      <div
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                          deadline.isOverdue
                            ? 'bg-rose-100 text-rose-700'
                            : deadline.isDueSoon
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>{deadline.text}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  {/* 7. Certificate / Fee */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {app.certificateNo ? (
                      <div className="font-mono text-[11px] font-bold text-emerald-700">
                        {app.certificateNo}
                      </div>
                    ) : app.processingFeeRm ? (
                      <div className="text-slate-700 font-medium">
                        RM {app.processingFeeRm.toLocaleString()}
                        <span
                          className={`ml-1.5 text-[10px] px-1 py-0.2 rounded ${
                            app.paymentStatus === 'PAID'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700 font-bold'
                          }`}
                        >
                          {app.paymentStatus}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  {/* 8. Actions */}
                  <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {pendingActions.length > 0 && (
                        <button
                          onClick={() => onQuickDraftReply(app)}
                          className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-semibold flex items-center gap-1 transition-colors"
                          title="Draft Official AI Reply"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Reply</span>
                        </button>
                      )}
                      <button
                        onClick={() => onSelect(app)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="View Details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
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
