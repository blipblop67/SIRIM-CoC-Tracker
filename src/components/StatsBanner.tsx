import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck,
  FileSpreadsheet,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { SirimApplication, SheetSyncConfig } from '../types';

interface StatsBannerProps {
  applications: SirimApplication[];
  sheetConfig: SheetSyncConfig | null;
  onFilterStatus: (status: string) => void;
  onOpenSheetModal: () => void;
}

export const StatsBanner: React.FC<StatsBannerProps> = ({
  applications,
  sheetConfig,
  onFilterStatus,
  onOpenSheetModal,
}) => {
  const total = applications.length;
  const actionRequiredList = applications.filter((app) =>
    ['RFI_ACTION_REQUIRED', 'SAMPLE_REQUESTED', 'PAYMENT_PENDING'].includes(app.status) ||
    app.actionItems.some((a) => !a.isCompleted && a.assignedTo === 'APPLICANT')
  );
  const inReviewList = applications.filter((app) =>
    ['SUBMITTED', 'UNDER_REVIEW', 'SAMPLE_SUBMITTED', 'TESTING_IN_PROGRESS', 'FINAL_EVALUATION'].includes(app.status)
  );
  const approvedList = applications.filter((app) => app.status === 'APPROVED');
  const criticalItems = applications.flatMap((a) => a.actionItems).filter((act) => !act.isCompleted && act.priority === 'CRITICAL');

  return (
    <section className="bg-white border border-slate-200 rounded-xl flex flex-wrap lg:flex-nowrap items-center px-8 py-6 gap-8 lg:gap-12 shadow-sm mb-6">
      <div 
        className="flex flex-col cursor-pointer group" 
        onClick={() => onFilterStatus('ALL')}
      >
        <span className="text-xs font-semibold text-slate-500 uppercase mb-1 group-hover:text-indigo-600 transition-colors">Active Applications</span>
        <span className="text-3xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{total}</span>
        <span className="text-xs text-emerald-600 mt-1 font-medium">Tracking processing</span>
      </div>

      <div 
        className="flex flex-col cursor-pointer group" 
        onClick={() => onFilterStatus('ACTION_REQUIRED')}
      >
        <span className="text-xs font-semibold text-slate-500 uppercase mb-1 group-hover:text-amber-600 transition-colors">Action Required</span>
        <span className="text-3xl font-bold text-amber-600">{actionRequiredList.length}</span>
        <span className="text-xs text-slate-400 mt-1">
          {criticalItems.length > 0 ? (
            <span className="text-rose-600 font-bold">{criticalItems.length} Critical</span>
          ) : 'Awaiting documentation'}
        </span>
      </div>

      <div 
        className="flex flex-col cursor-pointer group" 
        onClick={() => onFilterStatus('IN_PROGRESS')}
      >
        <span className="text-xs font-semibold text-slate-500 uppercase mb-1 group-hover:text-slate-700 transition-colors">Pending SIRIM / Lab</span>
        <span className="text-3xl font-bold text-slate-900">{inReviewList.length}</span>
        <span className="text-xs text-slate-400 mt-1">Under evaluation</span>
      </div>

      <div 
        className="flex flex-col cursor-pointer group" 
        onClick={() => onFilterStatus('APPROVED')}
      >
        <span className="text-xs font-semibold text-slate-500 uppercase mb-1 group-hover:text-emerald-700 transition-colors">Certificates Issued</span>
        <span className="text-3xl font-bold text-emerald-600">{approvedList.length}</span>
        <span className="text-xs text-slate-400 mt-1">Ready for purchase</span>
      </div>

      <div className="ml-auto w-full lg:w-auto bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex items-center gap-4">
        <div className="p-2 bg-indigo-600 rounded text-white shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
        </div>
        <div>
          <p className="text-sm font-bold text-indigo-900">Monitoring Active</p>
          <p className="text-xs text-indigo-700">Scanning email threads for updates...</p>
        </div>
      </div>
    </section>
  );
};
