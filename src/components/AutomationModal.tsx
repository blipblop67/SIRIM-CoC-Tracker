import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Bot,
  Send,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Mail,
  RefreshCw,
  HelpCircle,
  Play,
  ListFilter,
  ShieldCheck,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  Calendar,
  History,
  RotateCcw,
} from 'lucide-react';
import {
  AutomationConfig,
  AutomationLogEntry,
  SheetSyncConfig,
  SirimApplication,
  UserAuthSession,
} from '../types';

interface AutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AutomationConfig;
  onSaveConfig: (newConfig: AutomationConfig) => void;
  applications: SirimApplication[];
  sheetConfig: SheetSyncConfig | null;
  authSession: UserAuthSession | null;
  onRunAutomationNow: () => Promise<void>;
  isRunningAutomation: boolean;
  onAddLog: (entry: Omit<AutomationLogEntry, 'id'>) => void;
}

export const AutomationModal: React.FC<AutomationModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  applications,
  sheetConfig,
  authSession,
  onRunAutomationNow,
  isRunningAutomation,
  onAddLog,
}) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'telegram' | 'logs'>('schedule');
  const [localConfig, setLocalConfig] = useState<AutomationConfig>(config);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // Telegram test state
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Form saved notification state
  const [isSaved, setIsSaved] = useState(false);
  const [isSendingBriefing, setIsSendingBriefing] = useState(false);
  const [isResettingFirstScan, setIsResettingFirstScan] = useState(false);

  // Synchronize localConfig when external config prop updates
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  if (!isOpen) return null;

  const handleResetFirstScan = async () => {
    setIsResettingFirstScan(true);
    try {
      const res = await fetch('/api/automation/reset-first-scan', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.config) {
        handleUpdate({
          hasCompletedFirstScan: false,
          firstScanCompletedAt: undefined,
        });
      }
    } catch (e) {
      console.error('Failed to reset first scan:', e);
    } finally {
      setIsResettingFirstScan(false);
    }
  };

  const handleUpdate = (updates: Partial<AutomationConfig>) => {
    const updated = { ...localConfig, ...updates };
    setLocalConfig(updated);
    onSaveConfig(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleUpdateTelegram = (updates: Partial<typeof config.telegram>) => {
    const updated = {
      ...localConfig,
      telegram: {
        ...localConfig.telegram,
        ...updates,
      },
    };
    setLocalConfig(updated);
    onSaveConfig(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // Test Telegram Connection
  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    setTelegramTestResult(null);

    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: localConfig.telegram.botToken,
          chatId: localConfig.telegram.chatId,
          topicId: localConfig.telegram.topicId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.details || data.error || 'Failed to connect to Telegram');
      }

      setTelegramTestResult({
        success: true,
        message: 'Test message delivered to Telegram successfully! Check your Telegram chat.',
      });

      onAddLog({
        timestamp: new Date().toISOString(),
        type: 'TELEGRAM',
        status: 'SUCCESS',
        message: 'Telegram test message delivered successfully.',
      });
    } catch (err: any) {
      setTelegramTestResult({
        success: false,
        message: err.message || 'Error connecting to Telegram. Check your bot token and chat ID.',
      });

      onAddLog({
        timestamp: new Date().toISOString(),
        type: 'TELEGRAM',
        status: 'ERROR',
        message: `Telegram test failed: ${err.message}`,
      });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  // Send Full Real Morning Briefing to Telegram right now
  const handleSendTelegramBriefingNow = async () => {
    setIsSendingBriefing(true);
    setTelegramTestResult(null);

    try {
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: localConfig.telegram.botToken,
          chatId: localConfig.telegram.chatId,
          topicId: localConfig.telegram.topicId,
          applications: applications,
          sheetUrl: sheetConfig?.spreadsheetUrl,
          title: 'SIRIM CoC Daily Morning Briefing',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.details || data.error || 'Failed to dispatch Telegram briefing');
      }

      setTelegramTestResult({
        success: true,
        message: `Morning briefing (${applications.length} applications) delivered to Telegram chat successfully! Check your Telegram app.`,
      });

      onAddLog({
        timestamp: new Date().toISOString(),
        type: 'TELEGRAM',
        status: 'SUCCESS',
        message: `Manual Telegram briefing dispatched (${applications.length} applications).`,
      });
    } catch (err: any) {
      setTelegramTestResult({
        success: false,
        message: err.message || 'Error sending briefing to Telegram. Check bot token and chat permissions.',
      });

      onAddLog({
        timestamp: new Date().toISOString(),
        type: 'TELEGRAM',
        status: 'ERROR',
        message: `Telegram briefing failed: ${err.message}`,
      });
    } finally {
      setIsSendingBriefing(false);
    }
  };

  const isTelegramConfigured = Boolean(
    localConfig.telegram.botToken?.trim() && localConfig.telegram.chatId?.trim()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shadow-inner">
              <Zap className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Automated Morning Engine & Telegram Bot</h2>
                {localConfig.enabled && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Active (Daily {localConfig.scheduleTime} MYT)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300">
                Auto-scan Gmail inbox, sync Master Google Sheet, and dispatch team Telegram briefings.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('schedule')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'schedule'
                  ? 'border-indigo-600 text-indigo-600 bg-white shadow-xs rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4" />
              Daily Schedule & Pipeline
            </button>
            <button
              onClick={() => setActiveTab('telegram')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'telegram'
                  ? 'border-indigo-600 text-indigo-600 bg-white shadow-xs rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Send className="w-4 h-4" />
              Telegram Bot Integration
              {isTelegramConfigured ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'logs'
                  ? 'border-indigo-600 text-indigo-600 bg-white shadow-xs rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListFilter className="w-4 h-4" />
              Execution Logs ({localConfig.logs?.length || 0})
            </button>
          </div>

          {isSaved && (
            <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 animate-in fade-in">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: SCHEDULE & WORKFLOW */}
          {activeTab === 'schedule' && (
            <div className="space-y-6">
              {/* Master Automation Switch */}
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Enable Daily Morning Automation Pipeline
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Automatically runs every morning to ingest new SIRIM correspondence, update your Google Sheet, and dispatch Telegram updates.
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localConfig.enabled}
                    onChange={(e) => handleUpdate({ enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Time Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Scheduled Morning Time
                  </label>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <input
                      type="time"
                      value={localConfig.scheduleTime}
                      onChange={(e) => handleUpdate({ scheduleTime: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Timezone: <strong>Asia/Kuala_Lumpur (MYT UTC+8)</strong>
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Repeat Frequency
                  </label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <select
                      value={localConfig.intervalHours}
                      onChange={(e) => handleUpdate({ intervalHours: parseInt(e.target.value, 10) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                    >
                      <option value={24}>Every 24 Hours (Daily Morning)</option>
                      <option value={12}>Every 12 Hours (Twice Daily)</option>
                      <option value={6}>Every 6 Hours</option>
                      <option value={1}>Every 1 Hour (Continuous Monitoring)</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Recommended: <strong>Every 24 Hours (Daily Morning)</strong>
                  </p>
                </div>
              </div>

              {/* Step-by-Step Pipeline Configuration */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
                  Automated Pipeline Steps
                </h3>
                <div className="space-y-3">
                  {/* Step 1: Gmail Scanner */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="p-3.5 hover:border-slate-300 transition-colors flex items-center justify-between bg-white">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs">
                          1
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-sky-600" />
                            <span className="text-sm font-semibold text-slate-800">
                              Auto-Scan Gmail Inbox & AI Parse
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Scans emails for SIRIM status updates, RFIs, test sample call notices, and invoices.
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={localConfig.autoScanGmail}
                        onChange={(e) => handleUpdate({ autoScanGmail: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Differentiated Scan Duration Policy (1 Year First-Time vs 1 Month Routine) */}
                    {localConfig.autoScanGmail && (
                      <div className="px-4 py-3 bg-sky-50/50 border-t border-slate-200 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <History className="w-4 h-4 text-sky-600" />
                            <span className="text-xs font-bold text-slate-800">
                              Email Ingestion Duration Strategy
                            </span>
                          </div>

                          {localConfig.hasCompletedFirstScan ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                Routine Mode Active (1 Month)
                              </span>
                              <button
                                type="button"
                                onClick={handleResetFirstScan}
                                disabled={isResettingFirstScan}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-sky-700 hover:bg-sky-100 px-2 py-0.5 rounded border border-slate-300 bg-white transition-colors"
                                title="Reset first scan status so next run scans 1 whole year"
                              >
                                <RotateCcw className={`w-3 h-3 ${isResettingFirstScan ? 'animate-spin' : ''}`} />
                                Re-run 1-Year Scan
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              <Sparkles className="w-3 h-3 text-amber-600" />
                              Pending 1st Scan: Next run will scan 1 Whole Year (365d)
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800">First-Time Scan Duration</span>
                              <span className="text-[11px] text-sky-700 font-bold">
                                {localConfig.firstScanDurationDays || 365} Days (1 Year)
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Builds complete historical registry of CoC certificates, ongoing testing jobs, and prior RFIs.
                            </p>
                            <div className="pt-1.5 flex items-center gap-2">
                              <label className="text-[11px] text-slate-600">Scan duration (days):</label>
                              <input
                                type="number"
                                min={30}
                                max={1095}
                                value={localConfig.firstScanDurationDays || 365}
                                onChange={(e) =>
                                  handleUpdate({
                                    firstScanDurationDays: parseInt(e.target.value, 10) || 365,
                                  })
                                }
                                className="w-20 px-2 py-1 text-xs border border-slate-300 rounded font-semibold text-slate-800"
                              />
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800">Routine Daily Scan Duration</span>
                              <span className="text-[11px] text-emerald-700 font-bold">
                                {localConfig.routineScanDurationDays || 30} Days (1 Month)
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Focuses solely on recent officer clarifications, pending RFIs, sample arrivals, and fee invoices.
                            </p>
                            <div className="pt-1.5 flex items-center gap-2">
                              <label className="text-[11px] text-slate-600">Scan duration (days):</label>
                              <input
                                type="number"
                                min={1}
                                max={365}
                                value={localConfig.routineScanDurationDays || 30}
                                onChange={(e) =>
                                  handleUpdate({
                                    routineScanDurationDays: parseInt(e.target.value, 10) || 30,
                                  })
                                }
                                className="w-20 px-2 py-1 text-xs border border-slate-300 rounded font-semibold text-slate-800"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Master Sheet Sync */}
                  <div className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        2
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          <span className="text-sm font-semibold text-slate-800">
                            Auto-Sync Master Google Sheet
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Automatically synchronizes all active applications, SLA deadlines, and direct Gmail thread links to Google Sheets.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={localConfig.autoSyncGoogleSheet}
                      onChange={(e) => handleUpdate({ autoSyncGoogleSheet: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Step 3: Telegram Briefing */}
                  <div className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                        3
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-indigo-600" />
                          <span className="text-sm font-semibold text-slate-800">
                            Dispatch Telegram Morning Briefing & Urgent Alerts
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Sends formatted summaries with action item highlights, pending deadlines, and direct links to your Telegram group.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={localConfig.autoSendTelegram}
                      onChange={(e) => handleUpdate({ autoSendTelegram: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Trigger Now Action */}
              <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Test / Trigger Automation Run On-Demand
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Immediately scan Gmail, update Google Sheet, and deliver the Telegram briefing right now.
                  </p>
                </div>

                <button
                  onClick={onRunAutomationNow}
                  disabled={isRunningAutomation}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
                >
                  {isRunningAutomation ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Running Pipeline...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      Run Automation Now
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TELEGRAM BOT INTEGRATION */}
          {activeTab === 'telegram' && (
            <div className="space-y-6">
              {/* Telegram Connection Status Card */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  isTelegramConfigured
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : 'border-amber-200 bg-amber-50/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isTelegramConfigured ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                    }`}
                  >
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        {isTelegramConfigured ? 'Telegram Bot Connected' : 'Telegram Bot Setup Required'}
                      </h3>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isTelegramConfigured
                            ? 'bg-emerald-200 text-emerald-800'
                            : 'bg-amber-200 text-amber-800'
                        }`}
                      >
                        {isTelegramConfigured ? 'Ready' : 'Pending Token'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {isTelegramConfigured
                        ? `Configured to deliver alerts to Chat ID: ${localConfig.telegram.chatId}`
                        : 'Enter your Telegram Bot Token & Chat ID below to receive morning briefings.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleTestTelegram}
                    disabled={isTestingTelegram || !isTelegramConfigured}
                    className="bg-white border border-slate-200 hover:border-slate-300 text-slate-800 hover:text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-40"
                    title="Send a quick test message to verify the bot can reach your chat"
                  >
                    {isTestingTelegram ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 text-indigo-500" />
                        Send Test Ping
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleSendTelegramBriefingNow}
                    disabled={isSendingBriefing || !isTelegramConfigured}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-40"
                    title="Send the full formatted morning briefing with your active applications right now"
                  >
                    {isSendingBriefing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Sending Briefing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        Send Full Briefing Now
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 24/7 Background Scheduler Indicator */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-950">
                  <span className="font-semibold text-indigo-900">24/7 Autonomous Background Scheduler: </span>
                  When running on your local machine or server, the backend engine automatically dispatches your Telegram morning briefing at <strong>{localConfig.scheduleTime} MYT</strong> every day, even when this browser tab is closed.
                </div>
              </div>

              {telegramTestResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
                    telegramTestResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {telegramTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold">
                      {telegramTestResult.success ? 'Success: ' : 'Failed: '}
                    </span>
                    {telegramTestResult.message}
                  </div>
                </div>
              )}

              {/* Bot Credentials Form */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Telegram Bot Token <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400">From @BotFather</span>
                  </div>
                  <input
                    type="password"
                    value={localConfig.telegram.botToken}
                    onChange={(e) => handleUpdateTelegram({ botToken: e.target.value })}
                    placeholder="e.g. 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Created via Telegram's official <code className="bg-slate-100 px-1 py-0.5 rounded">@BotFather</code>.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Chat ID / Group ID <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] text-slate-400">User or Group</span>
                    </div>
                    <input
                      type="text"
                      value={localConfig.telegram.chatId}
                      onChange={(e) => handleUpdateTelegram({ chatId: e.target.value })}
                      placeholder="e.g. 987654321 or -1001234567890"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Personal Chat ID or Group ID (negative number with <code className="bg-slate-100 px-1 py-0.5 rounded">-100</code> prefix).
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Message Thread / Topic ID <span className="text-slate-400">(Optional)</span>
                      </label>
                      <span className="text-[11px] text-slate-400">For Forum Groups</span>
                    </div>
                    <input
                      type="text"
                      value={localConfig.telegram.topicId || ''}
                      onChange={(e) => handleUpdateTelegram({ topicId: e.target.value })}
                      placeholder="e.g. 42 (Optional)"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Specify if sending directly to a specific Supergroup forum topic.
                    </p>
                  </div>
                </div>

                {/* Notification Preferences */}
                <div className="pt-2 border-t border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Notification Types
                  </h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localConfig.telegram.dailyDigest}
                        onChange={(e) => handleUpdateTelegram({ dailyDigest: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-medium text-slate-700">
                        Send Daily Morning Status Digest (Every morning at {localConfig.scheduleTime} MYT)
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localConfig.telegram.instantAlertOnCritical}
                        onChange={(e) =>
                          handleUpdateTelegram({ instantAlertOnCritical: e.target.checked })
                        }
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-medium text-slate-700">
                        Highlight urgent SIRIM RFIs & Deadlines approaching within 3 days
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Step-by-step Setup Helper Accordion */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <button
                  onClick={() => setShowSetupGuide(!showSetupGuide)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-600" />
                    How to create a Telegram Bot & get your Chat ID in 2 minutes
                  </span>
                  {showSetupGuide ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                {showSetupGuide && (
                  <div className="px-4 pb-4 pt-2 text-xs text-slate-600 space-y-3 border-t border-slate-200 bg-white">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <p>
                        Open Telegram and message <strong>@BotFather</strong>. Type <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700">/newbot</code> and follow the prompts to choose a bot name (e.g. <em>Cytron SIRIM CoC Bot</em>).
                      </p>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <p>
                        Copy the <strong>HTTP API Token</strong> given by @BotFather and paste it into the <em>Telegram Bot Token</em> field above.
                      </p>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <p>
                        Start a chat with your bot (click <strong>Start</strong>) or add it to your Telegram Group. To get your Chat ID, message <strong>@userinfobot</strong> or invite <strong>@RawDataBot</strong> to your group.
                      </p>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        4
                      </span>
                      <p>
                        Paste the Chat ID above and click <strong>Send Test Ping</strong> to verify the connection!
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: EXECUTION LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Automation Activity & History</h3>
                  <p className="text-xs text-slate-500">
                    Timestamped record of automated Gmail scans, AI parsings, Google Sheet synchronizations, and Telegram briefings.
                  </p>
                </div>
                {localConfig.logs?.length > 0 && (
                  <button
                    onClick={() => handleUpdate({ logs: [] })}
                    className="text-xs text-rose-600 hover:underline font-medium"
                  >
                    Clear History
                  </button>
                )}
              </div>

              {localConfig.logs && localConfig.logs.length > 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {localConfig.logs.slice(0, 25).map((log) => {
                    const statusColor =
                      log.status === 'SUCCESS'
                        ? 'bg-emerald-100 text-emerald-800'
                        : log.status === 'ERROR'
                        ? 'bg-rose-100 text-rose-800'
                        : log.status === 'WARNING'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700';

                    return (
                      <div key={log.id} className="p-3 bg-white hover:bg-slate-50/80 transition-colors flex items-start gap-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 mt-0.5 ${statusColor}`}>
                          {log.status}
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                              {log.type === 'SCAN' && <Mail className="w-3.5 h-3.5 text-sky-600" />}
                              {log.type === 'SHEET_SYNC' && <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
                              {log.type === 'TELEGRAM' && <Send className="w-3.5 h-3.5 text-indigo-600" />}
                              {log.type === 'SYSTEM' && <Zap className="w-3.5 h-3.5 text-amber-500" />}
                              {log.message}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          {log.details && (
                            <p className="text-[11px] text-slate-500 mt-0.5 font-mono break-all">
                              {log.details}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                  <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                  <h4 className="text-xs font-semibold text-slate-700">No Automation Logs Yet</h4>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                    Logs will automatically appear here once scheduled cycles run or when you click "Run Automation Now".
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            Runs automatically in background & triggers updates on your schedule.
          </div>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
