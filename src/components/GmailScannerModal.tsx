import React, { useState } from 'react';
import {
  X,
  Mail,
  Search,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowRight,
  User,
  Radio,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserAuthSession, SirimApplication, ActionItem, TimelineEvent } from '../types';
import { notificationAudio } from '../utils/audio';

interface GmailScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  authSession: UserAuthSession | null;
  onConnectGoogle: () => void;
  onImportApplications: (newApps: SirimApplication[]) => void;
}

interface ThreadSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  messageCount: number;
}

export const GmailScannerModal: React.FC<GmailScannerModalProps> = ({
  isOpen,
  onClose,
  authSession,
  onConnectGoogle,
  onImportApplications,
}) => {
  if (!isOpen) return null;

  const [query, setQuery] = useState(
    'SIRIM OR eComM OR "Certificate of Conformity" OR "Type Approval" OR "SIRIM QAS" OR "SQAS"'
  );
  const [isScanning, setIsScanning] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const presets = [
    { label: 'All SIRIM & e-ComM', q: 'SIRIM OR eComM OR "Certificate of Conformity" OR "Type Approval"' },
    { label: 'Urgent RFIs & Action Calls', q: 'SIRIM (RFI OR "Request for Information" OR "Action Required" OR query OR clarify)' },
    { label: 'Sample Calls', q: 'SIRIM ("sample" OR "courier" OR "Building 25" OR "spot test")' },
    { label: 'Payment Invoices', q: 'SIRIM ("invoice" OR "RM" OR "processing fee" OR "receipt")' },
    { label: 'Approved CoC Certificates', q: 'SIRIM ("Approved" OR "Issuance of Certificate" OR "CoA" OR "CoC")' },
  ];

  const handleScan = async (searchQ?: string) => {
    const activeQuery = searchQ || query;
    if (!authSession?.accessToken) {
      setErrorMsg('Please sign in with your Google Account to scan Gmail.');
      return;
    }

    setIsScanning(true);
    setErrorMsg(null);
    setThreads([]);
    setSelectedThreadIds(new Set());

    try {
      const res = await fetch('/api/gmail/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.accessToken}`,
        },
        body: JSON.stringify({
          query: activeQuery,
          maxResults: 20,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to search Gmail');
      }

      setThreads(data.threads || []);
      // Auto select first 3 by default
      const initialSelected = new Set<string>();
      (data.threads || []).slice(0, 3).forEach((t: ThreadSummary) => initialSelected.add(t.id));
      setSelectedThreadIds(initialSelected);

      if ((data.threads || []).length === 0) {
        setErrorMsg('No matching SIRIM or e-ComM email threads found with this search query.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error communicating with Gmail API.');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSelectThread = (id: string) => {
    const next = new Set(selectedThreadIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedThreadIds(next);
  };

  const handleProcessSelected = async () => {
    if (selectedThreadIds.size === 0) return;
    if (!authSession?.accessToken) return;

    setIsProcessingAi(true);
    setErrorMsg(null);
    const parsedApplications: SirimApplication[] = [];

    const idsArray: string[] = Array.from(selectedThreadIds);
    let count = 0;

    for (const rawThreadId of idsArray) {
      const threadId = String(rawThreadId);
      count++;
      setProcessingProgress(`Analyzing thread ${count} of ${idsArray.length} with Gemini AI...`);

      try {
        // Fetch full thread
        const threadRes = await fetch('/api/gmail/thread-details', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authSession.accessToken}`,
          },
          body: JSON.stringify({ threadId }),
        });

        const threadData = await threadRes.json();
        if (!threadData.success || !threadData.messages) continue;

        const messages = threadData.messages;
        const lastMessage = messages[messages.length - 1] || {};

        // Parse with Gemini
        const parseRes = await fetch('/api/gemini/parse-email-thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailSubject: lastMessage.subject || '',
            emailBody: messages.map((m: any) => `[${m.from} (${m.date})]:\n${m.bodyText || m.snippet}`).join('\n\n---\n\n'),
            sender: lastMessage.from || '',
            date: lastMessage.date || '',
          }),
        });

        const parseData = await parseRes.json();
        if (parseData.success && parseData.data) {
          const aiResult = parseData.data;

          const actionItems: ActionItem[] = (aiResult.actionItems || []).map((a: any, idx: number) => ({
            id: `act-${threadId}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: a.title,
            description: a.description,
            assignedTo: a.assignedTo || 'APPLICANT',
            dueDate: a.dueDate || undefined,
            isCompleted: false,
            priority: a.priority || 'HIGH',
            requiredActionType: a.requiredActionType || 'SUBMIT_DOC',
            emailSourceSnippet: a.emailSourceSnippet || undefined,
          }));

          const timeline: TimelineEvent[] = [
            {
              id: `tl-${threadId}-${Date.now()}-1`,
              date: aiResult.timelineEvent?.date || new Date().toISOString().split('T')[0],
              title: aiResult.timelineEvent?.title || 'Communication Ingested from Gmail',
              description: aiResult.timelineEvent?.description || aiResult.summary || 'Email thread imported.',
              sender: aiResult.timelineEvent?.sender || lastMessage.from || 'SIRIM QAS',
              emailSubject: lastMessage.subject,
              type: aiResult.timelineEvent?.type || 'rfi',
            },
          ];

          const newApp: SirimApplication = {
            id: `sirim-${threadId}`,
            threadId,
            applicationRef: aiResult.applicationRef || `SQAS/GEN/${Date.now().toString().slice(-4)}`,
            productName: aiResult.productName || lastMessage.subject,
            modelNumber: aiResult.modelNumber || 'GEN-MODEL-01',
            brand: aiResult.brand || 'Cytron',
            applicant: aiResult.applicant || 'Cytron Technologies Sdn Bhd',
            scheme: aiResult.scheme || 'Type Approval (MCMC/SIRIM)',
            status: aiResult.status || 'UNDER_REVIEW',
            officerName: aiResult.officerName || undefined,
            officerEmail: aiResult.officerEmail || undefined,
            submissionDate: aiResult.submissionDate || new Date().toISOString().split('T')[0],
            lastActivityDate: new Date().toISOString().split('T')[0],
            targetDeadline: aiResult.targetDeadline || undefined,
            certificateNo: aiResult.certificateNo || undefined,
            certificateExpiryDate: aiResult.certificateExpiryDate || undefined,
            processingFeeRm: aiResult.processingFeeRm || undefined,
            paymentStatus: aiResult.paymentStatus || 'NOT_APPLICABLE',
            notes: aiResult.summary || '',
            emailSubject: lastMessage.subject || `SIRIM / e-ComM Correspondence (${aiResult.applicationRef || 'Update'})`,
            gmailThreadLink: `https://mail.google.com/mail/u/0/#all/${threadId}`,
            actionItems,
            timeline,
            emailThreads: messages,
            syncedToSheet: false,
          };

          parsedApplications.push(newApp);
        }
      } catch (e) {
        console.error(`Failed to parse thread ${threadId}`, e);
      }
    }

    if (parsedApplications.length > 0) {
      onImportApplications(parsedApplications);
      notificationAudio.playSuccessTone();
      confetti({ particleCount: 60, spread: 70 });
      onClose();
    } else {
      setErrorMsg('Could not extract valid SIRIM CoC applications from the selected threads.');
    }

    setIsProcessingAi(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-sky-950 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-600/30 text-sky-300 ring-1 ring-sky-500/40">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Gmail Inbox Scanner
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                  AI Grounded
                </span>
              </h3>
              <p className="text-xs text-sky-200/80">
                Scan your Gmail inbox for SIRIM QAS, e-ComM, and Certificate of Conformity threads
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-sky-300 hover:text-white hover:bg-sky-900 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-slate-50/50">
          {!authSession?.isAuthenticated && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-amber-900">Google Account Required</p>
                <p className="text-amber-700">
                  Please connect your Google Account with Gmail access to scan inbox communications.
                </p>
                <button
                  onClick={onConnectGoogle}
                  className="mt-1 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors shadow-xs"
                >
                  Connect Google Workspace
                </button>
              </div>
            </div>
          )}

          {/* Query Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-xs">
            <label className="text-xs font-bold text-slate-700 block">
              Search Filter / Query
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. SIRIM OR eComM OR Type Approval"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>
              <button
                onClick={() => handleScan()}
                disabled={isScanning || !authSession?.isAuthenticated}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Scanning...' : 'Scan Inbox'}</span>
              </button>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setQuery(p.q);
                    handleScan(p.q);
                  }}
                  className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 text-slate-700 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 border border-slate-200 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results List */}
          {threads.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span className="font-bold">
                  Found {threads.length} Relevant Threads
                </span>
                <span>
                  {selectedThreadIds.size} selected for AI analysis
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {threads.map((thread) => {
                  const isSelected = selectedThreadIds.has(thread.id);
                  return (
                    <div
                      key={thread.id}
                      onClick={() => toggleSelectThread(thread.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                        isSelected
                          ? 'bg-sky-50/70 border-sky-300 ring-1 ring-sky-400/30'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectThread(thread.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {thread.from}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium shrink-0">
                            {new Date(thread.date).toLocaleDateString('en-MY', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                        </div>
                        <h5 className="text-xs font-semibold text-slate-800 line-clamp-1">
                          {thread.subject}
                        </h5>
                        <p className="text-xs text-slate-500 line-clamp-1">{thread.snippet}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Processing Status */}
          {isProcessingAi && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-center space-y-2">
              <Sparkles className="w-6 h-6 text-sky-600 animate-spin mx-auto" />
              <p className="text-xs font-bold text-sky-900">{processingProgress}</p>
              <p className="text-[11px] text-sky-700">
                Extracting Reference Numbers, Action Items, Officers, and Due Dates...
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>

          {threads.length > 0 && (
            <button
              onClick={handleProcessSelected}
              disabled={selectedThreadIds.size === 0 || isProcessingAi}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-md transition-all disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-200" />
              <span>
                Parse {selectedThreadIds.size} {selectedThreadIds.size === 1 ? 'Thread' : 'Threads'} with Gemini
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
