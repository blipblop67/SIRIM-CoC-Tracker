import React, { useState } from 'react';
import {
  X,
  Sparkles,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  Radio,
  FileCode,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  SirimApplication,
  CertificationScheme,
  SirimStatus,
  ActionItem,
  TimelineEvent,
  ParsedEmailResult,
} from '../types';
import { notificationAudio } from '../utils/audio';

interface NewApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddApplication: (newApp: SirimApplication) => void;
}

const SAMPLE_SIRIM_EMAILS = [
  {
    title: 'SIRIM QAS RFI Query (5GHz Wi-Fi Router)',
    subject: 'URGENT RFI: Technical Evaluation for SQAS/CMCS/2026/0991 (CYT-WIFI6-AP)',
    sender: 'azlan@sirim.my',
    body: `Dear Cytron Technologies Sdn Bhd,

Reference: SQAS/CMCS/2026/0991
Product: Dual-Band Wi-Fi 6 Industrial Access Point
Model: CYT-WIFI6-AP
Brand: Cytron

We have completed the initial screening of your Type Approval application under MCMC Class Assignment (5150-5350 MHz / 5470-5725 MHz DFS).

Kindly provide the following within 7 working days (Deadline: 08-September-2026):
1. Dynamic Frequency Selection (DFS) test report under EN 301 893 v2.1.1.
2. EIRP declaration confirming output power <= 200mW for indoor operation.
3. High-resolution photos of the external MCMC e-label silkscreen placement.

Failure to furnish these documents by the deadline will result in administrative closure of the application.

Regards,
Azlan bin Hashim
Senior Certification Officer
Communication & Multimedia Certification Section (CMCS)
SIRIM QAS International Sdn. Bhd.`,
  },
  {
    title: 'SIRIM CoC Approval & Certificate Issuance (100W GaN Charger)',
    subject: 'ISSUANCE OF CERTIFICATE OF CONFORMITY: SQAS/EECS/2026/2280',
    sender: 'kavitha@sirim.my',
    body: `Dear Applicant,

We are pleased to inform you that your application for Product Certification Scheme has been APPROVED by the Certification Panel.

Certificate of Conformity Details:
Certificate No: COA/EECS/2026/MS-GAN100-9901
Product: 100W Multi-Port GaN Desktop Power Station
Model: CYT-GAN100-4P
Standard: MS IEC 62368-1:2018 & MS 589-2
Validity: 28 August 2026 to 27 August 2027

You are authorized to purchase holographic SIRIM Security Labels from the SIRIM e-Permit portal.

Congratulations,
Electrical & Electronic Certification Section
SIRIM QAS International Sdn. Bhd.`,
  },
];

