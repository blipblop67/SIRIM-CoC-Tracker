import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  FileSpreadsheet,
  Mail,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  Radio,
  FileText,
  Layers,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  SirimApplication,
  SheetSyncConfig,
  UserAuthSession,
  AutomationConfig,
  AutomationLogEntry,
} from './types';
import { INITIAL_SIRIM_APPLICATIONS } from './data/sampleApplications';
import { Header } from './components/Header';
import { StatsBanner } from './components/StatsBanner';
import { FilterBar } from './components/FilterBar';
import { ApplicationCard } from './components/ApplicationCard';
import { ApplicationTable } from './components/ApplicationTable';
import { ApplicationDetailModal } from './components/ApplicationDetailModal';
import { GoogleSheetSyncModal } from './components/GoogleSheetSyncModal';
import { GmailScannerModal } from './components/GmailScannerModal';
import { NewApplicationModal } from './components/NewApplicationModal';
import { NotificationDrawer } from './components/NotificationDrawer';
import { AutomationModal } from './components/AutomationModal';
import {
  getStoredAuthSession,
  googleSignIn,
  googleSignOut,
  initAuth,
} from './utils/auth';
import { notificationAudio } from './utils/audio';

const APPS_STORAGE_KEY = 'sirim_coc_applications_v1';
const SHEET_CONFIG_KEY = 'sirim_coc_sheet_config_v1';
const AUTOMATION_CONFIG_KEY = 'sirim_coc_automation_config_v1';

const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  enabled: true,
  scheduleTime: '08:30',
  timezone: 'Asia/Kuala_Lumpur',
  intervalHours: 24,
  autoScanGmail: true,
  autoSyncGoogleSheet: true,
  autoSendTelegram: true,
  alertOnCriticalOnly: false,
  telegram: {
    botToken: '',
    chatId: '',
    topicId: '',
    enabled: true,
    dailyDigest: true,
    instantAlertOnCritical: true,
  },
  logs: [
    {
      id: 'log-init-1',
      timestamp: new Date().toISOString(),
      type: 'SYSTEM',
      status: 'INFO',
      message: 'Automated morning scan & Telegram bot scheduler initialized.',
    },
  ],
};

