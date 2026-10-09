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
  ArrowUpDown,
  Bot,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  SirimApplication,
  ActionItem,
  ActionItemCategory,
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
import {
  separateActionItems,
  getActionLabelInfo,
  isPendingStatement,
  normalizeActionItem,
  toPendingStatement,
  toActionRequired,
} from '../utils/actionItemUtils';
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
  currentUserEmail?: string;
  currentUserName?: string;
  initialTab?: 'actions' | 'checklist' | 'timeline' | 'emails' | 'ai-reply' | 'dossier';
}

export const ApplicationDetailModal: React.FC<ApplicationDetailModalProps> = ({
  application,
  isOpen,
  onClose,
  onUpdateApplication,
  onDeleteApplication,
  accessToken,
  currentUserEmail,
  currentUserName,
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
  const [newActionCategory, setNewActionCategory] = useState<ActionItemCategory>('ACTION_REQUIRED');
  const [actionsFilter, setActionsFilter] = useState<'ALL' | 'ACTIONS' | 'STATEMENTS'>('ALL');
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionDesc, setNewActionDesc] = useState('');
  const [newActionAssignee, setNewActionAssignee] = useState<ActionAssignee>('APPLICANT');
  const [newActionAssignedUserEmail, setNewActionAssignedUserEmail] = useState('');
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

  // Autonomous AI Progress Evaluator state
  const [isEvaluatingProgress, setIsEvaluatingProgress] = useState(false);
  const [progressEvaluationResult, setProgressEvaluationResult] = useState<{
    count: number;
    message: string;
    details?: string;
  } | null>(null);

  const handleEvaluateProgress = async () => {
    setIsEvaluatingProgress(true);
    setProgressEvaluationResult(null);
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(application.id)}/evaluate-progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          userEmail: currentUserEmail,
          application,
        }),
      });
      const data = await res.json();
      if (data.success && data.updatedApplication) {
        onUpdateApplication(data.updatedApplication);
        if (data.resolvedCount > 0) {
          notificationAudio.playSuccessTone();
          confetti({ particleCount: 60, spread: 70 });
          setProgressEvaluationResult({
            count: data.resolvedCount,
            message: `AI Progress Check completed: ${data.resolvedCount} requirement(s) auto-verified & resolved from recent emails!`,
            details: data.progressSummary,
          });
        } else {
          setProgressEvaluationResult({
            count: 0,
            message: data.message || 'AI scanned the email threads: All remaining items are awaiting responses from supplier or SIRIM officer.',
            details: data.progressSummary,
          });
        }
      } else {
        throw new Error(data.error || 'Failed to evaluate progress');
      }
    } catch (err: any) {
      setProgressEvaluationResult({
        count: -1,
        message: err.message || 'Could not evaluate progress with AI.',
      });
    } finally {
      setIsEvaluatingProgress(false);
    }
  };

  // Separation of active actions vs pending statements
  const incompleteItems = application.actionItems.filter((a) => !a.isCompleted);
  const { activeActions, pendingStatements } = separateActionItems(application.actionItems);
  const incActiveActions = activeActions.filter((a) => !a.isCompleted);
  const incPendingStatements = pendingStatements.filter((a) => !a.isCompleted);

  // Expanded email messages & ordering
  const [emailThreadOrder, setEmailThreadOrder] = useState<'oldest-first' | 'newest-first'>('oldest-first');
  const [expandedEmailIds, setExpandedEmailIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (application.emailThreads.length > 0) {
      // Default expand the first email (main thread) and latest email
      initial.add(application.emailThreads[0].id);
      if (application.emailThreads.length > 1) {
        initial.add(application.emailThreads[application.emailThreads.length - 1].id);
      }
    }
    return initial;
  });

  const toggleExpandEmail = (id: string) => {
    setExpandedEmailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleExpandAllEmails = () => {
    if (expandedEmailIds.size === application.emailThreads.length) {
      setExpandedEmailIds(new Set());
    } else {
      setExpandedEmailIds(new Set(application.emailThreads.map((m) => m.id)));
    }
  };

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
  const handleToggleAction = (actionId: string, force = false) => {
    const updatedActions = application.actionItems.map((a) => {
      if (a.id === actionId) {
        if (!force && isPendingStatement(a) && !a.isCompleted) {
          // Do not allow toggling pending third-party items like internal tasks
          return a;
        }
        const nextState = !a.isCompleted;
        if (nextState) {
          notificationAudio.playSuccessTone();
        }
        return {
          ...a,
          isCompleted: nextState,
          completedAt: nextState ? new Date().toISOString() : undefined,
          completedBy: nextState ? (currentUserEmail || 'team-member') : undefined,
          autoResolvedByAi: nextState ? a.autoResolvedByAi : false,
          autoResolvedReason: nextState ? a.autoResolvedReason : undefined,
        };
      }
      return a;
    });

    onUpdateApplication({
      ...application,
      actionItems: updatedActions,
    });
  };

  // Re-label an item when the AI put it in the wrong bucket
  // (e.g. a question Cytron sent to SIRIM / the agent shown as a "Cytron Action").
  const handleReclassifyAction = (actionId: string, target: 'SIRIM' | 'SUPPLIER' | 'LAB' | 'APPLICANT') => {
    onUpdateApplication({
      ...application,
      actionItems: application.actionItems.map((a) =>
        a.id !== actionId ? a : target === 'APPLICANT' ? toActionRequired(a) : toPendingStatement(a, target)
      ),
    });
  };

  // Add Action Item
  const handleAddAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActionTitle.trim()) return;

    const newAction: ActionItem = normalizeActionItem({
      id: `act-custom-${Date.now()}`,
      title: newActionTitle.trim(),
      description: newActionDesc.trim() || newActionTitle.trim(),
      itemCategory: newActionCategory,
      assignedTo: newActionAssignee,
      assignedToUserEmail: newActionAssignedUserEmail.trim() || undefined,
      assignedToName: newActionAssignedUserEmail.trim()
        ? (newActionAssignedUserEmail === currentUserEmail && currentUserName
            ? currentUserName
            : newActionAssignedUserEmail.split('@')[0])
        : undefined,
      priority: newActionPriority,
      requiredActionType: newActionType,
      dueDate: newActionDueDate || undefined,
      isCompleted: false,
    } as ActionItem);

    onUpdateApplication({
      ...application,
      actionItems: [...application.actionItems, newAction],
    });

    setNewActionTitle('');
    setNewActionDesc('');
    setNewActionAssignedUserEmail('');
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
              {application.lastModifiedBy && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-slate-300">
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    Last edited by: <strong className="text-white">{application.lastModifiedBy}</strong>
                    {application.lastModifiedAt && (
                      <span className="text-slate-400 text-[11px]">
                        ({new Date(application.lastModifiedAt).toLocaleDateString()}{' '}
                        {new Date(application.lastModifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    )}
                  </span>
                </>
              )}
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
            <span>Actions & Statements</span>
            <div className="flex items-center gap-1 ml-1">
              {incActiveActions.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800" title="Active actions required from Cytron">
                  {incActiveActions.length} act
                </span>
              )}
              {incPendingStatements.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800" title="Pending statements waiting on other party">
                  {incPendingStatements.length} stmt
                </span>
              )}
              {incompleteItems.length === 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">0</span>
              )}
            </div>
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
          {/* TAB 1: ACTION ITEMS & PENDING STATEMENTS */}
          {activeTab === 'actions' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Actions & Pending Statements</span>
                    <span className="text-xs font-normal text-slate-500">
                      ({incActiveActions.length} active action{incActiveActions.length === 1 ? '' : 's'}, {incPendingStatements.length} pending statement{incPendingStatements.length === 1 ? '' : 's'})
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Active tasks required from Cytron compliance team, plus pending statements tracking external replies and lab reports.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={handleEvaluateProgress}
                    disabled={isEvaluatingProgress}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
                    title="AI reads the latest emails to detect fulfilled requirements and automatically check off progress"
                  >
                    <Sparkles className={`w-3.5 h-3.5 text-purple-600 ${isEvaluatingProgress ? 'animate-spin' : ''}`} />
                    <span>{isEvaluatingProgress ? 'AI Reading Emails...' : 'AI Auto-Check Progress'}</span>
                  </button>
                  <button
                    onClick={() => setShowAddAction(!showAddAction)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showAddAction ? 'Close Form' : 'Add Item / Statement'}</span>
                  </button>
                </div>
              </div>

              {/* Progress Evaluation Feedback Banner */}
              {progressEvaluationResult && (
                <div
                  className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs animate-in fade-in duration-200 ${
                    progressEvaluationResult.count > 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : progressEvaluationResult.count === 0
                      ? 'bg-sky-50 border-sky-200 text-sky-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {progressEvaluationResult.count > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : progressEvaluationResult.count === 0 ? (
                      <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-bold">{progressEvaluationResult.message}</p>
                      {progressEvaluationResult.details && (
                        <p className="text-[11px] opacity-90">{progressEvaluationResult.details}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProgressEvaluationResult(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Add Action Item / Statement Subform */}
              {showAddAction && (
                <form
                  onSubmit={handleAddAction}
                  className="bg-white border border-blue-200 rounded-xl p-4 space-y-3.5 shadow-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h5 className="text-xs font-bold text-blue-900">
                      Create Item / Track Pending Statement
                    </h5>
                    {/* Category Selection Tabs */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setNewActionCategory('ACTION_REQUIRED');
                          setNewActionAssignee('APPLICANT');
                          setNewActionType('SUBMIT_DOC');
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                          newActionCategory === 'ACTION_REQUIRED'
                            ? 'bg-white text-amber-900 shadow-2xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span>Action Required</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewActionCategory('PENDING_STATEMENT');
                          setNewActionAssignee('SUPPLIER');
                          setNewActionType('WAITING_SUPPLIER');
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                          newActionCategory === 'PENDING_STATEMENT'
                            ? 'bg-white text-purple-900 shadow-2xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Clock className="w-3 h-3 text-purple-600" />
                        <span>Pending Statement (Waiting)</span>
                      </button>
                    </div>
                  </div>

                  {/* Informational Guidance */}
                  {newActionCategory === 'PENDING_STATEMENT' ? (
                    <div className="bg-purple-50/70 border border-purple-200 rounded-lg p-2.5 text-xs text-purple-900 space-y-1">
                      <div className="font-semibold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        <span>Pending Statement - Not an active action for our team</span>
                      </div>
                      <p className="text-[11px] text-purple-700">
                        Use this when we are waiting for a reply, document, or test report from the other party (e.g. waiting for lab report from supplier, waiting for SIRIM officer evaluation).
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] font-semibold text-purple-600">Quick suggestions:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setNewActionTitle('Waiting for lab report from supplier');
                            setNewActionAssignee('SUPPLIER');
                            setNewActionType('WAITING_SUPPLIER');
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-white border border-purple-200 text-purple-800 hover:bg-purple-100"
                        >
                          + Waiting for lab report from supplier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNewActionTitle('Waiting for reply / review from SIRIM officer');
                            setNewActionAssignee('SIRIM');
                            setNewActionType('AWAIT_SIRIM');
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-white border border-purple-200 text-purple-800 hover:bg-purple-100"
                        >
                          + Waiting for reply from SIRIM
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNewActionTitle('Waiting for test report from accredited lab');
                            setNewActionAssignee('LAB');
                            setNewActionType('WAITING_LAB');
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-white border border-purple-200 text-purple-800 hover:bg-purple-100"
                        >
                          + Waiting for lab report
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-2 text-xs text-amber-900">
                      <span className="font-semibold">Action Required:</span> Active task that Cytron compliance team must execute (submit documents, settle invoice, send sample).
                    </div>
                  )}

                  <div>
                    <input
                      type="text"
                      placeholder={
                        newActionCategory === 'PENDING_STATEMENT'
                          ? 'e.g. Waiting for lab report from supplier'
                          : 'Title (e.g. Upload revised RF report appendix to e-ComM)'
                      }
                      value={newActionTitle}
                      onChange={(e) => setNewActionTitle(e.target.value)}
                      required
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <textarea
                      placeholder={
                        newActionCategory === 'PENDING_STATEMENT'
                          ? 'Notes or statement context (e.g. Supplier notified on 25 Sept, awaiting IEC 62368-1 lab report)...'
                          : 'Detailed instructions or context from SIRIM...'
                      }
                      value={newActionDesc}
                      onChange={(e) => setNewActionDesc(e.target.value)}
                      rows={2}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">
                        {newActionCategory === 'PENDING_STATEMENT' ? 'Waiting On (Party)' : 'Assignee'}
                      </label>
                      <select
                        value={newActionAssignee}
                        onChange={(e) => setNewActionAssignee(e.target.value as ActionAssignee)}
                        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                      >
                        {newActionCategory === 'PENDING_STATEMENT' ? (
                          <>
                            <option value="SIRIM">SIRIM Officer / Agent</option>
                            <option value="SUPPLIER">Hardware Supplier / ODM</option>
                            <option value="LAB">External Test Lab</option>
                          </>
                        ) : (
                          <option value="APPLICANT">Cytron / Applicant</option>
                        )}
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
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">Type</label>
                      <select
                        value={newActionType}
                        onChange={(e) => setNewActionType(e.target.value as ActionItemType)}
                        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                      >
                        {newActionCategory === 'PENDING_STATEMENT' ? (
                          <>
                            <option value="WAITING_SUPPLIER">Waiting for Supplier Docs/Lab Report</option>
                            <option value="AWAIT_SIRIM">Waiting for SIRIM Review</option>
                            <option value="WAITING_LAB">Waiting for External Lab Test</option>
                            <option value="WAITING_REPLY">Waiting for General Reply</option>
                          </>
                        ) : (
                          <>
                            <option value="SUBMIT_DOC">Submit Document</option>
                            <option value="PAY_FEE">Pay Fee</option>
                            <option value="SEND_SAMPLE">Send Sample</option>
                            <option value="PROVIDE_CLARIFICATION">Provide Clarification</option>
                            <option value="RENEW_CERTIFICATE">Renew Certificate</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">
                        {newActionCategory === 'PENDING_STATEMENT' ? 'Expected Date' : 'Due Date'}
                      </label>
                      <input
                        type="date"
                        value={newActionDueDate}
                        onChange={(e) => setNewActionDueDate(e.target.value)}
                        className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase">
                        Assign Follow-up to Team Member (Email)
                      </label>
                      {currentUserEmail && (
                        <button
                          type="button"
                          onClick={() => setNewActionAssignedUserEmail(currentUserEmail)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium underline"
                        >
                          Assign to me ({currentUserEmail.split('@')[0]})
                        </button>
                      )}
                    </div>
                    <input
                      type="email"
                      placeholder="e.g. boss@cytron.io, lead@cytron.io"
                      value={newActionAssignedUserEmail}
                      onChange={(e) => setNewActionAssignedUserEmail(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded-lg bg-white mt-1"
                    />
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
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{newActionCategory === 'PENDING_STATEMENT' ? 'Save Statement' : 'Save Action'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Sub-Filter Pills */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActionsFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      actionsFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    All ({application.actionItems.length})
                  </button>
                  <button
                    onClick={() => setActionsFilter('ACTIONS')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      actionsFilter === 'ACTIONS'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>Active Actions ({activeActions.length})</span>
                  </button>
                  <button
                    onClick={() => setActionsFilter('STATEMENTS')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      actionsFilter === 'STATEMENTS'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'bg-white text-purple-800 hover:bg-purple-50 border border-purple-200'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>Pending Statements ({pendingStatements.length})</span>
                  </button>
                </div>
              </div>

              {/* Action items & statements list */}
              <div className="space-y-2.5">
                {application.actionItems
                  .filter((action) => {
                    if (actionsFilter === 'ACTIONS') return !isPendingStatement(action);
                    if (actionsFilter === 'STATEMENTS') return isPendingStatement(action);
                    return true;
                  })
                  .map((action) => {
                    const pBadge = getPriorityBadge(action.priority);
                    const labelInfo = getActionLabelInfo(action);
                    const isStmt = labelInfo.isPendingStatement;

                    return (
                      <div
                        key={action.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          action.isCompleted
                            ? 'bg-slate-100/80 border-slate-200 opacity-75'
                            : isStmt
                            ? 'bg-purple-50/20 border-purple-200 shadow-xs'
                            : action.priority === 'CRITICAL'
                            ? 'bg-white border-rose-300 ring-1 ring-rose-400/20 shadow-xs'
                            : 'bg-white border-slate-200 shadow-xs'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {isStmt ? (
                            action.isCompleted ? (
                              <div
                                className="mt-0.5 w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"
                                title="Resolved / Document received"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              </div>
                            ) : (
                              <div
                                className="mt-0.5 w-5 h-5 rounded-md bg-purple-100 text-purple-700 border border-purple-200 flex items-center justify-center shrink-0 cursor-default"
                                title={`Awaiting response from ${labelInfo.shortLabel} — Cannot be ticked manually`}
                              >
                                <Clock className="w-3.5 h-3.5 text-purple-600" />
                              </div>
                            )
                          ) : (
                            <input
                              type="checkbox"
                              checked={action.isCompleted}
                              onChange={() => handleToggleAction(action.id)}
                              className="mt-1 h-4 w-4 rounded cursor-pointer border-slate-300 text-blue-600 focus:ring-blue-500"
                              title="Mark internal action as completed"
                            />
                          )}
                          <div className="flex-1 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h5
                                className={`text-xs sm:text-sm font-bold ${
                                  action.isCompleted
                                    ? 'line-through text-slate-500'
                                    : isStmt
                                    ? 'text-purple-950'
                                    : 'text-slate-900'
                                }`}
                              >
                                {action.title}
                              </h5>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Explicit Distinct Badge */}
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${labelInfo.tagClass}`}
                                >
                                  {labelInfo.categoryBadge}
                                </span>

                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${pBadge.bg} ${pBadge.text} ${pBadge.border}`}
                                >
                                  {action.priority}
                                </span>
                                {(() => {
                                  const aInfo = getAssigneeBadgeInfo(normalizeActionItem(action).assignedTo || 'APPLICANT', isStmt);
                                  return (
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${aInfo.bg} ${aInfo.text} ${aInfo.border}`}>
                                      {aInfo.label}
                                    </span>
                                  );
                                })()}
                                {action.assignedToUserEmail && (
                                  <span
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200"
                                    title={`Assigned to ${action.assignedToUserEmail}`}
                                  >
                                    👤 {action.assignedToName || action.assignedToUserEmail.split('@')[0]}
                                  </span>
                                )}
                              </div>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed">
                              {action.description}
                            </p>

                            {isStmt && !action.isCompleted && (
                              <div className="flex items-center gap-1.5 text-[11px] text-purple-800 bg-purple-100/60 border border-purple-200/90 rounded-md px-2.5 py-1 mt-1 font-medium">
                                <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                <span>Awaiting external party ({labelInfo.shortLabel}) · Tick box disabled (auto-resolves via email or report)</span>
                              </div>
                            )}

                            {action.emailSourceSnippet && (
                              <div className="bg-slate-50 border-l-2 border-amber-400 p-2 text-[11px] text-slate-600 rounded-r mt-1 italic">
                                "{action.emailSourceSnippet}"
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {action.dueDate && (
                                  <span className="flex items-center gap-1 font-medium text-slate-700">
                                    <Calendar className="w-3 h-3 text-slate-400" />
                                    {isStmt ? 'Expected by: ' : 'Target SLA: '}
                                    {formatDate(action.dueDate)}
                                  </span>
                                )}
                                {action.completedAt && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-emerald-700 font-medium">
                                      ✓ {isStmt ? 'Resolved' : 'Completed'} {action.completedBy ? `by ${action.completedBy.split('@')[0]}` : ''} on {formatDate(action.completedAt)}
                                    </span>
                                    {action.autoResolvedByAi && (
                                      <span
                                        className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                                        title={action.autoResolvedReason || 'Auto-verified by AI email scanner'}
                                      >
                                        <Sparkles className="w-3 h-3 text-indigo-500" />
                                        <span>AI Verified from Email</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {action.autoResolvedReason && (
                                <div className="text-[11px] text-indigo-900 bg-indigo-50/70 border border-indigo-100 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                                  <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span>{action.autoResolvedReason}</span>
                                </div>
                              )}

                            {!action.isCompleted && (
                              <div className="flex items-center gap-2">
                                {isStmt ? (
                                  <>
                                    <button
                                      onClick={() => {
                                        setActiveTab('ai-reply');
                                        setReplyCustomNotes(`Follow-up / Chaser regarding: ${action.title}`);
                                      }}
                                      className="text-purple-700 hover:text-purple-900 font-semibold flex items-center gap-1 text-xs bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-md border border-purple-200 transition-colors"
                                      title="Draft an email chaser to the third party"
                                    >
                                      <Send className="w-3 h-3 text-purple-600" />
                                      <span>Draft Chaser / Follow-up</span>
                                    </button>
                                    <button
                                      onClick={() => handleToggleAction(action.id, true)}
                                      className="text-[10px] text-slate-400 hover:text-slate-700 underline transition-colors"
                                      title="Record that document was received offline outside of email"
                                    >
                                      Record offline receipt
                                    </button>
                                    <button
                                      onClick={() => handleReclassifyAction(action.id, 'APPLICANT')}
                                      className="text-[10px] text-slate-400 hover:text-slate-700 underline transition-colors"
                                      title="This is actually something Cytron must do"
                                    >
                                      Mark as Cytron action
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setActiveTab('ai-reply');
                                        setReplyCustomNotes(action.title);
                                      }}
                                      className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 text-xs"
                                    >
                                      <Sparkles className="w-3 h-3" />
                                      <span>Draft Reply for this</span>
                                    </button>
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        const v = e.target.value as 'SIRIM' | 'SUPPLIER' | 'LAB';
                                        if (v) handleReclassifyAction(action.id, v);
                                      }}
                                      className="text-[10px] text-slate-500 bg-transparent border border-slate-200 rounded px-1 py-0.5 cursor-pointer hover:border-slate-400"
                                      title="Wrong label? Move this to Pending Statements if Cytron is waiting on someone else"
                                    >
                                      <option value="">Actually waiting on…</option>
                                      <option value="SIRIM">SIRIM / agent</option>
                                      <option value="SUPPLIER">Supplier</option>
                                      <option value="LAB">Lab</option>
                                    </select>
                                  </>
                                )}
                              </div>
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

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Email Correspondence Threads</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
                      {application.emailThreads.length} {application.emailThreads.length === 1 ? 'Message' : 'Messages'}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Full chronological communications linked to Ref {application.applicationRef}.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEmailThreadOrder(emailThreadOrder === 'oldest-first' ? 'newest-first' : 'oldest-first')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
                    title="Toggle email sequence"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                    <span>{emailThreadOrder === 'oldest-first' ? 'Order: Oldest First (1 → 2)' : 'Order: Newest First (2 → 1)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleExpandAllEmails}
                    className="px-2.5 py-1 text-xs font-semibold text-sky-700 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-lg border border-sky-200 transition-colors"
                  >
                    {expandedEmailIds.size === application.emailThreads.length ? 'Collapse All' : 'Expand All'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {[...application.emailThreads]
                  .sort((a, b) => {
                    const timeA = new Date(a.date).getTime() || 0;
                    const timeB = new Date(b.date).getTime() || 0;
                    return emailThreadOrder === 'oldest-first' ? timeA - timeB : timeB - timeA;
                  })
                  .map((email, displayIdx) => {
                    const isExpanded = expandedEmailIds.has(email.id);
                    const isMainThreadOrigin =
                      email.id === application.emailThreads[0]?.id || (email as any).isMainThread;
                    const isLatestActivity =
                      email.id === application.emailThreads[application.emailThreads.length - 1]?.id &&
                      application.emailThreads.length > 1;

                    return (
                      <div
                        key={email.id}
                        className={`bg-white border rounded-xl overflow-hidden shadow-xs transition-all ${
                          isMainThreadOrigin
                            ? 'border-indigo-200 ring-1 ring-indigo-500/20'
                            : isLatestActivity
                            ? 'border-emerald-200 ring-1 ring-emerald-500/20'
                            : 'border-slate-200'
                        }`}
                      >
                        <div
                          onClick={() => toggleExpandEmail(email.id)}
                          className={`p-4 cursor-pointer hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-3 ${
                            isMainThreadOrigin ? 'bg-indigo-50/30' : isLatestActivity ? 'bg-emerald-50/30' : ''
                          }`}
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Main Thread / Latest Activity Badges */}
                              {isMainThreadOrigin && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                                  📌 Main Application Thread (#1)
                                </span>
                              )}
                              {isLatestActivity && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ⚡ Latest Activity
                                </span>
                              )}

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
                            <h5 className="text-xs font-semibold text-slate-900">{email.subject}</h5>
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