export const NewApplicationModal: React.FC<NewApplicationModalProps> = ({
  isOpen,
  onClose,
  onAddApplication,
}) => {
  if (!isOpen) return null;

  const [mode, setMode] = useState<'ai' | 'manual'>('ai');

  // AI mode state
  const [emailSubject, setEmailSubject] = useState('');
  const [emailSender, setEmailSender] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedEmailResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manual mode state
  const [appRef, setAppRef] = useState('');
  const [productName, setProductName] = useState('');
  const [modelNo, setModelNo] = useState('');
  const [brand, setBrand] = useState('Cytron');
  const [scheme, setScheme] = useState<CertificationScheme>('Type Approval (MCMC/SIRIM)');
  const [status, setStatus] = useState<SirimStatus>('UNDER_REVIEW');
  const [officerName, setOfficerName] = useState('');
  const [officerEmail, setOfficerEmail] = useState('');
  const [targetDeadline, setTargetDeadline] = useState('');
  const [processingFee, setProcessingFee] = useState('');
  const [actionTitle, setActionTitle] = useState('');

  const loadSampleEmail = (sample: (typeof SAMPLE_SIRIM_EMAILS)[0]) => {
    setEmailSubject(sample.subject);
    setEmailSender(sample.sender);
    setEmailBody(sample.body);
    setParsedPreview(null);
    setErrorMsg(null);
  };

  const handleParseWithGemini = async () => {
    if (!emailBody.trim() && !emailSubject.trim()) {
      setErrorMsg('Please enter the email subject or body text.');
      return;
    }

    setIsParsing(true);
    setErrorMsg(null);
    setParsedPreview(null);

    try {
      const res = await fetch('/api/gemini/parse-email-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailSubject,
          emailBody,
          sender: emailSender,
          date: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to parse email with Gemini AI');
      }

      setParsedPreview(data.data);
      notificationAudio.playAlertTone();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error communicating with AI parser.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSaveAiApplication = () => {
    if (!parsedPreview) return;

    const threadId = `th_manual_${Date.now()}`;

    const actionItems: ActionItem[] = (parsedPreview.actionItems || []).map((a, idx) => ({
      id: `act-${Date.now()}-${idx}`,
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
        id: `tl-${Date.now()}-1`,
        date: parsedPreview.timelineEvent?.date || new Date().toISOString().split('T')[0],
        title: parsedPreview.timelineEvent?.title || 'Application Ingested via Email',
        description: parsedPreview.timelineEvent?.description || parsedPreview.summary,
        sender: parsedPreview.timelineEvent?.sender || emailSender || 'SIRIM QAS',
        emailSubject: emailSubject || undefined,
        type: parsedPreview.timelineEvent?.type || 'status_change',
      },
    ];

    const newApp: SirimApplication = {
      id: `app-${Date.now()}`,
      threadId,
      applicationRef: parsedPreview.applicationRef || `SQAS/CMCS/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`,
      productName: parsedPreview.productName || 'Unnamed Device',
      modelNumber: parsedPreview.modelNumber || 'GEN-MODEL',
      brand: parsedPreview.brand || 'Cytron',
      applicant: parsedPreview.applicant || 'Cytron Technologies Sdn Bhd',
      scheme: parsedPreview.scheme || 'Type Approval (MCMC/SIRIM)',
      status: parsedPreview.status || 'UNDER_REVIEW',
      officerName: parsedPreview.officerName || undefined,
      officerEmail: parsedPreview.officerEmail || undefined,
      submissionDate: parsedPreview.submissionDate || new Date().toISOString().split('T')[0],
      lastActivityDate: new Date().toISOString().split('T')[0],
      targetDeadline: parsedPreview.targetDeadline || undefined,
      certificateNo: parsedPreview.certificateNo || undefined,
      certificateExpiryDate: parsedPreview.certificateExpiryDate || undefined,
      processingFeeRm: parsedPreview.processingFeeRm || undefined,
      paymentStatus: parsedPreview.paymentStatus || 'NOT_APPLICABLE',
      notes: parsedPreview.summary || '',
      emailSubject: emailSubject || parsedPreview.timelineEvent?.emailSubject || `SIRIM Communication - ${parsedPreview.applicationRef || 'Update'}`,
      gmailThreadLink: emailSubject ? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(emailSubject)}` : undefined,
      actionItems,
      timeline,
      emailThreads: [
        {
          id: `msg-${Date.now()}`,
          messageId: `msg_${Date.now()}@local`,
          from: emailSender || 'sirim@sirim.my',
          to: 'compliance@cytron.io',
          date: new Date().toISOString(),
          subject: emailSubject || 'SIRIM CoC Application Update',
          snippet: emailBody.slice(0, 150),
          bodyText: emailBody,
          hasAttachments: false,
        },
      ],
      syncedToSheet: false,
    };

    onAddApplication(newApp);
    notificationAudio.playSuccessTone();
    confetti({ particleCount: 50, spread: 60 });
    onClose();
  };

  const handleSaveManualApplication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !modelNo.trim()) return;

    const threadId = `th_manual_${Date.now()}`;
    const actionItems: ActionItem[] = actionTitle.trim()
      ? [
          {
            id: `act-${Date.now()}`,
            title: actionTitle.trim(),
            description: actionTitle.trim(),
            assignedTo: 'APPLICANT',
            dueDate: targetDeadline || undefined,
            isCompleted: false,
            priority: 'HIGH',
            requiredActionType: 'SUBMIT_DOC',
          },
        ]
      : [];

    const newApp: SirimApplication = {
      id: `app-${Date.now()}`,
      threadId,
      applicationRef: appRef.trim() || `SQAS/CMCS/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`,
      productName: productName.trim(),
      modelNumber: modelNo.trim(),
      brand: brand.trim() || 'Cytron',
      applicant: 'Cytron Technologies Sdn Bhd',
      scheme,
      status,
      officerName: officerName.trim() || undefined,
      officerEmail: officerEmail.trim() || undefined,
      submissionDate: new Date().toISOString().split('T')[0],
      lastActivityDate: new Date().toISOString().split('T')[0],
      targetDeadline: targetDeadline || undefined,
      processingFeeRm: processingFee ? parseFloat(processingFee) : undefined,
      paymentStatus: processingFee ? 'UNPAID' : 'NOT_APPLICABLE',
      notes: 'Manually entered SIRIM CoC application record.',
      actionItems,
      timeline: [
        {
          id: `tl-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          title: 'Application Dossier Created',
          description: 'Registered into SIRIM CoC Progress Tracker.',
          sender: 'compliance@cytron.io',
          type: 'document',
        },
      ],
      emailThreads: [],
      syncedToSheet: false,
    };

    onAddApplication(newApp);
    notificationAudio.playSuccessTone();
    confetti({ particleCount: 50, spread: 60 });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-blue-950 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/40">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Ingest SIRIM CoC Communication</h3>
              <p className="text-xs text-blue-200/80">
                Paste official email text for instant Gemini AI structuring or register manually
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-blue-300 hover:text-white hover:bg-blue-900 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="p-2 bg-slate-100 border-b border-slate-200 shrink-0">
          <div className="flex items-center p-1 bg-white rounded-lg border border-slate-200">
            <button
              onClick={() => setMode('ai')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'ai'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Instant Email Parser (Recommended)</span>
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'manual'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Manual Entry Form</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-slate-50/50">
          {mode === 'ai' ? (
            <div className="space-y-3.5">
              {/* Sample loader */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold">Load Sample:</span>
                {SAMPLE_SIRIM_EMAILS.map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => loadSampleEmail(sample)}
                    className="px-2.5 py-1 rounded bg-white text-blue-700 hover:bg-blue-50 border border-blue-200 font-medium text-[11px] transition-colors shadow-2xs"
                  >
                    {sample.title}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. URGENT RFI: Technical Evaluation for SQAS/CMCS/..."
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Sender / SIRIM Officer Email
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. nurulhuda@sirim.my or no-reply@ecomm.sirim.my"
                    value={emailSender}
                    onChange={(e) => setEmailSender(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Email Body / Notification Text
                </label>
                <textarea
                  rows={6}
                  placeholder="Paste the full email body received from SIRIM QAS, e-ComM portal, or testing lab..."
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-mono"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleParseWithGemini}
                  disabled={isParsing || (!emailBody.trim() && !emailSubject.trim())}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md transition-all disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isParsing ? 'animate-spin' : ''}`} />
                  <span>{isParsing ? 'Extracting with Gemini AI...' : 'Analyze with Gemini AI'}</span>
                </button>
              </div>

              {/* AI Parsed Preview */}
              {parsedPreview && (
                <div className="bg-white border border-emerald-300 rounded-xl p-4 space-y-3 shadow-md ring-1 ring-emerald-400/20">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Gemini Extracted Application Record
                    </span>
                    <span className="text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {parsedPreview.applicationRef}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Product:</span>{' '}
                      <strong className="text-slate-900">{parsedPreview.productName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Model:</span>{' '}
                      <strong className="font-mono text-slate-900">{parsedPreview.modelNumber}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Scheme:</span>{' '}
                      <strong className="text-slate-800">{parsedPreview.scheme}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Status:</span>{' '}
                      <strong className="text-blue-700">{parsedPreview.status}</strong>
                    </div>
                    {parsedPreview.officerName && (
                      <div>
                        <span className="text-slate-500">Officer:</span>{' '}
                        <strong className="text-slate-800">{parsedPreview.officerName}</strong>
                      </div>
                    )}
                    {parsedPreview.targetDeadline && (
                      <div>
                        <span className="text-slate-500">Deadline:</span>{' '}
                        <strong className="text-rose-700">{parsedPreview.targetDeadline}</strong>
                      </div>
                    )}
                  </div>

                  {parsedPreview.actionItems.length > 0 && (
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                      <span className="font-bold text-slate-700">
                        Action Items Detected ({parsedPreview.actionItems.length}):
                      </span>
                      {parsedPreview.actionItems.map((act, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 text-slate-700">
                          <span className="text-amber-500 font-bold">•</span>
                          <span>
                            <strong>[{act.priority}]</strong> {act.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleSaveAiApplication}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-md transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Confirm & Register Application</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveManualApplication} className="space-y-3.5 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Application Ref / Job No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SQAS/CMCS/2026/0418"
                    value={appRef}
                    onChange={(e) => setAppRef(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Certification Scheme
                  </label>
                  <select
                    value={scheme}
                    onChange={(e) => setScheme(e.target.value as CertificationScheme)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Type Approval (MCMC/SIRIM)">Type Approval (MCMC/SIRIM)</option>
                    <option value="Special Approval">Special Approval</option>
                    <option value="Modular Approval">Modular Approval</option>
                    <option value="CIDB Certification">CIDB Certification</option>
                    <option value="Safety & EMC (MS Standards)">Safety & EMC (MS Standards)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Maker Feather ESP32-S3 IoT Gateway"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Model Number *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CYT-FEATHER-S3"
                    value={modelNo}
                    onChange={(e) => setModelNo(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Brand</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Initial Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as SirimStatus)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="SUBMITTED">Submitted (Lodged)</option>
                    <option value="UNDER_REVIEW">Document Review</option>
                    <option value="SAMPLE_REQUESTED">Sample Call Notice</option>
                    <option value="TESTING_IN_PROGRESS">Testing in Progress</option>
                    <option value="RFI_ACTION_REQUIRED">RFI / Action Required</option>
                    <option value="PAYMENT_PENDING">Payment Pending</option>
                    <option value="APPROVED">Approved (CoC Issued)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Target SLA Date</label>
                  <input
                    type="date"
                    value={targetDeadline}
                    onChange={(e) => setTargetDeadline(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">SIRIM Officer Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Nurul Huda"
                    value={officerName}
                    onChange={(e) => setOfficerName(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Officer Email</label>
                  <input
                    type="email"
                    placeholder="e.g. officer@sirim.my"
                    value={officerEmail}
                    onChange={(e) => setOfficerEmail(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Fee (RM)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1850"
                    value={processingFee}
                    onChange={(e) => setProcessingFee(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Initial Pending Action Item (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Submit antenna peak gain report"
                  value={actionTitle}
                  onChange={(e) => setActionTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md"
                >
                  Create Application Record
                </button>
              </div>
            </form>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
