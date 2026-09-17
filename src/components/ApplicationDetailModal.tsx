import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Calendar,
  User,
  Mail,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileCheck,
  Send,
  Sparkles,
  Plus,
  Copy,
  Check,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Receipt,
  HelpCircle,
  ExternalLink,
  MessageSquare,
  Trash2,
  Building2,
  AlertCircle,
  Download,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  SirimApplication,
  ActionItem,
  ActionItemPriority,
  ActionAssignee,
  ActionItemType,
  SirimStatus,
  DocumentChecklistItem,
  DocumentChecklistStatus,
  EmailMessage,
  TimelineEvent,
} from '../types';
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
import { notificationAudio } from '../utils/audio';
import { getDefaultChecklistForScheme } from '../utils/documentChecklistDefaults';
import { DocumentPreScreenModal } from './DocumentPreScreenModal';

interface ApplicationDetailModalProps {
  application: SirimApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateApplication: (updatedApp: SirimApplication) => void;
  onDeleteApplication?: (appId: string) => void;
  accessToken?: string;
  initialTab?: 'actions' | 'checklist' | 'timeline' | 'emails' | 'ai-reply' | 'dossier';
}

export const ApplicationDetailModal: React.FC<ApplicationDetailModalProps> = ({
  application,
  isOpen,
  onClose,
  onUpdateApplication,
  onDeleteApplication,
  accessToken,
  initialTab = 'actions',
}) => {
  if (!isOpen || !application) return null;

  const [activeTab, setActiveTab] = useState<'actions' | 'checklist' | 'timeline' | 'emails' | 'ai-reply' | 'dossier'>(
    initialTab
  );

  // Pre-screen compliance scanner modal state
  const [isPreScreenModalOpen, setIsPreScreenModalOpen] = useState(false);

  // New action item form state
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionDesc, setNewActionDesc] = useState('');
  const [newActionAssignee, setNewActionAssignee] = useState<ActionAssignee>('APPLICANT');
  const [newActionPriority, setNewActionPriority] = useState<ActionItemPriority>('HIGH');
  const [newActionType, setNewActionType] = useState<ActionItemType>('SUBMIT_DOC');
  const [newActionDueDate, setNewActionDueDate] = useState('');

  // AI Reply Generator state
  const [recipientType, setRecipientType] = useState<'SIRIM' | 'SUPPLIER'>(
    application.actionItems.some((a) => !a.isCompleted && a.assignedTo === 'SUPPLIER') ||
    application.supplierStatus === 'WAITING_FOR_SUPPLIER_DOCS'
      ? 'SUPPLIER'
      : 'SIRIM'
  );
  const [targetSupplierName, setTargetSupplierName] = useState(application.supplierName || '');
  const [targetSupplierEmail, setTargetSupplierEmail] = useState(application.supplierEmail || '');
  const [replyIntent, setReplyIntent] = useState<string>(
    application.actionItems.some((a) => !a.isCompleted && a.assignedTo === 'SUPPLIER')
      ? 'REQUEST_SUPPLIER_DOCS'
      : 'SUBMIT_DOCS'
  );
  const [replyCustomNotes, setReplyCustomNotes] = useState('');
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<{
    subject: string;
    body: string;
    suggestedAttachments: string[];
  } | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

  // Direct Gmail Actions state
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [gmailActionStatus, setGmailActionStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    link?: string;
  } | null>(null);

  // Expanded email messages
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(
    application.emailThreads.length > 0 ? application.emailThreads[application.emailThreads.length - 1].id : null
  );

  const statusInfo = getStatusBadgeInfo(application.status);
  const deadlineInfo = calculateDeadlineInfo(application.targetDeadline);

  // Document Checklist computation
  const documentChecklist: DocumentChecklistItem[] =
    application.documentChecklist && application.documentChecklist.length > 0
      ? application.documentChecklist
      : getDefaultChecklistForScheme(application.scheme);

  const checklistProgress = {
    total: documentChecklist.length,
    completed: documentChecklist.filter(
      (d) => d.status === 'APPROVED_BY_SIRIM' || d.status === 'SUBMITTED_TO_SIRIM'
    ).length,
  };

  const handleUpdateChecklistItem = (itemId: string, newStatus: DocumentChecklistStatus, fileNotes?: string) => {
    const updatedList = documentChecklist.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status: newStatus,
            fileNotes: fileNotes !== undefined ? fileNotes : item.fileNotes,
            updatedAt: new Date().toISOString(),
          }
        : item
    );
    onUpdateApplication({
      ...application,
      documentChecklist: updatedList,
    });
  };

  // Supplier Follow-Up Chaser Cadence handler
  const handleLogSupplierChaser = () => {
    const today = new Date();
    const nextDueDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000); // 3-day SLA follow-up
    const todayStr = today.toISOString().split('T')[0];
    const nextDueStr = nextDueDate.toISOString().split('T')[0];
    const newCount = (application.supplierChaserCount || 0) + 1;

    onUpdateApplication({
      ...application,
      supplierLastContactDate: todayStr,
      supplierChaserDueDate: nextDueStr,
      supplierChaserCount: newCount,
      supplierStatus: 'WAITING_FOR_SUPPLIER_DOCS',
      timeline: [
        ...application.timeline,
        {
          id: `tl-chaser-${Date.now()}`,
          timestamp: new Date().toISOString(),
          title: `Supplier Follow-Up / Chaser #${newCount} Logged`,
          description: `Follow-up logged for ${application.supplierName || 'Hardware Supplier'}. Next SLA check scheduled for ${nextDueStr}.`,
          type: 'STATUS_CHANGE',
          actor: 'Applicant',
        },
      ],
    });
    notificationAudio.playSuccessTone();
  };

  // Step pipeline logic
  const stages = [
    { key: 'SUBMITTED', name: '1. Lodgement (e-ComM)', desc: 'Application registered' },
    { key: 'UNDER_REVIEW', name: '2. Document Screening', desc: 'Standards check' },
    { key: 'SAMPLE_TESTING', name: '3. Sample & Radiated Test', desc: 'Physical verification' },
    { key: 'EVALUATION', name: '4. Technical Evaluation', desc: 'RFI / Engineering review' },
    { key: 'APPROVED', name: '5. Panel Endorsement & CoC', desc: 'Certificate granted' },
  ];

  const getStageIndex = (status: SirimStatus): number => {
    switch (status) {
      case 'SUBMITTED':
        return 0;
      case 'UNDER_REVIEW':
        return 1;
      case 'SAMPLE_REQUESTED':
      case 'SAMPLE_SUBMITTED':
      case 'TESTING_IN_PROGRESS':
        return 2;
      case 'RFI_ACTION_REQUIRED':
      case 'PAYMENT_PENDING':
      case 'FINAL_EVALUATION':
        return 3;
      case 'APPROVED':
        return 4;
      default:
        return 1;
    }
  };

  const currentStageIndex = getStageIndex(application.status);

  // Action toggle handler
  const handleToggleAction = (actionId: string) => {
    const updatedActions = application.actionItems.map((a) => {
      if (a.id === actionId) {
        const nextState = !a.isCompleted;
        if (nextState) {
          notificationAudio.playSuccessTone();
        }
        return {
          ...a,
          isCompleted: nextState,
          completedAt: nextState ? new Date().toISOString() : undefined,
        };
      }
      return a;
    });

    onUpdateApplication({
      ...application,
      actionItems: updatedActions,
    });
  };

  // Add Action Item
  const handleAddAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActionTitle.trim()) return;

    const newAction: ActionItem = {
      id: `act-custom-${Date.now()}`,
      title: newActionTitle.trim(),
      description: newActionDesc.trim() || newActionTitle.trim(),
      assignedTo: newActionAssignee,
      priority: newActionPriority,
      requiredActionType: newActionType,
      dueDate: newActionDueDate || undefined,
      isCompleted: false,
    };

    onUpdateApplication({
      ...application,
      actionItems: [...application.actionItems, newAction],
    });

    setNewActionTitle('');
    setNewActionDesc('');
    setShowAddAction(false);
  };

  // Quick generate AI reply
  const handleGenerateAiReply = async () => {
    setIsGeneratingReply(true);
    setGeneratedDraft(null);

    try {
      const pendingItems = application.actionItems
        .filter((a) => !a.isCompleted)
        .map((a) => a.title)
        .join(', ');

      const res = await fetch('/api/gemini/generate-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationRef: application.applicationRef,
          productName: application.productName,
          modelNumber: application.modelNumber,
          officerName: application.officerName || 'Officer in charge',
          recipientType,
          supplierName: targetSupplierName,
          supplierEmail: targetSupplierEmail,
          responseIntent: replyIntent,
          customNotes: replyCustomNotes,
          actionItemDetails: pendingItems,
        }),
      });

      const data = await res.json();
      if (data.success && data.draft) {
        setGeneratedDraft(data.draft);
        notificationAudio.playAlertTone();
      } else {
        alert(data.error || 'Failed to generate reply draft.');
      }
    } catch (err) {
      console.error(err);
      alert('Error generating reply. Check server logs.');
    } finally {
      setIsGeneratingReply(false);
    }
  };

  const copyDraftToClipboard = () => {
    if (!generatedDraft) return;
    const fullText = `Subject: ${generatedDraft.subject}\n\n${generatedDraft.body}\n\nSuggested Attachments:\n${generatedDraft.suggestedAttachments.map((a) => `• ${a}`).join('\n')}`;
    navigator.clipboard.writeText(fullText);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const handleCreateGmailDraft = async () => {
    if (!generatedDraft) return;
    const targetEmail =
      recipientType === 'SUPPLIER'
        ? (targetSupplierEmail || application.supplierEmail || '')
        : (application.officerEmail || 'cmcs@sirim.my');

    if (!targetEmail) {
      setGmailActionStatus({
        type: 'error',
        message: 'Please provide a valid recipient email address.',
      });
      return;
    }

    setIsCreatingDraft(true);
    setGmailActionStatus(null);
    try {
      const res = await fetch('/api/gmail/create-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          to: targetEmail,
          subject: generatedDraft.subject,
          body: generatedDraft.body,
          threadId: application.threadId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGmailActionStatus({
          type: 'success',
          message: 'Draft successfully created in your Gmail inbox!',
          link: data.gmailUrl,
        });
        notificationAudio.playSuccessTone();
      } else {
        throw new Error(data.details || data.error || 'Failed to create draft');
      }
    } catch (err: any) {
      setGmailActionStatus({
        type: 'error',
        message: err?.message || 'Could not create draft in Gmail.',
      });
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleSendGmailEmail = async () => {
    if (!generatedDraft) return;
    const targetEmail =
      recipientType === 'SUPPLIER'
        ? (targetSupplierEmail || application.supplierEmail || '')
        : (application.officerEmail || 'cmcs@sirim.my');

    if (!targetEmail) {
      setGmailActionStatus({
        type: 'error',
        message: 'Please provide a valid recipient email address.',
      });
      return;
    }

    const confirmed = window.confirm(
      `Send this official email directly to ${targetEmail} from your connected Gmail account?`
    );
    if (!confirmed) return;

    setIsSendingEmail(true);
    setGmailActionStatus(null);
    try {
      const res = await fetch('/api/gmail/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          to: targetEmail,
          subject: generatedDraft.subject,
          body: generatedDraft.body,
          threadId: application.threadId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGmailActionStatus({
          type: 'success',
          message: `Official email sent to ${targetEmail}!`,
        });
        notificationAudio.playSuccessTone();

        // Append to application timeline & email threads
        const now = new Date().toISOString();
        const newEmail: EmailMessage = {
          id: `sent-${Date.now()}`,
          messageId: `sent-${Date.now()}`,
          from: 'Me (Applicant Compliance Lead)',
          to: targetEmail,
          date: now,
          subject: generatedDraft.subject,
          snippet: generatedDraft.body.slice(0, 120),
          bodyText: generatedDraft.body,
          hasAttachments: generatedDraft.suggestedAttachments.length > 0,
          attachmentNames: generatedDraft.suggestedAttachments,
          senderRole: 'APPLICANT',
        };
        const newTimeline: TimelineEvent = {
          id: `tl-${Date.now()}`,
          date: now,
          title: `Official Email Sent: ${generatedDraft.subject}`,
          description: `Dispatched via Gmail to ${targetEmail}`,
          sender: 'Me (Compliance)',
          type: 'status_change',
          senderRole: 'APPLICANT',
        };

        onUpdateApplication({
          ...application,
          emailThreads: [...application.emailThreads, newEmail],
          timeline: [...application.timeline, newTimeline],
          lastActivityDate: now.split('T')[0],
        });
      } else {
        throw new Error(data.details || data.error || 'Failed to send email');
      }
    } catch (err: any) {
      setGmailActionStatus({
        type: 'error',
        message: err?.message || 'Could not send email via Gmail.',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-slate-900 text-white flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getSchemeColor(
                  application.scheme
                )}`}
              >
                {application.scheme}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {statusInfo.label}
              </span>
              <span className="font-mono text-xs font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                {application.applicationRef}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
              {application.productName}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span>Model: <strong className="font-mono text-white">{application.modelNumber}</strong></span>
              <span>•</span>
              <span>Brand: <strong>{application.brand}</strong></span>
              <span>•</span>
              <span>Applicant: <strong>{application.applicant}</strong></span>
              {(application.supplierName || (application.supplierStatus && application.supplierStatus !== 'NOT_INVOLVED')) && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-purple-300">
                    <Building2 className="w-3.5 h-3.5" />
                    Supplier: <strong className="text-white">{application.supplierName || 'Hardware ODM'}</strong>
                    {(() => {
                      const sb = getSupplierStatusBadgeInfo(application.supplierStatus);
                      return sb ? <span className="ml-1 text-[10px] bg-purple-900/90 text-purple-200 px-1.5 py-0.2 rounded border border-purple-700">{sb.shortLabel}</span> : null;
                    })()}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onDeleteApplication && (
              <button
                onClick={() => onDeleteApplication(application.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 text-xs font-semibold transition-colors"
                title="Delete this application record from tracker"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-300" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}

            <a
              href={getGmailThreadUrl(application)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition-colors"
              title="Open the corresponding email thread or search in Gmail"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Open in Gmail</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 5-Stage Stepper Progress Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            SIRIM CoC Regulatory Pipeline
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {stages.map((st, idx) => {
              const isPast = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              const isFuture = idx > currentStageIndex;

              return (
                <div
                  key={st.key}
                  className={`p-2 rounded-lg text-center transition-all ${
                    isPast
                      ? 'bg-emerald-100/70 border border-emerald-300 text-emerald-900'
                      : isCurrent
                      ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400/40'
                      : 'bg-white border border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-center mb-0.5">
                    {isPast ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    ) : isCurrent ? (
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <div className="text-[11px] font-bold truncate leading-tight">{st.name}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 sm:px-6 border-b border-slate-200 bg-white shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('actions')}
            className={`flex items-center gap-1.5 py-3 px-3 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'actions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Action Items</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
              {application.actionItems.filter((a) => !a.isCompleted).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('checklist')}
            className={`flex items-center gap-1.5 py-3 px-3 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'checklist'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck className="w-4 h-4 text-emerald-600" />
            <span>Scheme Checklist</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
              {checklistProgress.completed}/{checklistProgress.total}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-1.5 py-3 px-3 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4 text-indigo-500" />
            <span>Audit Timeline</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
              {application.timeline.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('emails')}
            className={`flex items-center gap-1.5 py-3 px-3 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'emails'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Mail className="w-4 h-4 text-sky-500" />
            <span>Email Threads</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
              {application.emailThreads.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ai-reply')}
            className={`flex items-center gap-1.5 py-3 px-3 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'ai-reply'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>AI Reply Drafter</span>
          </button>

          <button
            onClick={() => setActiveTab('dossier')}
            className={`flex items-center gap-1.5 py-3 px-3 border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'dossier'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Dossier & Certificate</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {/* TAB 1: ACTION ITEMS */}
          {activeTab === 'actions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Pending Action Items & Tasks</h4>
                  <p className="text-xs text-slate-500">
                    Extracted from SIRIM QAS queries, evaluation requirements, and invoices.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddAction(!showAddAction)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Action</span>
                </button>
              </div>

              {/* Add Action Item Subform */}
              {showAddAction && (
                <form
                  onSubmit={handleAddAction}
                  className="bg-white border border-blue-200 rounded-xl p-4 space-y-3 shadow-xs"
                >
                  <h5 className="text-xs font-bold text-blue-900">New Action Item</h5>
                  <div>
                    <input
                      type="text"
                      placeholder="Title (e.g. Upload revised RF report appendix)"
                      value={newActionTitle}
                      onChange={(e) => setNewActionTitle(e.target.value)}
                      required
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <textarea
                      placeholder="Detailed instructions or context from SIRIM..."
                      value={newActionDesc}
                      onChange={(e) => setNewActionDesc(e.target.value)}
                      rows={2}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Assignee</label>
                      <select
                        value={newActionAssignee}
                        onChange={(e) => setNewActionAssignee(e.target.value as ActionAssignee)}
                        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="APPLICANT">Cytron / Applicant</option>
                        <option value="SUPPLIER">Hardware Supplier / ODM</option>
                        <option value="SIRIM">SIRIM QAS Officer</option>
                        <option value="LAB">Test Lab</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Priority</label>
                      <select
                        value={newActionPriority}
                        onChange={(e) => setNewActionPriority(e.target.value as ActionItemPriority)}
                        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="CRITICAL">Critical</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Action Type</label>
                      <select
                        value={newActionType}
                        onChange={(e) => setNewActionType(e.target.value as ActionItemType)}
                        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="SUBMIT_DOC">Submit Document</option>
                        <option value="PAY_FEE">Pay Fee</option>
                        <option value="SEND_SAMPLE">Send Sample</option>
                        <option value="PROVIDE_CLARIFICATION">Provide Clarification</option>
                        <option value="AWAIT_SIRIM">Await SIRIM</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Due Date</label>
                      <input
                        type="date"
                        value={newActionDueDate}
                        onChange={(e) => setNewActionDueDate(e.target.value)}
                        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddAction(false)}
                      className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs"
                    >
                      Save Item
                    </button>
                  </div>
                </form>
              )}

              {/* Action items list */}
              <div className="space-y-2.5">
                {application.actionItems.map((action) => {
                  const pBadge = getPriorityBadge(action.priority);
                  return (
                    <div
                      key={action.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        action.isCompleted
                          ? 'bg-slate-100/80 border-slate-200 opacity-75'
                          : action.priority === 'CRITICAL'
                          ? 'bg-white border-rose-300 ring-1 ring-rose-400/20'
                          : 'bg-white border-slate-200 shadow-xs'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={action.isCompleted}
                          onChange={() => handleToggleAction(action.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h5
                              className={`text-xs sm:text-sm font-bold ${
                                action.isCompleted
                                  ? 'line-through text-slate-500'
                                  : 'text-slate-900'
                              }`}
                            >
                              {action.title}
                            </h5>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${pBadge.bg} ${pBadge.text} ${pBadge.border}`}
                              >
                                {action.priority}
                              </span>
                              {(() => {
                                const aInfo = getAssigneeBadgeInfo(action.assignedTo);
                                return (
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${aInfo.bg} ${aInfo.text} ${aInfo.border}`}>
                                    {aInfo.label}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed">
                            {action.description}
                          </p>

                          {action.emailSourceSnippet && (
                            <div className="bg-slate-50 border-l-2 border-amber-400 p-2 text-[11px] text-slate-600 rounded-r mt-1 italic">
                              "{action.emailSourceSnippet}"
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                            <div className="flex items-center gap-2">
                              {action.dueDate && (
                                <span className="flex items-center gap-1 font-medium text-slate-700">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  Target SLA: {formatDate(action.dueDate)}
                                </span>
                              )}
                              {action.completedAt && (
                                <span className="text-emerald-700 font-medium">
                                  ✓ Completed on {formatDate(action.completedAt)}
                                </span>
                              )}
                            </div>

                            {!action.isCompleted && (
                              <button
                                onClick={() => {
                                  setActiveTab('ai-reply');
                                  setReplyCustomNotes(action.title);
                                }}
                                className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>Draft Reply for this</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: SCHEME CHECKLIST */}
          {activeTab === 'checklist' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">
                      {application.scheme} Dossier Checklist
                    </h4>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                      {checklistProgress.completed} of {checklistProgress.total} Ready ({Math.round((checklistProgress.completed / (checklistProgress.total || 1)) * 100)}%)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Malaysian SIRIM QAS / MCMC mandatory compliance artifacts for this scheme.
                  </p>
                </div>

                <button
                  onClick={() => setIsPreScreenModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                  <span>Pre-Screen Test Report (AI)</span>
                </button>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{
                    width: `${Math.round((checklistProgress.completed / (checklistProgress.total || 1)) * 100)}%`,
                  }}
                />
              </div>

              {/* Document Cards */}
              <div className="space-y-2.5">
                {documentChecklist.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 bg-white border rounded-xl transition-all shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      item.status === 'APPROVED_BY_SIRIM'
                        ? 'border-emerald-200 bg-emerald-50/20'
                        : item.status === 'REJECTED'
                        ? 'border-rose-200 bg-rose-50/20'
                        : item.status === 'REQUESTED_FROM_SUPPLIER'
                        ? 'border-purple-200 bg-purple-50/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            item.category === 'TEST_REPORT'
                              ? 'bg-blue-100 text-blue-800'
                              : item.category === 'TECHNICAL'
                              ? 'bg-slate-100 text-slate-800'
                              : item.category === 'LEGAL_ADMIN'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.category.replace('_', ' ')}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{item.name}</span>
                        {item.requiredForSchemes?.includes(application.scheme) && (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 leading-normal">{item.description}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={item.status}
                        onChange={(e) =>
                          handleUpdateChecklistItem(item.id, e.target.value as DocumentChecklistStatus)
                        }
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border focus:ring-2 focus:ring-indigo-500/20 ${
                          item.status === 'APPROVED_BY_SIRIM'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : item.status === 'SUBMITTED_TO_SIRIM'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : item.status === 'RECEIVED_FROM_SUPPLIER'
                            ? 'bg-sky-50 text-sky-800 border-sky-300'
                            : item.status === 'REQUESTED_FROM_SUPPLIER'
                            ? 'bg-purple-50 text-purple-800 border-purple-300'
                            : item.status === 'REJECTED'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                      >
                        <option value="NOT_STARTED">Not Started</option>
                        <option value="REQUESTED_FROM_SUPPLIER">Requested from Supplier</option>
                        <option value="RECEIVED_FROM_SUPPLIER">Received from Supplier</option>
                        <option value="SUBMITTED_TO_SIRIM">Submitted to SIRIM</option>
                        <option value="APPROVED_BY_SIRIM">Approved by SIRIM QAS</option>
                        <option value="REJECTED">Query / Rejected</option>
                      </select>

                      {item.category === 'TEST_REPORT' && (
                        <button
                          onClick={() => setIsPreScreenModalOpen(true)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-200"
                          title="Pre-Screen this test report with AI Scanner"
                        >
                          <Sparkles className="w-4 h-4 text-indigo-500" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: AUDIT TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Regulatory Timeline & History</h4>
                  <p className="text-xs text-slate-500">
                    Chronological milestone ledger from submission to certificate issuance.
                  </p>
                </div>
              </div>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {application.timeline.map((event, idx) => (
                  <div key={event.id} className="relative group">
                    {/* Circle Node */}
                    <div
                      className={`absolute -left-6 top-1 w-5 h-5 rounded-full ring-4 ring-white flex items-center justify-center ${
                        event.type === 'approval'
                          ? 'bg-emerald-600 text-white'
                          : event.type === 'rfi'
                          ? 'bg-rose-500 text-white'
                          : event.type === 'payment'
                          ? 'bg-amber-500 text-white'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h5 className="text-xs sm:text-sm font-bold text-slate-900">
                          {event.title}
                        </h5>
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {formatDate(event.date)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600">{event.description}</p>

                      {event.emailSubject && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono pt-1">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{event.emailSubject}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: EMAIL THREADS EXPLORER */}
          {activeTab === 'emails' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 bg-sky-50 border border-sky-100 rounded-xl">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950">
                    <Mail className="w-4 h-4 text-sky-600 shrink-0" />
                    <span className="truncate">
                      {application.emailSubject || `Thread: ${application.applicationRef}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-sky-700">
                    Thread ID: <code className="font-mono bg-sky-100/80 px-1 py-0.5 rounded text-sky-900">{application.threadId}</code>
                  </p>
                </div>

                <a
                  href={getGmailThreadUrl(application)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shrink-0 transition-colors shadow-xs"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Open Thread in Gmail</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900">Email Correspondence Threads</h4>
                <p className="text-xs text-slate-500">
                  Full incoming and outgoing communications linked to Ref {application.applicationRef}.
                </p>
              </div>

              <div className="space-y-3">
                {application.emailThreads.map((email) => {
                  const isExpanded = expandedEmailId === email.id;
                  return (
                    <div
                      key={email.id}
                      className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
                    >
                      <div
                        onClick={() => setExpandedEmailId(isExpanded ? null : email.id)}
                        className="p-4 cursor-pointer hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {email.from}
                            </span>
                            {email.senderRole && email.senderRole !== 'UNKNOWN' && (
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${
                                  email.senderRole === 'SUPPLIER'
                                    ? 'bg-purple-100 text-purple-800 border-purple-200'
                                    : email.senderRole === 'SIRIM_OFFICER'
                                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                                    : email.senderRole === 'APPLICANT'
                                    ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                                }`}
                              >
                                {email.senderRole === 'SUPPLIER'
                                  ? 'Supplier / ODM'
                                  : email.senderRole === 'SIRIM_OFFICER'
                                  ? 'SIRIM QAS'
                                  : email.senderRole === 'APPLICANT'
                                  ? 'Applicant'
                                  : 'Test Lab'}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400">→</span>
                            <span className="text-xs text-slate-600 truncate">{email.to}</span>
                          </div>
                          <h5 className="text-xs font-semibold text-slate-800">{email.subject}</h5>
                          {!isExpanded && (
                            <p className="text-xs text-slate-500 line-clamp-1">{email.snippet}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-slate-400 font-medium">
                            {formatDate(email.date)}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-4 pt-2 border-t border-slate-100 bg-slate-50/60 space-y-3">
                          <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {email.bodyText || email.snippet}
                          </div>

                          {email.hasAttachments && email.attachmentNames && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-slate-500 font-semibold flex items-center gap-1">
                                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                                Attachments:
                              </span>
                              {email.attachmentNames.map((att, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 rounded bg-slate-200 text-slate-800 font-mono text-[11px]"
                                >
                                  {att}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => {
                                setActiveTab('ai-reply');
                                setReplyCustomNotes(`Regarding email from ${email.from}: ${email.subject}`);
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Draft Reply with AI</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: AI REPLY DRAFTER */}
          {activeTab === 'ai-reply' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Gemini AI Official Communications Drafter
                </h4>
                <p className="text-xs text-slate-500">
                  Generate polite, technical, and regulatory-compliant emails for either SIRIM QAS Officers or Hardware Suppliers / ODMs.
                </p>
              </div>

              {/* Recipient Target Toggle */}
              <div className="flex items-center gap-2 p-1 bg-slate-200/80 rounded-lg max-w-md">
                <button
                  type="button"
                  onClick={() => {
                    setRecipientType('SIRIM');
                    setReplyIntent('SUBMIT_DOCS');
                  }}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-md transition-all ${
                    recipientType === 'SIRIM'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Draft to SIRIM Officer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecipientType('SUPPLIER');
                    setReplyIntent('REQUEST_SUPPLIER_DOCS');
                  }}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1 ${
                    recipientType === 'SUPPLIER'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Draft to Hardware Supplier</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                {recipientType === 'SIRIM' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        SIRIM Response Intent
                      </label>
                      <select
                        value={replyIntent}
                        onChange={(e) => setReplyIntent(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        <option value="SUBMIT_DOCS">Submit Requested Documents / Test Annex</option>
                        <option value="REQUEST_EXTENSION">Request SLA Extension (7 / 14 Days)</option>
                        <option value="STATUS_FOLLOWUP">Polite Status Follow-up / Panel Inquest</option>
                        <option value="SAMPLE_TRACKING">Provide Courier Tracking & Test Sample Guide</option>
                        <option value="PAYMENT_PROOF">Submit Payment Proof / FPX Receipt</option>
                        <option value="CUSTOM">Custom Regulatory Query</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Target SIRIM Officer
                      </label>
                      <input
                        type="text"
                        defaultValue={application.officerName || 'SIRIM QAS Certification Section'}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-slate-50"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Supplier Action Request
                      </label>
                      <select
                        value={replyIntent}
                        onChange={(e) => setReplyIntent(e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-purple-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                      >
                        <option value="REQUEST_SUPPLIER_DOCS">Request Test Reports / Schematic / DoC</option>
                        <option value="FOLLOWUP_URGENT_DOCS">Urgent: SIRIM Deadline Approaching</option>
                        <option value="CLARIFY_SPEC">Clarify RF Spec / Antenna Gain / Lab Accreditation</option>
                        <option value="CONFIRM_DOCS_RECEIVED">Confirm Receipt & Lodged with SIRIM</option>
                        <option value="CUSTOM">Custom Supplier Inquiry</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Supplier / ODM Company
                      </label>
                      <input
                        type="text"
                        value={targetSupplierName}
                        onChange={(e) => setTargetSupplierName(e.target.value)}
                        placeholder="e.g. Shenzhen Espressif Tech"
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Supplier Contact Email
                      </label>
                      <input
                        type="email"
                        value={targetSupplierEmail}
                        onChange={(e) => setTargetSupplierEmail(e.target.value)}
                        placeholder="e.g. export@supplier.com"
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Specific Notes / Instructions for AI ({recipientType === 'SUPPLIER' ? 'to supplier' : 'to SIRIM'})
                  </label>
                  <textarea
                    rows={2}
                    value={replyCustomNotes}
                    onChange={(e) => setReplyCustomNotes(e.target.value)}
                    placeholder={
                      recipientType === 'SUPPLIER'
                        ? 'E.g. Ask for unredacted ETSI EN 300 328 test report with ILAC-MRA stamp, and antenna peak gain statement...'
                        : 'E.g. Mention that revised ETSI EN 300 328 laboratory accreditation annex and peak antenna gain certificate are attached...'
                    }
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleGenerateAiReply}
                    disabled={isGeneratingReply}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md transition-all disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isGeneratingReply ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingReply ? 'Generating with Gemini AI...' : 'Generate Official Draft'}</span>
                  </button>
                </div>
              </div>

              {/* Generated Result */}
              {generatedDraft && (
                <div className="bg-white border border-blue-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-md ring-1 ring-blue-500/20">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Generated Official Reply
                    </span>
                    <button
                      onClick={copyDraftToClipboard}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      {copiedDraft ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy to Clipboard</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Subject Line</span>
                    <div className="font-mono text-xs font-bold text-slate-900 bg-slate-50 p-2 rounded border border-slate-200">
                      {generatedDraft.subject}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Email Body</span>
                    <div className="text-xs text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                      {generatedDraft.body}
                    </div>
                  </div>

                  {generatedDraft.suggestedAttachments.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                        Suggested Attachments Checklist
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {generatedDraft.suggestedAttachments.map((att, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200 text-xs font-medium"
                          >
                            <Paperclip className="w-3 h-3 text-blue-500" />
                            {att}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gmail Integration Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={handleCreateGmailDraft}
                      disabled={isCreatingDraft || isSendingEmail}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      title="Create this draft directly in your connected Gmail inbox"
                    >
                      <Mail className="w-3.5 h-3.5 text-sky-600" />
                      <span>{isCreatingDraft ? 'Creating Draft in Gmail...' : 'Create Draft in Gmail'}</span>
                    </button>

                    <button
                      onClick={handleSendGmailEmail}
                      disabled={isCreatingDraft || isSendingEmail}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                      title="Send email immediately via your connected Gmail account"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingEmail ? 'Sending via Gmail...' : 'Send Official Email Now'}</span>
                    </button>

                    <a
                      href={
                        application.gmailThreadLink ||
                        `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(application.applicationRef)}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors ml-auto"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Thread in Gmail</span>
                    </a>
                  </div>

                  {gmailActionStatus && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                        gmailActionStatus.type === 'success'
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          : 'bg-rose-50 text-rose-900 border-rose-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {gmailActionStatus.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span className="font-semibold">{gmailActionStatus.message}</span>
                      </div>
                      {gmailActionStatus.link && (
                        <a
                          href={gmailActionStatus.link}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 transition-colors shrink-0 flex items-center gap-1"
                        >
                          <span>Open in Gmail ↗</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DOSSIER & CERTIFICATE SPECS */}
          {activeTab === 'dossier' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Certificate Section */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Certificate of Conformity (CoC) Details
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Certificate Status</span>
                      <span className="font-semibold text-slate-800">
                        {application.status === 'APPROVED' ? 'Granted / Active' : 'Pending Certification'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Certificate No</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {application.certificateNo || 'Not yet issued'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Validity Period</span>
                      <span className="font-medium text-slate-800">
                        {application.certificateExpiryDate
                          ? `Valid until ${formatDate(application.certificateExpiryDate)}`
                          : '-'}
                      </span>
                    </div>

                    {/* Renewal Watchdog Status */}
                    {application.certificateExpiryDate && (() => {
                      const exp = new Date(application.certificateExpiryDate);
                      const now = new Date();
                      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      const isExpired = diffDays < 0;
                      const isDueSoon = diffDays >= 0 && diffDays <= 90;

                      return (
                        <div
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 mt-2 ${
                            isExpired
                              ? 'bg-rose-50 border-rose-200 text-rose-900'
                              : isDueSoon
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {isExpired ? (
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            ) : isDueSoon ? (
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            )}
                            <div>
                              <div className="font-bold text-[11px]">
                                {isExpired
                                  ? 'CoC Expired'
                                  : isDueSoon
                                  ? `Renewal Due in ${diffDays} days`
                                  : `CoC Active (${diffDays} days remaining)`}
                              </div>
                              <div className="text-[10px] text-slate-600">
                                {isDueSoon
                                  ? 'SIRIM requires renewal lodgement ≥ 60 days before expiry.'
                                  : isExpired
                                  ? 'Re-certification or renewal submission required.'
                                  : 'Compliant with Malaysian regulatory standards.'}
                              </div>
                            </div>
                          </div>

                          {(isDueSoon || isExpired) && (
                            <button
                              onClick={() => {
                                setActiveTab('ai-reply');
                                setRecipientType('SIRIM');
                                setReplyIntent('SUBMIT_DOCS');
                                setReplyCustomNotes(`Drafting renewal application for Certificate No: ${application.certificateNo}`);
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-2xs text-slate-800 transition-colors shrink-0"
                            >
                              Draft Renewal
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Financial & Processing Fees */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-amber-600" />
                    SIRIM Fees & Invoices
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Processing Fee</span>
                      <span className="font-bold text-slate-900">
                        {application.processingFeeRm ? `RM ${application.processingFeeRm.toLocaleString()}` : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Payment Status</span>
                      <span
                        className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                          application.paymentStatus === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {application.paymentStatus || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Assigned Officer</span>
                      <span className="font-medium text-slate-800">
                        {application.officerName || 'Not Assigned'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hardware Supplier & ODM Section */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-purple-600" />
                    Hardware Supplier / ODM Collaboration
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500">Supplier Company</span>
                      <span className="font-semibold text-slate-800">
                        {application.supplierName || 'Not recorded yet'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500">Supplier Email</span>
                      <span className="font-mono text-slate-700">
                        {application.supplierEmail || 'No contact email'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500">Document Status</span>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const sInfo = getSupplierStatusBadgeInfo(application.supplierStatus);
                          if (!sInfo) return <span className="text-slate-400">Not Involved</span>;
                          return (
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${sInfo.bg} ${sInfo.text} ${sInfo.border}`}>
                              {sInfo.label}
                            </span>
                          );
                        })()}
                        <select
                          value={application.supplierStatus || 'NOT_INVOLVED'}
                          onChange={(e) => {
                            onUpdateApplication({
                              ...application,
                              supplierStatus: e.target.value as any,
                            });
                          }}
                          className="text-[11px] px-2 py-1 border border-slate-200 rounded bg-slate-50 text-slate-700 font-medium"
                        >
                          <option value="NOT_INVOLVED">Not Involved</option>
                          <option value="WAITING_FOR_SUPPLIER_DOCS">Waiting for Supplier Docs</option>
                          <option value="DOCUMENTS_RECEIVED_FROM_SUPPLIER">Documents Received</option>
                          <option value="SUPPLIER_CLARIFICATION_REQUIRED">Clarification Required</option>
                          <option value="ALL_SUPPLIER_DOCS_COMPLETE">All Complete</option>
                        </select>
                      </div>
                    </div>

                    {/* Supplier Follow-up Cadence & Chaser SLA */}
                    <div className="p-3 bg-purple-50/60 rounded-lg border border-purple-200 mt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] text-purple-900 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-purple-600" />
                          Supplier SLA & Chaser Cadence
                        </span>
                        <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                          {application.supplierChaserCount || 0} Chasers Sent
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Last Contact:</span>
                          <span className="font-semibold text-slate-800">
                            {application.supplierLastContactDate
                              ? formatDate(application.supplierLastContactDate)
                              : 'No contact logged'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Next Follow-up Due:</span>
                          <span className="font-semibold text-purple-900">
                            {application.supplierChaserDueDate
                              ? formatDate(application.supplierChaserDueDate)
                              : 'None scheduled'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-purple-200/80">
                        <button
                          onClick={handleLogSupplierChaser}
                          className="flex-1 px-2.5 py-1.5 bg-white hover:bg-purple-100/60 text-purple-800 border border-purple-300 rounded text-xs font-semibold transition-colors"
                        >
                          Log 3-Day Chaser
                        </button>
                        <button
                          onClick={() => {
                            setActiveTab('ai-reply');
                            setRecipientType('SUPPLIER');
                            setReplyIntent('REQUEST_SUPPLIER_DOCS');
                            setReplyCustomNotes(
                              `Follow-up chaser #${(application.supplierChaserCount || 0) + 1} for missing compliance test reports and documentation.`
                            );
                          }}
                          className="flex-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-purple-200" />
                          <span>AI Chaser</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Technical Compliance Notes & Summary
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {application.notes || 'No custom notes logged for this application.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            Last Synced: {application.lastSyncedAt ? formatDate(application.lastSyncedAt) : 'Not synced'}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close Dossier
          </button>
        </div>
      </div>

      {/* AI Document Pre-Screening Scanner Modal */}
      <DocumentPreScreenModal
        isOpen={isPreScreenModalOpen}
        onClose={() => setIsPreScreenModalOpen(false)}
        application={application}
        onApplyResult={(result) => {
          const now = new Date().toISOString();
          const timelineEvent: TimelineEvent = {
            id: `prescreen-${Date.now()}`,
            date: now,
            title: `AI Pre-Screen Audit: ${result.documentType}`,
            description: `Verdict: ${result.overallVerdict} (${result.score}%). ${result.summary.slice(0, 120)}...`,
            sender: 'Me (Compliance Audit)',
            type: 'status_change',
            senderRole: 'APPLICANT',
          };
          onUpdateApplication({
            ...application,
            timeline: [...application.timeline, timelineEvent],
            notes:
              (application.notes ? application.notes + '\n\n' : '') +
              `[AI Compliance Pre-Screen - ${result.documentType}]: Verdict: ${result.overallVerdict} (${result.score}%). ${result.summary}`,
          });
        }}
      />
    </div>
  );
};
