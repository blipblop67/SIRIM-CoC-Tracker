import React, { useState } from 'react';
import {
  BookOpen,
  X,
  Mail,
  Zap,
  Users,
  CheckCircle2,
  FileCheck,
  FileSpreadsheet,
  HelpCircle,
  ExternalLink,
  Copy,
  Check,
  Server,
  ArrowRight,
} from 'lucide-react';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenGmailScan?: () => void;
  onOpenAutomation?: () => void;
  onOpenPreScreen?: () => void;
  onOpenNewApp?: () => void;
}

export const UserManualModal: React.FC<UserManualModalProps> = ({
  isOpen,
  onClose,
  onOpenGmailScan,
  onOpenAutomation,
  onOpenPreScreen,
  onOpenNewApp,
}) => {
  const [activeSection, setActiveSection] = useState<
    'overview' | 'email-scan' | 'teamwork' | 'prescreen' | 'automation' | 'faq'
  >('overview');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const handleCopyDocLink = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                Getting Started & User Manual
              </h2>
              <p className="text-xs text-slate-500">
                SIRIM CoC Regulatory Progress Tracker & AI Compliance Workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyDocLink}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-white flex items-center gap-1.5 transition-colors"
              title="Copy link to workspace"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Share URL</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-56 bg-slate-50 border-r border-slate-100 p-3 flex flex-col gap-1 shrink-0 overflow-y-auto">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
              User Guide
            </div>

            <button
              onClick={() => setActiveSection('overview')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                activeSection === 'overview'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-4 h-4 text-sky-600" />
              <span>1. Quick Overview</span>
            </button>

            <button
              onClick={() => setActiveSection('email-scan')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                activeSection === 'email-scan'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Mail className="w-4 h-4 text-indigo-600" />
              <span>2. Ingesting Emails</span>
            </button>

            <button
              onClick={() => setActiveSection('teamwork')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                activeSection === 'teamwork'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-600" />
              <span>3. Teamwork & Deduplication</span>
            </button>

            <button
              onClick={() => setActiveSection('prescreen')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                activeSection === 'prescreen'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileCheck className="w-4 h-4 text-amber-600" />
              <span>4. AI Pre-Screening</span>
            </button>

            <button
              onClick={() => setActiveSection('automation')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                activeSection === 'automation'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-500" />
              <span>5. Telegram & Scheduling</span>
            </button>

            <button
              onClick={() => setActiveSection('faq')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                activeSection === 'faq'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <HelpCircle className="w-4 h-4 text-slate-500" />
              <span>6. FAQ & Deployment</span>
            </button>

            <div className="mt-auto pt-3 border-t border-slate-200/70">
              <div className="px-3 py-2 rounded-lg bg-white border border-slate-200/80 text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold mb-0.5">
                  <Server className="w-3.5 h-3.5 text-slate-500" />
                  <span>Self-Hosted & Private</span>
                </div>
                <span>Data stored locally in <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">./data/</code></span>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6 text-sm text-slate-700 leading-relaxed">
            {activeSection === 'overview' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-lg font-bold text-slate-900">1. Welcome & Fast Track Overview</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Get up to speed with how the SIRIM CoC Regulatory Tracker works in under 2 minutes.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs mb-2">
                      1
                    </div>
                    <h4 className="font-semibold text-slate-900 text-xs">Connect / Ingest</h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Sign in with Google to scan your inbox, or click <strong>+ Ingest Email</strong> to paste any SIRIM email thread.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-xs mb-2">
                      2
                    </div>
                    <h4 className="font-semibold text-slate-900 text-xs">AI Extraction</h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      The parser extracts Application Reference (<code className="font-mono text-[10px]">SQAS/...</code>), RFIs, officer details, and deadlines.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs mb-2">
                      3
                    </div>
                    <h4 className="font-semibold text-slate-900 text-xs">Auto Briefings</h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Receive morning digests in Telegram and sync real-time records to your team's Google Sheet.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-100 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-sky-900">
                    <p className="font-semibold">Quick Actions to Try Right Now:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {onOpenNewApp && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenNewApp();
                          }}
                          className="px-2.5 py-1 bg-white border border-sky-200 text-sky-800 rounded-lg hover:bg-sky-50 font-medium transition-colors"
                        >
                          + Ingest a SIRIM Email
                        </button>
                      )}
                      {onOpenGmailScan && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenGmailScan();
                          }}
                          className="px-2.5 py-1 bg-white border border-sky-200 text-sky-800 rounded-lg hover:bg-sky-50 font-medium transition-colors"
                        >
                          Scan Gmail Inbox
                        </button>
                      )}
                      {onOpenPreScreen && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenPreScreen();
                          }}
                          className="px-2.5 py-1 bg-white border border-sky-200 text-sky-800 rounded-lg hover:bg-sky-50 font-medium transition-colors"
                        >
                          AI Technical Pre-Screen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'email-scan' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-lg font-bold text-slate-900">2. Ingesting & Parsing SIRIM Emails</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    How the autonomous parser extracts structured data from unstructured emails.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-900 text-xs flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">A</span>
                      Automated Gmail Inbox Scan
                    </h4>
                    <p className="text-xs text-slate-600 mt-1.5">
                      Click <strong>Scan Inbox</strong> in the header. The system searches your inbox for messages matching SIRIM QAS keywords (e.g. <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">from:sirim.my OR subject:sirim OR subject:e-comm</code>) across 7, 30, or 90 days.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-900 text-xs flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">B</span>
                      Manual Ingestion / Forwarded Emails
                    </h4>
                    <p className="text-xs text-slate-600 mt-1.5">
                      Click <strong>+ Ingest Email</strong> and paste the email text. Even forwarded emails from colleagues or external test laboratories (TÜV, SGS, CQC) are automatically parsed.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                    <span className="font-semibold text-slate-800">What metadata is extracted automatically?</span>
                    <ul className="list-disc list-inside space-y-1 text-slate-600 text-[11px]">
                      <li><strong>Application Ref:</strong> e.g. <code className="font-mono">SQAS/CMCS/2026/0418</code> or <code className="font-mono">eComM-2026-0819</code>.</li>
                      <li><strong>Product & Model:</strong> Brand name, model number, and marketing description.</li>
                      <li><strong>Responsible Officers:</strong> Case handler name, direct email, and branch.</li>
                      <li><strong>Payment Requirements:</strong> Processing fees (RM), assessment invoices, and official receipts.</li>
                      <li><strong>RFIs & Outstanding Items:</strong> Document requests, test report inquiries, and sample delivery requirements.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'teamwork' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-lg font-bold text-slate-900">3. Team Collaboration & Deduplication</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    What happens when multiple engineers are CC'd on the same SIRIM email thread?
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Smart Deduplication Guarantee</span>
                  </div>
                  <p className="text-emerald-800 text-[11px] leading-relaxed">
                    If multiple team members scan their inboxes and encounter the same SIRIM email, the platform <strong>never creates duplicate entries</strong>. Instead, it correlates the Application Reference Number (<code className="font-mono font-semibold">SQAS/...</code>) and merges the new email thread directly into the shared record.
                  </p>
                </div>

                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                    <p>
                      <strong>Active Collaborators Stack:</strong> Avatars in the top right show who is currently active and viewing applications in real-time.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                    <p>
                      <strong>Team Activity Feed:</strong> Click the pulse icon in the top header to view the audit log of which engineer ingested which email, edited records, or marked actions resolved.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                    <p>
                      <strong>Filter by Assignee:</strong> Use the "Assigned to Me" filter to instantly focus on your specific deliverables.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'prescreen' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-lg font-bold text-slate-900">4. AI Technical Pre-Screening Engine</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Catch regulatory non-compliance before paying official SIRIM evaluation fees.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs">
                  <p className="font-semibold text-slate-900">Pre-Screen Capabilities:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-600 text-[11px]">
                    <li><strong>MCMC Technical Class Assignments:</strong> Verifies operating bands (2.4 GHz, 5 GHz, Wi-Fi 6E/7, Sub-1GHz, 919-923 MHz LoRa) comply with Malaysian Class Assignment limits.</li>
                    <li><strong>EIRP & Output Power Limits:</strong> Flags non-compliant radiated power that would cause immediate SIRIM rejection.</li>
                    <li><strong>ILAC-MRA Lab Accreditation:</strong> Confirms test reports originate from laboratories recognized by Malaysian regulators.</li>
                    <li><strong>Standard References:</strong> Cross-checks against MCMC MTSFB TC T007, MS IEC 62368-1, and CISPR 32.</li>
                  </ul>
                </div>

                <div className="text-xs text-slate-600">
                  <p>
                    To run a pre-screen, select <strong>AI Pre-Screen Compliance</strong> from the header menu, choose your document type (RF/EMC Report, Safety Report, User Manual), and paste the technical excerpt or table of specifications.
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'automation' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-lg font-bold text-slate-900">5. Autonomous Hands-Free Agent & Telegram Digest</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    How the autonomous compliance agent executes tasks 24/7 without requiring a human trigger.
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
                    <h4 className="font-semibold text-emerald-950 text-xs mb-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Autonomous Agent Workflow (Zero Human Trigger)
                    </h4>
                    <p className="text-slate-700 text-[11px] leading-relaxed">
                      Once you authorize your <strong>Google Account</strong> (for Gmail reading) and link your <strong>Google Sheet</strong> (for live registry sync), the agent takes over completely hands-free:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px] mt-2">
                      <li><strong>Continuous Background Monitoring:</strong> Automatically polls your Gmail inbox every 15 minutes for new SIRIM QAS / e-ComM emails.</li>
                      <li><strong>AI Evaluation & Parsing:</strong> Gemini AI reads officer queries, extract CoC application numbers, status shifts, and invoice attachments.</li>
                      <li><strong>Auto-Completion of Action Items:</strong> When a document, payment receipt, or lab test report is delivered, the agent autonomously marks the corresponding requirement resolved.</li>
                      <li><strong>Hands-Free Google Sheet Sync:</strong> Changes are immediately pushed to your connected Master Google Sheet without anyone needing to click "Sync".</li>
                      <li><strong>Automated Telegram Alerts:</strong> Instant notifications for critical officer RFIs plus scheduled 08:30 MYT morning briefings.</li>
                    </ol>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-900 text-xs mb-1">Configuring Telegram Bot</h4>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px]">
                      <li>Open Telegram and chat with <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">@BotFather</code>.</li>
                      <li>Send <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">/newbot</code> and copy the bot API token.</li>
                      <li>Add the bot to your engineering Telegram group.</li>
                      <li>Open <strong>Automation & Telegram Bot</strong> in the header and paste your Token and Group Chat ID.</li>
                      <li>Click <strong>Test Telegram Alert</strong> to verify delivery.</li>
                    </ol>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-900 text-xs mb-1">Morning Schedule & Polling Cadence</h4>
                    <p className="text-slate-600 text-[11px]">
                      Autonomous polling runs continuously on your chosen cadence (e.g. <strong>every 15 minutes</strong>), and a comprehensive executive morning digest is dispatched at <strong>08:30 MYT</strong> daily.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'faq' && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-lg font-bold text-slate-900">6. Frequently Asked Questions & Deployment</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Answers to common setup, hosting, and data security questions.
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-900">Where is the data stored?</h4>
                    <p className="text-slate-600 text-[11px] mt-1">
                      All records are saved on the server in <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">./data/applications-store.json</code>. You retain 100% ownership of your regulatory data.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-900">Why is there no tick checkbox for pending actions waiting on third parties?</h4>
                    <p className="text-slate-600 text-[11px] mt-1">
                      Checkboxes are strictly reserved for <strong>internal team tasks</strong> (e.g. paying SIRIM processing fees, uploading spec sheets). When an item is pending due to an external third party (SIRIM officer evaluation, supplier docs, lab test report), you cannot manually tick it off because your team is waiting on them. Instead, it displays a pending clock indicator and resolves automatically when their incoming email or report is parsed, or you can click <strong>Draft Chaser / Follow-up</strong> to nudge them.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-900">How do I run this on our Raspberry Pi?</h4>
                    <p className="text-slate-600 text-[11px] mt-1">
                      Refer to the full instructions in <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">README.md</code>. Run <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">pm2 start ecosystem.config.cjs</code> to run 24/7 on boot. Access from any laptop on your local Wi-Fi via <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">http://raspberrypi.local:3000</code>.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200">
                    <h4 className="font-semibold text-slate-900">Can I export records to Excel or ERP?</h4>
                    <p className="text-slate-600 text-[11px] mt-1">
                      Yes! Click <strong>More Actions (···)</strong> &gt; <strong>Export Register to CSV</strong> anytime to download a spreadsheet compatible with Excel, Google Sheets, or internal databases.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Need offline reference? Check <code className="bg-slate-200/80 px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-700">USER_MANUAL.md</code> in the repository.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            Got It, Let's Work
          </button>
        </div>
      </div>
    </div>
  );
};
