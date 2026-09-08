import { SirimStatus, ActionItemPriority, CertificationScheme } from '../types';

export function getStatusBadgeInfo(status: SirimStatus): {
  label: string;
  bg: string;
  text: string;
  border: string;
  iconName: string;
} {
  switch (status) {
    case 'SUBMITTED':
      return {
        label: 'Submitted (Lodged)',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300',
        iconName: 'Send',
      };
    case 'UNDER_REVIEW':
      return {
        label: 'Document Review',
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        iconName: 'FileText',
      };
    case 'SAMPLE_REQUESTED':
      return {
        label: 'Sample Call Notice',
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-300',
        iconName: 'Box',
      };
    case 'SAMPLE_SUBMITTED':
      return {
        label: 'Sample Delivered',
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        iconName: 'PackageCheck',
      };
    case 'TESTING_IN_PROGRESS':
      return {
        label: 'Testing & Evaluation',
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        iconName: 'FlaskConical',
      };
    case 'RFI_ACTION_REQUIRED':
      return {
        label: 'RFI / Action Required',
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-300',
        iconName: 'AlertCircle',
      };
    case 'PAYMENT_PENDING':
      return {
        label: 'Payment Pending',
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-300',
        iconName: 'Receipt',
      };
    case 'FINAL_EVALUATION':
      return {
        label: 'Certification Panel',
        bg: 'bg-sky-50',
        text: 'text-sky-700',
        border: 'border-sky-200',
        iconName: 'Stamp',
      };
    case 'APPROVED':
      return {
        label: 'CoC Issued (Approved)',
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-300',
        iconName: 'CheckCircle2',
      };
    case 'REJECTED':
      return {
        label: 'Rejected',
        bg: 'bg-rose-50',
        text: 'text-rose-800',
        border: 'border-rose-300',
        iconName: 'XCircle',
      };
    case 'EXPIRED':
      return {
        label: 'Certificate Expired',
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        border: 'border-slate-300',
        iconName: 'Clock',
      };
    default:
      return {
        label: status,
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        border: 'border-slate-200',
        iconName: 'HelpCircle',
      };
  }
}

export function getPriorityBadge(priority: ActionItemPriority): {
  bg: string;
  text: string;
  border: string;
} {
  switch (priority) {
    case 'CRITICAL':
      return { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' };
    case 'HIGH':
      return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' };
    case 'MEDIUM':
      return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' };
    case 'LOW':
      return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
  }
}

export function getSchemeColor(scheme: CertificationScheme): string {
  switch (scheme) {
    case 'Type Approval (MCMC/SIRIM)':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Modular Approval':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'Special Approval':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Safety & EMC (MS Standards)':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'CIDB Certification':
      return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export function calculateDeadlineInfo(deadlineStr?: string): {
  text: string;
  isOverdue: boolean;
  isDueSoon: boolean;
  daysRemaining: number | null;
} {
  if (!deadlineStr) {
    return { text: 'No deadline', isOverdue: false, isDueSoon: false, daysRemaining: null };
  }

  const deadline = new Date(deadlineStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = deadline.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      text: `Overdue by ${Math.abs(diffDays)}d`,
      isOverdue: true,
      isDueSoon: false,
      daysRemaining: diffDays,
    };
  } else if (diffDays === 0) {
    return {
      text: 'Due Today',
      isOverdue: false,
      isDueSoon: true,
      daysRemaining: 0,
    };
  } else if (diffDays <= 3) {
    return {
      text: `Due in ${diffDays}d`,
      isOverdue: false,
      isDueSoon: true,
      daysRemaining: diffDays,
    };
  } else {
    return {
      text: `Due in ${diffDays}d`,
      isOverdue: false,
      isDueSoon: false,
      daysRemaining: diffDays,
    };
  }
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-MY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return dateStr;
  }
}

export function getSupplierStatusBadgeInfo(status?: 'NOT_INVOLVED' | 'WAITING_FOR_SUPPLIER_DOCS' | 'DOCUMENTS_RECEIVED_FROM_SUPPLIER' | 'DOCUMENTS_SUBMITTED_TO_SIRIM'): {
  label: string;
  bg: string;
  text: string;
  border: string;
  shortLabel: string;
} | null {
  if (!status || status === 'NOT_INVOLVED') return null;

  switch (status) {
    case 'WAITING_FOR_SUPPLIER_DOCS':
      return {
        label: 'Waiting for Supplier Docs',
        shortLabel: 'Pending Supplier',
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-300',
      };
    case 'DOCUMENTS_RECEIVED_FROM_SUPPLIER':
      return {
        label: 'Supplier Docs Received (Action: Submit to SIRIM)',
        shortLabel: 'Supplier Docs Ready',
        bg: 'bg-purple-50',
        text: 'text-purple-800',
        border: 'border-purple-300',
      };
    case 'DOCUMENTS_SUBMITTED_TO_SIRIM':
      return {
        label: 'Supplier Docs Submitted to SIRIM',
        shortLabel: 'Docs Forwarded',
        bg: 'bg-teal-50',
        text: 'text-teal-800',
        border: 'border-teal-300',
      };
  }
}

export function getAssigneeBadgeInfo(assignee: 'APPLICANT' | 'SIRIM' | 'LAB' | 'SUPPLIER'): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  switch (assignee) {
    case 'APPLICANT':
      return { label: 'Cytron Action', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
    case 'SUPPLIER':
      return { label: 'Supplier Action', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case 'SIRIM':
      return { label: 'SIRIM Action', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'LAB':
      return { label: 'Lab Action', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  }
}

export function getGmailThreadUrl(app: {
  threadId?: string;
  gmailThreadLink?: string;
  applicationRef?: string;
  emailSubject?: string;
  modelNumber?: string;
  productName?: string;
}): string {
  if (app.gmailThreadLink && app.gmailThreadLink.startsWith('http')) {
    return app.gmailThreadLink;
  }
  if (app.threadId && !app.threadId.startsWith('th_manual') && !app.threadId.startsWith('th_sirim')) {
    return `https://mail.google.com/mail/u/0/#all/${app.threadId}`;
  }
  const searchQuery = app.applicationRef || app.emailSubject || app.modelNumber || 'SIRIM';
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(searchQuery)}`;
}
