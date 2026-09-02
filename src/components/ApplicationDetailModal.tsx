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
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  SirimApplication,
  ActionItem,
  ActionItemPriority,
  ActionAssignee,
  ActionItemType,
  SirimStatus,
} from '../types';
import {
  getStatusBadgeInfo,
  getPriorityBadge,
  getSchemeColor,
  calculateDeadlineInfo,
  formatDate,
} from '../utils/formatters';
import { notificationAudio } from '../utils/audio';

interface ApplicationDetailModalProps {
  application: SirimApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateApplication: (updatedApp: SirimApplication) => void;
  initialTab?: 'actions' | 'timeline' | 'emails' | 'ai-reply' | 'dossier';
}

export const ApplicationDetailModal: React.FC<ApplicationDetailModalProps> = ({
  application,
  isOpen,
  onClose,
  onUpdateApplication,
  initialTab = 'actions',
}) => {
  if (!isOpen || !application) return null;

  const [activeTab, setActiveTab] = useState<'actions' | 'timeline' | 'emails' | 'ai-reply' | 'dossier'>(
    initialTab
  );

  // New action item form state
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionDesc, setNewActionDesc] = useState('');
  const [newActionAssignee, setNewActionAssignee] = useState<ActionAssignee>('APPLICANT');
  const [newActionPriority, setNewActionPriority] = useState<ActionItemPriority>('HIGH');
  const [newActionType, setNewActionType] = useState<ActionItemType>('SUBMIT_DOC');
  const [newActionDueDate, setNewActionDueDate] = useState('');

  // AI Reply Generator state
  const [replyIntent, setReplyIntent] = useState<string>('SUBMIT_DOCS');
  const [replyCustomNotes, setReplyCustomNotes] = useState('');
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<{
    subject: string;
    body: string;
    suggestedAttachments: string[];
  } | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

  // Expanded email messages
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(
    application.emailThreads.length > 0 ? application.emailThreads[application.emailThreads.length - 1].id : null
  );

  const statusInfo = getStatusBadgeInfo(application.status);
  const deadlineInfo = calculateDeadlineInfo(application.targetDeadline);

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
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {action.assignedTo === 'APPLICANT'
                                  ? 'Cytron Action'
                                  : action.assignedTo === 'SIRIM'
                                  ? 'SIRIM Action'
                                  : 'Lab Action'}
                              </span>
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
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {email.from}
                            </span>
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
                  Gemini AI Official SIRIM Reply Drafter
                </h4>
                <p className="text-xs text-slate-500">
                  Generates technical, formal, and polite email correspondence tailored to SIRIM QAS & e-ComM standards.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Response Intent / Goal
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
                      Target Officer
                    </label>
                    <input
                      type="text"
                      defaultValue={application.officerName || 'SIRIM QAS Certification Section'}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-slate-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Specific Notes / Instructions for AI
                  </label>
                  <textarea
                    rows={2}
                    value={replyCustomNotes}
                    onChange={(e) => setReplyCustomNotes(e.target.value)}
                    placeholder="E.g. Mention that revised ETSI EN 300 328 laboratory accreditation annex and peak antenna gain certificate are attached..."
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
    </div>
  );
};