// Deduplicate applications and ensure unique keys
function sanitizeApplications(apps: SirimApplication[]): SirimApplication[] {
  const result: SirimApplication[] = [];

  for (const app of apps) {
    if (!app) continue;
    const cleanId = app.id || `sirim-app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const cleanRef = (app.applicationRef || '').trim().toLowerCase();

    // Check if duplicate by ID or exact reference
    const isGenericRef = !cleanRef || cleanRef.includes('sqas/gen');
    const existingIndex = result.findIndex(
      (existing) => existing.id === cleanId || (!isGenericRef && existing.applicationRef.trim().toLowerCase() === cleanRef)
    );

    if (existingIndex >= 0) {
      // Merge with existing record
      const existing = result[existingIndex];
      const mergedEmails = [...(existing.emailThreads || [])];
      for (const msg of app.emailThreads || []) {
        if (!mergedEmails.some((m) => m.id === msg.id)) {
          mergedEmails.push(msg);
        }
      }
      result[existingIndex] = {
        ...existing,
        ...app,
        id: existing.id, // Keep the established unique ID
        emailThreads: mergedEmails,
        actionItems: app.actionItems?.length ? app.actionItems : existing.actionItems,
        timeline: app.timeline?.length ? app.timeline : existing.timeline,
      };
    } else {
      result.push({
        ...app,
        id: cleanId,
      });
    }
  }

  return result;
}

export default function App() {
  // 1. Applications State (Starts clean with 0 dummy data)
  const [applications, setApplications] = useState<SirimApplication[]>(() => {
    try {
      const saved = localStorage.getItem(APPS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return sanitizeApplications(parsed);
        }
      }
    } catch (e) {
      console.warn('Could not read saved applications', e);
    }
    return [];
  });

  // 2. Google Sheet Sync Config State
  const [sheetConfig, setSheetConfig] = useState<SheetSyncConfig | null>(() => {
    try {
      const saved = localStorage.getItem(SHEET_CONFIG_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return null;
  });

  // 2.5. Automation & Telegram Bot State
  const [automationConfig, setAutomationConfig] = useState<AutomationConfig>(() => {
    try {
      const saved = localStorage.getItem(AUTOMATION_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_AUTOMATION_CONFIG,
          ...parsed,
          telegram: {
            ...DEFAULT_AUTOMATION_CONFIG.telegram,
            ...(parsed.telegram || {}),
          },
        };
      }
    } catch (e) {}
    return DEFAULT_AUTOMATION_CONFIG;
  });

  // 3. Auth Session State
  const [authSession, setAuthSession] = useState<UserAuthSession | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (session) => setAuthSession(session),
      () => setAuthSession(null)
    );
    return () => unsubscribe();
  }, []);

  // 4. Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [schemeFilter, setSchemeFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // 5. Modal States
  const [selectedApplication, setSelectedApplication] = useState<SirimApplication | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<'actions' | 'timeline' | 'emails' | 'ai-reply' | 'dossier'>('actions');
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [isGmailScannerOpen, setIsGmailScannerOpen] = useState(false);
  const [isNewAppModalOpen, setIsNewAppModalOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [isAutomationModalOpen, setIsAutomationModalOpen] = useState(false);

  // Sync and Automation Runner state
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [isRunningAutomation, setIsRunningAutomation] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Save applications to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(applications));
    } catch (e) {
      console.error('Failed to save applications', e);
    }
  }, [applications]);

  // Save sheetConfig to localStorage
  const handleSaveSheetConfig = (newConfig: SheetSyncConfig) => {
    setSheetConfig(newConfig);
    try {
      localStorage.setItem(SHEET_CONFIG_KEY, JSON.stringify(newConfig));
    } catch (e) {}
  };

  // Save automationConfig to localStorage
  const handleSaveAutomationConfig = (newConfig: AutomationConfig) => {
    setAutomationConfig(newConfig);
    try {
      localStorage.setItem(AUTOMATION_CONFIG_KEY, JSON.stringify(newConfig));
    } catch (e) {}
  };

  const handleAddAutomationLog = (entry: Omit<AutomationLogEntry, 'id'>) => {
    const newLog: AutomationLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    const updatedLogs = [newLog, ...(automationConfig.logs || [])].slice(0, 100);
    handleSaveAutomationConfig({
      ...automationConfig,
      logs: updatedLogs,
    });
  };

  // Automated Pipeline Execution Routine (Gmail Scan -> Sheet Sync -> Telegram Broadcast)
  const handleRunAutomationNow = async () => {
    if (isRunningAutomation) return;
    setIsRunningAutomation(true);

    handleAddAutomationLog({
      timestamp: new Date().toISOString(),
      type: 'SYSTEM',
      status: 'INFO',
      message: 'Morning Automation Pipeline cycle initiated.',
    });

    try {
      const res = await fetch('/api/automation/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authSession?.accessToken ? { Authorization: `Bearer ${authSession.accessToken}` } : {}),
        },
        body: JSON.stringify({
          spreadsheetId: sheetConfig?.spreadsheetId,
          sheetName: sheetConfig?.sheetName || 'Active CoC Applications',
          applications: applications,
          telegramConfig: automationConfig.telegram,
          scanQuery: 'from:sirim.my OR subject:ecomm OR subject:sqas OR subject:sirim',
          options: {
            autoScanGmail: automationConfig.autoScanGmail,
            autoSyncSheet: automationConfig.autoSyncGoogleSheet,
            autoSendTelegram: automationConfig.autoSendTelegram,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete automation cycle');
      }

      // 1. Update applications if new or updated
      if (Array.isArray(data.applications) && data.applications.length > 0) {
        setApplications(sanitizeApplications(data.applications));
      }

      // 2. Update Google Sheet timestamp if synced
      if (sheetConfig && data.sheetSyncResult?.success) {
        const updatedSheetConfig: SheetSyncConfig = {
          ...sheetConfig,
          lastSynced: new Date().toISOString(),
          rowsCount: (data.applications?.length || applications.length) + 1,
        };
        handleSaveSheetConfig(updatedSheetConfig);
      }

      // 3. Append returned automation logs
      if (Array.isArray(data.logs)) {
        const newLogs: AutomationLogEntry[] = data.logs.map((l: any) => ({
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: l.timestamp || new Date().toISOString(),
          type: l.type || 'SYSTEM',
          status: l.status || 'INFO',
          message: l.message || '',
          details: l.details,
        }));
        const combined = [...newLogs, ...(automationConfig.logs || [])].slice(0, 100);

        handleSaveAutomationConfig({
          ...automationConfig,
          lastRunAt: new Date().toISOString(),
          lastRunStatus: 'SUCCESS',
          lastRunSummary: `Scanned ${data.scanResult?.threadsFound || 0} emails, updated ${data.applications?.length || applications.length} apps, Telegram dispatched.`,
          logs: combined,
        });
      }

      setSyncFeedback({
        message: `Automation Cycle Complete: Scanned Gmail, updated Sheet & dispatched Telegram briefing!`,
        type: 'success',
      });
      notificationAudio.playSuccessTone();
      confetti({ particleCount: 50, spread: 70 });
    } catch (err: any) {
      console.error('Automation run error:', err);
      handleAddAutomationLog({
        timestamp: new Date().toISOString(),
        type: 'SYSTEM',
        status: 'ERROR',
        message: `Automation cycle encountered an error: ${err.message}`,
        details: err.stack,
      });

      handleSaveAutomationConfig({
        ...automationConfig,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: 'ERROR',
        lastRunSummary: `Failed: ${err.message}`,
      });

      setSyncFeedback({
        message: `Automation error: ${err.message}`,
        type: 'error',
      });
    } finally {
      setIsRunningAutomation(false);
      setTimeout(() => setSyncFeedback(null), 8000);
    }
  };

  // Background Auto-Scheduler Timer (Checks every 30 seconds for scheduled morning trigger)
  useEffect(() => {
    if (!automationConfig.enabled) return;

    const interval = setInterval(() => {
      const now = new Date();
      // Format current time HH:MM in Asia/Kuala_Lumpur or local time
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${hours}:${minutes}`;

      if (currentTimeStr === automationConfig.scheduleTime) {
        // Check if we haven't already run today
        const lastRun = automationConfig.lastRunAt ? new Date(automationConfig.lastRunAt) : null;
        const isAlreadyRunToday =
          lastRun &&
          lastRun.getDate() === now.getDate() &&
          lastRun.getMonth() === now.getMonth() &&
          lastRun.getFullYear() === now.getFullYear();

        if (!isAlreadyRunToday && !isRunningAutomation) {
          console.log(`[Scheduler] Triggering scheduled morning automation at ${currentTimeStr}`);
          handleRunAutomationNow();
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [automationConfig, isRunningAutomation, applications, sheetConfig, authSession]);


  // Google OAuth Client setup
  const handleConnectGoogle = async () => {
    try {
      const session = await googleSignIn();
      if (session) {
        setAuthSession(session);
        notificationAudio.playSuccessTone();
      }
    } catch (error) {
      console.error('Google Auth error:', error);
    }
  };

  const handleDisconnectGoogle = async () => {
    await googleSignOut();
    setAuthSession(null);
  };

  // Sync to Sheet
  const handleSyncToGoogleSheet = async () => {
    if (!sheetConfig?.spreadsheetId) {
      setIsSheetModalOpen(true);
      return;
    }

    if (!authSession?.accessToken) {
      setSyncFeedback({
        message: 'Please connect your Google Account first to sync with Google Sheets.',
        type: 'error',
      });
      return;
    }

    setIsSyncingSheet(true);
    setSyncFeedback(null);

    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.accessToken}`,
        },
        body: JSON.stringify({
          spreadsheetId: sheetConfig.spreadsheetId,
          sheetName: sheetConfig.sheetName || 'Active CoC Applications',
          applications: applications,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync to Google Sheet');
      }

      const updatedConfig: SheetSyncConfig = {
        ...sheetConfig,
        lastSynced: new Date().toISOString(),
        rowsCount: applications.length + 1,
      };
      handleSaveSheetConfig(updatedConfig);

      // Mark all apps as synced
      setApplications((prev) =>
        prev.map((app) => ({
          ...app,
          syncedToSheet: true,
          lastSyncedAt: new Date().toISOString(),
        }))
      );

      setSyncFeedback({
        message: `Successfully synchronized ${applications.length} applications to Google Sheet!`,
        type: 'success',
      });
      notificationAudio.playSuccessTone();
      confetti({ particleCount: 40, spread: 60 });
    } catch (err: any) {
      console.error(err);
      setSyncFeedback({
        message: err.message || 'Error syncing to Google Sheet.',
        type: 'error',
      });
    } finally {
      setIsSyncingSheet(false);
      setTimeout(() => setSyncFeedback(null), 6000);
    }
  };

  // Toggle Action Item Checkbox
  const handleToggleActionItem = (appId: string, actionItemId: string) => {
    setApplications((prev) =>
      prev.map((app) => {
        if (app.id === appId) {
          const updatedActions = app.actionItems.map((act) => {
            if (act.id === actionItemId) {
              const nextState = !act.isCompleted;
              return {
                ...act,
                isCompleted: nextState,
                completedAt: nextState ? new Date().toISOString() : undefined,
              };
            }
            return act;
          });

          // Check if all actions completed & status was RFI -> can suggest moving to in review
          return {
            ...app,
            actionItems: updatedActions,
          };
        }
        return app;
      })
    );

    // Also update selected application if open
    if (selectedApplication && selectedApplication.id === appId) {
      setSelectedApplication((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          actionItems: prev.actionItems.map((act) =>
            act.id === actionItemId
              ? {
                  ...act,
                  isCompleted: !act.isCompleted,
                  completedAt: !act.isCompleted ? new Date().toISOString() : undefined,
                }
              : act
          ),
        };
      });
    }
  };

  // Update full application from detail modal
  const handleUpdateApplication = (updatedApp: SirimApplication) => {
    setApplications((prev) => prev.map((a) => (a.id === updatedApp.id ? updatedApp : a)));
    setSelectedApplication(updatedApp);
  };

  // Add new application from Modal / AI parser
  const handleAddApplication = (newApp: SirimApplication) => {
    setApplications((prev) => sanitizeApplications([newApp, ...prev]));
    // If sheet configured and auto-sync active, trigger sync
    if (sheetConfig?.spreadsheetId && authSession?.accessToken) {
      setTimeout(() => handleSyncToGoogleSheet(), 500);
    }
  };

  // Import batch from Gmail scanner
  const handleImportApplications = (newApps: SirimApplication[]) => {
    setApplications((prev) => sanitizeApplications([...newApps, ...prev]));

    if (sheetConfig?.spreadsheetId && authSession?.accessToken) {
      setTimeout(() => handleSyncToGoogleSheet(), 500);
    }
  };

  // Quick Open AI reply in modal
  const handleQuickDraftReply = (app: SirimApplication) => {
    setSelectedApplication(app);
    setDetailInitialTab('ai-reply');
    setIsDetailModalOpen(true);
  };

  // Open full details
  const handleOpenDetails = (app: SirimApplication) => {
    setSelectedApplication(app);
    setDetailInitialTab('actions');
    setIsDetailModalOpen(true);
  };

  // Filtered Applications
  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRef = app.applicationRef.toLowerCase().includes(q);
        const matchesProduct = app.productName.toLowerCase().includes(q);
        const matchesModel = app.modelNumber.toLowerCase().includes(q);
        const matchesBrand = app.brand.toLowerCase().includes(q);
        const matchesOfficer = (app.officerName || '').toLowerCase().includes(q);
        const matchesActions = app.actionItems.some((a) => a.title.toLowerCase().includes(q));

        if (!matchesRef && !matchesProduct && !matchesModel && !matchesBrand && !matchesOfficer && !matchesActions) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === 'ACTION_REQUIRED') {
        const isActionStatus = ['RFI_ACTION_REQUIRED', 'SAMPLE_REQUESTED', 'PAYMENT_PENDING'].includes(app.status);
        const hasPendingApplicantAction = app.actionItems.some((a) => !a.isCompleted && a.assignedTo === 'APPLICANT');
        if (!isActionStatus && !hasPendingApplicantAction) return false;
      } else if (statusFilter === 'IN_PROGRESS') {
        if (!['SUBMITTED', 'UNDER_REVIEW', 'SAMPLE_SUBMITTED', 'TESTING_IN_PROGRESS', 'FINAL_EVALUATION'].includes(app.status)) {
          return false;
        }
      } else if (statusFilter === 'APPROVED') {
        if (app.status !== 'APPROVED') return false;
      } else if (statusFilter === 'PAYMENT') {
        if (app.status !== 'PAYMENT_PENDING' && app.paymentStatus !== 'UNPAID') return false;
      }

      // Scheme filter
      if (schemeFilter !== 'ALL' && app.scheme !== schemeFilter) {
        return false;
      }

      // Assignee filter
      if (assigneeFilter !== 'ALL') {
        const hasAssigneeAction = app.actionItems.some(
          (a) => !a.isCompleted && a.assignedTo === assigneeFilter
        );
        if (!hasAssigneeAction) return false;
      }

      return true;
    });
  }, [applications, searchQuery, statusFilter, schemeFilter, assigneeFilter]);

  // Counts for header badge
  const pendingActionsCount = useMemo(() => {
    return applications
      .flatMap((a) => a.actionItems)
      .filter((act) => !act.isCompleted).length;
  }, [applications]);

  const criticalActionsCount = useMemo(() => {
    return applications
      .flatMap((a) => a.actionItems)
      .filter((act) => !act.isCompleted && act.priority === 'CRITICAL').length;
  }, [applications]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        sheetConfig={sheetConfig}
        authSession={authSession}
        automationConfig={automationConfig}
        pendingActionsCount={pendingActionsCount}
        criticalActionsCount={criticalActionsCount}
        onOpenSheetModal={() => setIsSheetModalOpen(true)}
        onOpenGmailScanner={() => setIsGmailScannerOpen(true)}
        onOpenNewAppModal={() => setIsNewAppModalOpen(true)}
        onOpenNotificationDrawer={() => setIsNotificationDrawerOpen(true)}
        onOpenAutomationModal={() => setIsAutomationModalOpen(true)}
        onConnectGoogle={handleConnectGoogle}
        onDisconnectGoogle={handleDisconnectGoogle}
        onManualSyncSheet={handleSyncToGoogleSheet}
        isSyncingSheet={isSyncingSheet}
        isRunningAutomation={isRunningAutomation}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Sync Feedback Alert */}
        {syncFeedback && (
          <div
            className={`mb-4 p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-xs transition-all ${
              syncFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-rose-50 text-rose-800 border-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {syncFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{syncFeedback.message}</span>
            </div>
            {sheetConfig?.spreadsheetUrl && syncFeedback.type === 'success' && (
              <a
                href={sheetConfig.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="underline flex items-center gap-1 hover:text-emerald-950"
              >
                <span>View Sheet</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Stats & KPI Highlights */}
        <StatsBanner
          applications={applications}
          sheetConfig={sheetConfig}
          onFilterStatus={(st) => setStatusFilter(st)}
          onOpenSheetModal={() => setIsSheetModalOpen(true)}
        />

        {/* Search, Status Tabs & Filters */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          schemeFilter={schemeFilter}
          onSchemeFilterChange={setSchemeFilter}
          assigneeFilter={assigneeFilter}
          onAssigneeFilterChange={setAssigneeFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          totalFilteredCount={filteredApplications.length}
        />

        {/* Applications List */}
        {applications.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 sm:p-14 text-center space-y-6 shadow-xs max-w-2xl mx-auto my-6">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600 shadow-xs">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-800">No SIRIM Applications Loaded</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                Your tracker is clean and ready. Connect your Google account to scan for SIRIM e-ComM correspondence, sync with your Google Sheet, or manually ingest an application.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                onClick={() => {
                  if (!authSession?.isAuthenticated) {
                    handleConnectGoogle();
                  } else {
                    setIsGmailScannerOpen(true);
                  }
                }}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300 text-indigo-700 font-semibold text-xs transition-all group"
              >
                <Mail className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition-transform" />
                <span>Scan Gmail Inbox</span>
              </button>

              <button
                onClick={() => setIsNewAppModalOpen(true)}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-700 font-semibold text-xs transition-all group"
              >
                <Plus className="w-5 h-5 text-slate-600 group-hover:scale-110 transition-transform" />
                <span>Add / Ingest Email</span>
              </button>

              <button
                onClick={() => setIsSheetModalOpen(true)}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300 text-emerald-700 font-semibold text-xs transition-all group"
              >
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-transform" />
                <span>Connect Google Sheet</span>
              </button>
            </div>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-800">No applications matched your criteria</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try adjusting your search query, status filters, or scan your Gmail inbox for new SIRIM emails.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setSchemeFilter('ALL');
                  setAssigneeFilter('ALL');
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Clear All Filters
              </button>
              <button
                onClick={() => setIsNewAppModalOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors"
              >
                + Ingest Email
              </button>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApplications.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                onSelect={handleOpenDetails}
                onToggleActionItem={handleToggleActionItem}
                onQuickDraftReply={handleQuickDraftReply}
              />
            ))}
          </div>
        ) : (
          <ApplicationTable
            applications={filteredApplications}
            onSelect={handleOpenDetails}
            onQuickDraftReply={handleQuickDraftReply}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">SIRIM CoC Progress Tracker</span>
            <span>•</span>
            <span>MCMC e-ComM, CIDB & Malaysian Standards</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span>Powered by Gemini AI & Google Workspace</span>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <ApplicationDetailModal
        isOpen={isDetailModalOpen}
        application={selectedApplication}
        onClose={() => setIsDetailModalOpen(false)}
        onUpdateApplication={handleUpdateApplication}
        initialTab={detailInitialTab}
      />

      <GoogleSheetSyncModal
        isOpen={isSheetModalOpen}
        onClose={() => setIsSheetModalOpen(false)}
        sheetConfig={sheetConfig}
        authSession={authSession}
        applications={applications}
        onSaveSheetConfig={handleSaveSheetConfig}
        onConnectGoogle={handleConnectGoogle}
      />

      <GmailScannerModal
        isOpen={isGmailScannerOpen}
        onClose={() => setIsGmailScannerOpen(false)}
        authSession={authSession}
        onConnectGoogle={handleConnectGoogle}
        onImportApplications={handleImportApplications}
      />

      <NewApplicationModal
        isOpen={isNewAppModalOpen}
        onClose={() => setIsNewAppModalOpen(false)}
        onAddApplication={handleAddApplication}
      />

      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        applications={applications}
        onToggleActionItem={handleToggleActionItem}
        onSelectApplication={handleOpenDetails}
        onQuickDraftReply={handleQuickDraftReply}
      />

      <AutomationModal
        isOpen={isAutomationModalOpen}
        onClose={() => setIsAutomationModalOpen(false)}
        config={automationConfig}
        onSaveConfig={handleSaveAutomationConfig}
        applications={applications}
        sheetConfig={sheetConfig}
        authSession={authSession}
        onRunAutomationNow={handleRunAutomationNow}
        isRunningAutomation={isRunningAutomation}
        onAddLog={handleAddAutomationLog}
      />
    </div>
  );
}
