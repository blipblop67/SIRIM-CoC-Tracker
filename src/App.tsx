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
  Trash2,
  BookOpen,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  SirimApplication,
  SheetSyncConfig,
  UserAuthSession,
  AutomationConfig,
  AutomationLogEntry,
  UserPresence,
  TeamActivityLog,
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
import { DocumentPreScreenModal } from './components/DocumentPreScreenModal';
import { isActionRequired, isPendingStatement } from './utils/actionItemUtils';
import { TeamActivityDrawer } from './components/TeamActivityDrawer';
import { UserManualModal } from './components/UserManualModal';
import { AutonomousAgentBanner } from './components/AutonomousAgentBanner';
import { exportApplicationsToCsv } from './utils/exportCsv';
import {
  getStoredAuthSession,
  googleSignIn,
  googleSignOut,
  initAuth,
} from './utils/auth';
import { notificationAudio } from './utils/audio';
import { safeFetchJson } from './utils/api';
import {
  isOutOfOfficeApplication,
  isOutOfOfficeSubject,
  isOutOfOfficeText,
} from './utils/outOfOffice';

const APPS_STORAGE_KEY = 'sirim_coc_applications_v2';
const LEGACY_APPS_STORAGE_KEY_V1 = 'sirim_coc_applications_v1';
const SHEET_CONFIG_KEY = 'sirim_coc_sheet_config_v1';
const AUTOMATION_CONFIG_KEY = 'sirim_coc_automation_config_v1';

const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  enabled: true,
  scheduleTime: '08:30',
  timezone: 'Asia/Kuala_Lumpur',
  intervalHours: 24,
  autonomousIntervalMinutes: 15,
  autoScanGmail: true,
  autoSyncGoogleSheet: true,
  autoSendTelegram: true,
  autoProgressEvaluation: true,
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

// Deduplicate applications and ensure unique keys, removing any legacy mock samples
function sanitizeApplications(apps: SirimApplication[]): SirimApplication[] {
  const result: SirimApplication[] = [];

  for (const app of apps) {
    if (!app || typeof app !== 'object') continue;

    const id = String(app.id || '');
    const model = String(app.modelNumber || '');
    const name = String(app.productName || '');

    // Exclude mock dummy items
    if (
      id.startsWith('sirim-app-00') ||
      id === 'sirim-app-001' ||
      id === 'sirim-app-002' ||
      id === 'sirim-app-003' ||
      id === 'sirim-app-004'
    ) {
      continue;
    }
    if (
      model === 'CYT-FEATHER-S3-V2' ||
      model === 'CYT-GAN100-4P' ||
      model === 'CYT-SOIL-V1'
    ) {
      continue;
    }
    if (
      name.includes('Maker Feather') ||
      name.includes('100W GaN Desktop') ||
      name.includes('Smart Soil')
    ) {
      continue;
    }

    // Exclude any Out-of-Office or automated reply records
    if (
      isOutOfOfficeApplication(app) ||
      isOutOfOfficeSubject(name) ||
      isOutOfOfficeSubject(app.emailSubject || '') ||
      isOutOfOfficeSubject(app.applicationRef || '') ||
      isOutOfOfficeText(app.notes || '')
    ) {
      continue;
    }

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
      // Smartly merge action items preserving completion status and AI auto-resolutions
      const mergedActions = [...(existing.actionItems || [])];
      for (const newAct of app.actionItems || []) {
        const matchIdx = mergedActions.findIndex(
          (a) => a.title.toLowerCase().trim() === newAct.title.toLowerCase().trim()
        );
        if (matchIdx === -1) {
          mergedActions.push(newAct);
        } else if (newAct.isCompleted && !mergedActions[matchIdx].isCompleted) {
          mergedActions[matchIdx] = {
            ...mergedActions[matchIdx],
            isCompleted: true,
            completedAt: newAct.completedAt || new Date().toISOString(),
            completedBy: newAct.completedBy,
            autoResolvedByAi: newAct.autoResolvedByAi,
            autoResolvedReason: newAct.autoResolvedReason,
          };
        }
      }

      // If status progressed to APPROVED, mark all actions resolved
      if ((app.status === 'APPROVED' || existing.status === 'APPROVED')) {
        mergedActions.forEach((act) => {
          if (!act.isCompleted) {
            act.isCompleted = true;
            act.completedAt = new Date().toISOString();
            act.completedBy = 'AI Autonomous Engine';
            act.autoResolvedByAi = true;
            act.autoResolvedReason = 'Auto-resolved: Application granted Certificate of Conformity / Approval by SIRIM QAS.';
          }
        });
      }

      result[existingIndex] = {
        ...existing,
        ...app,
        id: existing.id, // Keep the established unique ID
        emailThreads: mergedEmails,
        actionItems: mergedActions.length ? mergedActions : (app.actionItems || existing.actionItems),
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

/**
 * Smart Multi-User local & central server applications merger
 */
function mergeLocalAndServer(local: SirimApplication[], server: SirimApplication[]): SirimApplication[] {
  if (!Array.isArray(server) || server.length === 0) return local || [];
  if (!Array.isArray(local) || local.length === 0) return server || [];

  const merged = [...server];
  for (const loc of local) {
    if (!loc) continue;
    const idx = merged.findIndex(
      (m) =>
        (m.id && loc.id && m.id === loc.id) ||
        (m.applicationRef &&
          loc.applicationRef &&
          m.applicationRef.trim().toLowerCase() === loc.applicationRef.trim().toLowerCase() &&
          m.applicationRef.trim() !== '') ||
        (m.threadId && loc.threadId && m.threadId === loc.threadId)
    );
    if (idx === -1) {
      merged.push(loc);
    } else {
      const sItem = merged[idx];
      const sModified = sItem.lastModifiedAt ? new Date(sItem.lastModifiedAt).getTime() : 0;
      const lModified = loc.lastModifiedAt ? new Date(loc.lastModifiedAt).getTime() : 0;
      if (lModified >= sModified) {
        merged[idx] = { ...sItem, ...loc };
      }
    }
  }
  return merged;
}

export default function App() {
  // 1. Applications State (Starts clean with 0 dummy data)
  const [applications, setApplications] = useState<SirimApplication[]>(() => {
    try {
      // Wipe legacy storage keys that held dummy mock data
      localStorage.removeItem(LEGACY_APPS_STORAGE_KEY_V1);
      localStorage.removeItem('sirim_applications_data_v2');
      localStorage.removeItem('sirim_applications_data_v1');

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

  // 3. Auth Session State (persisted across page reloads via localStorage)
  const [authSession, setAuthSession] = useState<UserAuthSession | null>(() => getStoredAuthSession());

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
  const [isGlobalPreScreenOpen, setIsGlobalPreScreenOpen] = useState(false);
  const [isActivityDrawerOpen, setIsActivityDrawerOpen] = useState(false);
  const [isUserManualOpen, setIsUserManualOpen] = useState(false);

  // Multi-user collaborative presence & audit log state
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);
  const [teamActivities, setTeamActivities] = useState<TeamActivityLog[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);

  // Sync and Automation Runner state
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [isRunningAutomation, setIsRunningAutomation] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [serverSyncStatus, setServerSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');
  const [lastServerSyncTime, setLastServerSyncTime] = useState<string>('');

  const sanitizeActiveUsers = (list: any[]): UserPresence[] => {
    if (!Array.isArray(list)) return [];
    return list.filter((u) => {
      if (!u || !u.email) return false;
      const em = u.email.toLowerCase().trim();
      const nm = (u.name || '').toLowerCase().trim();
      return (
        em !== 'team-member@cytron.io' &&
        !em.includes('team-member') &&
        !em.startsWith('team-') &&
        nm !== 'team-member' &&
        nm !== 'teammember' &&
        em.includes('@')
      );
    });
  };

  // Send presence heartbeat to inform teammates (only for real authenticated accounts)
  const sendPresenceHeartbeat = async () => {
    // If not authenticated, do not register a fake presence; only fetch active users
    if (!authSession?.isAuthenticated || !authSession?.email) {
      try {
        const res = await fetch('/api/presence');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.activeUsers)) {
            setActiveUsers(sanitizeActiveUsers(data.activeUsers));
          }
        }
      } catch {
        // background polling
      }
      return;
    }

    try {
      const email = authSession.email.trim();
      const name = authSession.name || email.split('@')[0];
      const picture = authSession.picture;

      const res = await fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          picture,
          activeAction: 'Viewing Applications',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.activeUsers)) {
          setActiveUsers(sanitizeActiveUsers(data.activeUsers));
        }
      }
    } catch {
      // background polling
    }
  };

  // Fetch team activity log
  const fetchTeamActivities = async () => {
    try {
      setIsLoadingActivities(true);
      const res = await fetch('/api/team-activity');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.activities)) {
          setTeamActivities(data.activities);
        }
      }
    } catch {
      // background polling
    } finally {
      setIsLoadingActivities(false);
    }
  };

  // Heartbeat & Activity Polling
  useEffect(() => {
    sendPresenceHeartbeat();
    fetchTeamActivities();

    const interval = setInterval(() => {
      sendPresenceHeartbeat();
      fetchTeamActivities();
    }, 20000);

    return () => clearInterval(interval);
  }, [authSession?.email, authSession?.name]);

  // Initial load: Fetch server config if available to merge environment or server settings
  useEffect(() => {
    fetch('/api/automation/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((serverConfig) => {
        if (serverConfig) {
          setAutomationConfig((prev) => ({
            ...prev,
            ...serverConfig,
            telegram: {
              ...prev.telegram,
              ...(serverConfig.telegram || {}),
              botToken: prev.telegram?.botToken || serverConfig.telegram?.botToken || '',
              chatId: prev.telegram?.chatId || serverConfig.telegram?.chatId || '',
              topicId: prev.telegram?.topicId || serverConfig.telegram?.topicId || '',
            },
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch central shared database applications from Raspberry Pi / Server
  const fetchApplicationsFromServer = async (silent = true) => {
    try {
      setServerSyncStatus('syncing');
      const res = await fetch('/api/applications');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.applications)) {
          setApplications((prevLocal) => {
            const merged = mergeLocalAndServer(prevLocal, data.applications);
            const sanitized = sanitizeApplications(merged);
            try {
              localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(sanitized));
            } catch (e) {}
            return sanitized;
          });
          setServerSyncStatus('synced');
          setLastServerSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          if (!silent) {
            setSyncFeedback({
              type: 'success',
              message: `Refreshed ${data.applications.length} applications from team server.`,
            });
            setTimeout(() => setSyncFeedback(null), 3000);
          }
        }
      } else {
        setServerSyncStatus('offline');
      }
    } catch (err) {
      setServerSyncStatus('offline');
    }
  };

  // Sync applications from server on mount and every 30 seconds (or on window focus)
  useEffect(() => {
    fetchApplicationsFromServer(true);
    const interval = setInterval(() => {
      fetchApplicationsFromServer(true);
    }, 30000);

    const onFocus = () => {
      fetchApplicationsFromServer(true);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Save applications to localStorage and sync to central server database
  useEffect(() => {
    try {
      localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(applications));
      if (applications.length > 0) {
        fetch('/api/applications/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applications,
            userEmail: authSession?.email || 'team-member',
            merge: true,
          }),
        })
          .then((res) => {
            if (res.ok) {
              setServerSyncStatus('synced');
              setLastServerSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
          })
          .catch(() => {
            setServerSyncStatus('offline');
          });
      }
    } catch (e) {
      console.error('Failed to save applications', e);
    }
  }, [applications, authSession?.email]);

  // Register active OAuth session with backend autonomous daemon
  const syncSessionToServer = (session: UserAuthSession | null) => {
    if (!session?.accessToken) return;
    fetch('/api/automation/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: session.accessToken,
        email: session.email,
        name: session.name,
        picture: session.picture,
        expiresAt: session.expiresAt,
      }),
    }).catch((err) => console.warn('Failed to register session with server:', err));
  };

  // Save sheetConfig to localStorage and register with backend autonomous daemon
  const handleSaveSheetConfig = (newConfig: SheetSyncConfig) => {
    setSheetConfig(newConfig);
    try {
      localStorage.setItem(SHEET_CONFIG_KEY, JSON.stringify(newConfig));
    } catch (e) {}

    // Register with backend autonomous daemon
    fetch('/api/automation/sheet-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spreadsheetId: newConfig.spreadsheetId,
        sheetName: newConfig.sheetName,
        spreadsheetUrl: newConfig.spreadsheetUrl,
        autoSync: newConfig.autoSync,
      }),
    }).catch((err) => console.warn('Failed to register sheet config with server:', err));
  };

  // Save automationConfig to localStorage and sync to server
  const handleSaveAutomationConfig = (newConfig: AutomationConfig) => {
    setAutomationConfig(newConfig);
    try {
      localStorage.setItem(AUTOMATION_CONFIG_KEY, JSON.stringify(newConfig));
    } catch (e) {}

    fetch('/api/automation/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    }).catch(() => {});
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

  // Instant Critical Alert via Telegram
  const sendInstantTelegramAlert = async (app: SirimApplication) => {
    if (!automationConfig.telegram?.enabled || !automationConfig.telegram?.instantAlertOnCritical) {
      return;
    }
    const token = automationConfig.telegram?.botToken;
    const chat = automationConfig.telegram?.chatId;
    try {
      await fetch('/api/telegram/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: token,
          chatId: chat,
          topicId: automationConfig.telegram?.topicId,
          application: app,
        }),
      });
      handleAddAutomationLog({
        timestamp: new Date().toISOString(),
        type: 'TELEGRAM',
        status: 'SUCCESS',
        message: `Instant Telegram alert delivered for Ref: ${app.applicationRef || app.productName} (${app.status}).`,
      });
    } catch (e: any) {
      console.error('Instant Telegram alert error:', e);
    }
  };

  // Automated Pipeline Execution Routine (Gmail Scan -> Sheet Sync -> Telegram Broadcast)
  const handleRunAutomationNow = async (isManualClick: any = true) => {
    // When invoked via onClick event or default, it is an explicit manual click
    const isManual = isManualClick === true || (typeof isManualClick === 'object' && isManualClick !== null);
    if (isRunningAutomation) return;
    setIsRunningAutomation(true);

    if (isManual) {
      handleAddAutomationLog({
        timestamp: new Date().toISOString(),
        type: 'SYSTEM',
        status: 'INFO',
        message: 'On-demand pipeline execution triggered by user.',
      });
    }

    try {
      const data = await safeFetchJson<any>('/api/automation/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authSession?.accessToken ? { Authorization: `Bearer ${authSession.accessToken}` } : {}),
        },
        body: JSON.stringify({
          spreadsheetId: sheetConfig?.spreadsheetId,
          sheetName: sheetConfig?.sheetName || 'Active CoC Applications',
          spreadsheetUrl: sheetConfig?.spreadsheetUrl,
          applications: applications,
          userEmail: authSession?.email || 'team-member@cytron.io',
          telegramConfig: automationConfig.telegram,
          scanQuery: 'from:sirim.my OR subject:ecomm OR subject:sqas OR subject:sirim',
          isManualClick: isManual,
          triggerSource: isManual ? 'MANUAL_CLICK' : 'AUTONOMOUS_CYCLE',
          options: {
            autoScanGmail: automationConfig.autoScanGmail && Boolean(authSession?.accessToken),
            autoSyncSheet: automationConfig.autoSyncGoogleSheet && Boolean(sheetConfig?.spreadsheetId),
            autoSendTelegram: isManual && automationConfig.autoSendTelegram && Boolean(automationConfig.telegram?.botToken && automationConfig.telegram?.chatId),
            scanQuery: 'from:sirim.my OR subject:ecomm OR subject:sqas OR subject:sirim',
          },
        }),
      });

      if (!data.success) {
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
          lastRunSummary: `Scanned ${data.scanResult?.threadsFound || 0} emails, updated ${data.applications?.length || applications.length} apps, ${data.telegramSent ? 'Telegram dispatched' : 'Sheet synced'}.`,
          logs: combined,
        });
      }

      if (isManual) {
        setSyncFeedback({
          message: data.telegramSent
            ? `Pipeline Complete: Scanned Gmail, updated Google Sheet & delivered Telegram briefing!`
            : `Pipeline Complete: Scanned Gmail & updated Google Sheet successfully!`,
          type: 'success',
        });
        notificationAudio.playSuccessTone();
        confetti({ particleCount: 50, spread: 70 });
      } else {
        if (data.newEmailsDetected > 0) {
          setSyncFeedback({
            message: `Autonomous Agent detected ${data.newEmailsDetected} new SIRIM updates & synced to Google Sheet.`,
            type: 'success',
          });
          notificationAudio.playNoticeTone();
        }
      }
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

      if (isManual) {
        setSyncFeedback({
          message: `Automation error: ${err.message}`,
          type: 'error',
        });
      }
    } finally {
      setIsRunningAutomation(false);
      setTimeout(() => setSyncFeedback(null), 6000);
    }
  };

  // Background Autonomous Sync: Periodically poll server automation config (every 30 seconds)
  // to keep agent state, logs, and run timestamps up to date without triggering redundant runs.
  useEffect(() => {
    const fetchStatus = () => {
      fetch('/api/automation/config')
        .then((res) => (res.ok ? res.json() : null))
        .then((serverConfig) => {
          if (serverConfig) {
            setAutomationConfig((prev) => ({
              ...prev,
              ...serverConfig,
              telegram: {
                ...prev.telegram,
                ...(serverConfig.telegram || {}),
                botToken: prev.telegram?.botToken || serverConfig.telegram?.botToken || '',
                chatId: prev.telegram?.chatId || serverConfig.telegram?.chatId || '',
                topicId: prev.telegram?.topicId || serverConfig.telegram?.topicId || '',
              },
            }));
          }
        })
        .catch(() => {});
    };

    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Keep backend credentials fresh on session change
  useEffect(() => {
    if (authSession?.accessToken) {
      syncSessionToServer(authSession);
    }
  }, [authSession?.accessToken]);

  // Keep backend sheet config registered on mount
  useEffect(() => {
    if (sheetConfig?.spreadsheetId) {
      fetch('/api/automation/sheet-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sheetConfig),
      }).catch(() => {});
    }
  }, [sheetConfig?.spreadsheetId]);

  // Google OAuth Client setup
  const handleConnectGoogle = async () => {
    try {
      const session = await googleSignIn();
      if (session) {
        setAuthSession(session);
        syncSessionToServer(session);
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
      const data = await safeFetchJson<any>('/api/sheets/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.accessToken}`,
        },
        body: JSON.stringify({
          spreadsheetId: sheetConfig.spreadsheetId,
          sheetName: sheetConfig.sheetName || 'Active CoC Applications',
          applications: applications,
          userEmail: authSession?.email || 'team-member',
        }),
      });

      if (!data.success) {
        throw new Error(data.error || 'Failed to sync to Google Sheet');
      }

      const updatedConfig: SheetSyncConfig = {
        ...sheetConfig,
        lastSynced: new Date().toISOString(),
        rowsCount: (data.applications?.length || applications.length) + 1,
      };
      handleSaveSheetConfig(updatedConfig);

      // Merge server-stored applications if returned
      if (Array.isArray(data.applications) && data.applications.length > 0) {
        setApplications(sanitizeApplications(data.applications));
      } else {
        // Mark all apps as synced
        setApplications((prev) =>
          prev.map((app) => ({
            ...app,
            syncedToSheet: true,
            lastSyncedAt: new Date().toISOString(),
          }))
        );
      }

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
    // Guard: Prevent ticking of pending third-party statements
    const targetApp = applications.find((a) => a.id === appId);
    const targetAct = targetApp?.actionItems.find((act) => act.id === actionItemId);
    if (targetAct && isPendingStatement(targetAct) && !targetAct.isCompleted) {
      return;
    }

    const authorEmail = authSession?.email || 'rupa@cytron.io';
    const nowStr = new Date().toISOString();
    let toggledItemTitle = '';
    let targetAppRef = '';
    let targetAppName = '';
    let isNowCompleted = false;

    setApplications((prev) =>
      prev.map((app) => {
        if (app.id === appId) {
          targetAppRef = app.applicationRef;
          targetAppName = app.productName;
          const updatedActions = app.actionItems.map((act) => {
            if (act.id === actionItemId) {
              const nextState = !act.isCompleted;
              toggledItemTitle = act.title;
              isNowCompleted = nextState;
              return {
                ...act,
                isCompleted: nextState,
                completedAt: nextState ? nowStr : undefined,
                completedBy: nextState ? authorEmail : undefined,
              };
            }
            return act;
          });

          return {
            ...app,
            actionItems: updatedActions,
            lastModifiedBy: authorEmail,
            lastModifiedAt: nowStr,
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
          lastModifiedBy: authorEmail,
          lastModifiedAt: nowStr,
          actionItems: prev.actionItems.map((act) =>
            act.id === actionItemId
              ? {
                  ...act,
                  isCompleted: !act.isCompleted,
                  completedAt: !act.isCompleted ? nowStr : undefined,
                  completedBy: !act.isCompleted ? authorEmail : undefined,
                }
              : act
          ),
        };
      });
    }

    // Log action to team activity feed
    fetch('/api/team-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail: authorEmail,
        userName: authSession?.name,
        userPicture: authSession?.picture,
        actionType: 'ACTION_TOGGLE',
        applicationRef: targetAppRef,
        productName: targetAppName,
        description: `${authorEmail.split('@')[0]} marked action "${toggledItemTitle || 'item'}" as ${isNowCompleted ? 'completed' : 'pending'}.`,
      }),
    })
      .then(() => fetchTeamActivities())
      .catch(() => {});
  };

  // Update full application from detail modal
  const handleUpdateApplication = (updatedApp: SirimApplication) => {
    const authorEmail = authSession?.email || updatedApp.lastModifiedBy || 'rupa@cytron.io';
    const withAttribution: SirimApplication = {
      ...updatedApp,
      lastModifiedBy: authorEmail,
      lastModifiedAt: new Date().toISOString(),
    };
    const prevApp = applications.find((a) => a.id === updatedApp.id);
    setApplications((prev) => prev.map((a) => (a.id === updatedApp.id ? withAttribution : a)));
    setSelectedApplication(withAttribution);

    // If moved to RFI or Sample Requested, trigger instant alert
    if (
      (updatedApp.status === 'RFI_ACTION_REQUIRED' || updatedApp.status === 'SAMPLE_REQUESTED') &&
      prevApp?.status !== updatedApp.status
    ) {
      sendInstantTelegramAlert(withAttribution);
    }

    // Log to team activity feed
    fetch('/api/team-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail: authorEmail,
        userName: authSession?.name,
        userPicture: authSession?.picture,
        actionType: prevApp?.status !== updatedApp.status ? 'STATUS_CHANGE' : 'APPLICATION_UPDATE',
        applicationRef: updatedApp.applicationRef,
        productName: updatedApp.productName,
        description: `${authorEmail.split('@')[0]} updated ${updatedApp.applicationRef} (${updatedApp.status.replace(/_/g, ' ')}).`,
      }),
    })
      .then(() => fetchTeamActivities())
      .catch(() => {});
  };

  // Add new application from Modal / AI parser
  const handleAddApplication = (newApp: SirimApplication) => {
    const authorEmail = authSession?.email || newApp.lastModifiedBy || 'rupa@cytron.io';
    const withAttribution: SirimApplication = {
      ...newApp,
      lastModifiedBy: authorEmail,
      lastModifiedAt: new Date().toISOString(),
    };
    setApplications((prev) => sanitizeApplications([withAttribution, ...prev]));
    // If sheet configured and auto-sync active, trigger sync
    if (sheetConfig?.spreadsheetId && authSession?.accessToken) {
      setTimeout(() => handleSyncToGoogleSheet(), 500);
    }
    // Instant alert if critical status
    if (
      newApp.status === 'RFI_ACTION_REQUIRED' ||
      newApp.status === 'SAMPLE_REQUESTED' ||
      newApp.status === 'PAYMENT_PENDING'
    ) {
      sendInstantTelegramAlert(withAttribution);
    }

    // Log to team activity feed
    fetch('/api/team-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail: authorEmail,
        userName: authSession?.name,
        userPicture: authSession?.picture,
        actionType: 'APPLICATION_CREATE',
        applicationRef: newApp.applicationRef,
        productName: newApp.productName,
        description: `${authorEmail.split('@')[0]} added application ${newApp.applicationRef} (${newApp.productName}).`,
      }),
    })
      .then(() => fetchTeamActivities())
      .catch(() => {});
  };

  // Import batch from Gmail scanner
  const handleImportApplications = (newApps: SirimApplication[]) => {
    const authorEmail = authSession?.email || 'rupa@cytron.io';
    const nowStr = new Date().toISOString();
    const withAttribution = newApps.map((a) => ({
      ...a,
      lastModifiedBy: authorEmail,
      lastModifiedAt: nowStr,
    }));
    setApplications((prev) => sanitizeApplications([...withAttribution, ...prev]));

    if (sheetConfig?.spreadsheetId && authSession?.accessToken) {
      setTimeout(() => handleSyncToGoogleSheet(), 500);
    }

    // Alert on any urgent inbound applications
    const urgent = withAttribution.find(
      (a) => a.status === 'RFI_ACTION_REQUIRED' || a.status === 'SAMPLE_REQUESTED'
    );
    if (urgent) {
      sendInstantTelegramAlert(urgent);
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

  // Clear all data to allow fresh testing with real emails
  const handleClearAllApplications = () => {
    if (
      window.confirm(
        `Clear all ${applications.length} applications from the tracker? This gives you a 100% clean interface to scan and test with your real SIRIM emails.`
      )
    ) {
      setApplications([]);
      localStorage.removeItem(APPS_STORAGE_KEY);
      localStorage.removeItem(LEGACY_APPS_STORAGE_KEY_V1);
      localStorage.removeItem('sirim_applications_data_v2');
      localStorage.removeItem('sirim_applications_data_v1');
      setSelectedApplication(null);

      fetch('/api/applications/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applications: [],
          merge: false,
          userEmail: authSession?.email || 'rupa@cytron.io',
        }),
      }).catch(() => {});

      setIsDetailModalOpen(false);
      notificationAudio.playSuccessTone();
      setSyncFeedback({
        type: 'success',
        message: 'All application records cleared. Tracker is ready for your real emails!',
      });
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  // Delete individual application
  const handleDeleteApplication = (appId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const targetApp = applications.find((a) => a.id === appId);
    const authorEmail = authSession?.email || 'rupa@cytron.io';

    if (window.confirm('Are you sure you want to remove this application from the tracker?')) {
      setApplications((prev) => prev.filter((a) => a.id !== appId));
      if (selectedApplication?.id === appId) {
        setIsDetailModalOpen(false);
        setSelectedApplication(null);
      }

      fetch(`/api/applications/${encodeURIComponent(appId)}`, {
        method: 'DELETE',
      }).catch(() => {});

      // Log delete to team activity feed
      fetch('/api/team-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: authorEmail,
          userName: authSession?.name,
          userPicture: authSession?.picture,
          actionType: 'APPLICATION_DELETE',
          applicationRef: targetApp?.applicationRef || appId,
          productName: targetApp?.productName,
          description: `${authorEmail.split('@')[0]} deleted application ${targetApp?.applicationRef || appId}.`,
        }),
      })
        .then(() => fetchTeamActivities())
        .catch(() => {});

      notificationAudio.playSuccessTone();
      setSyncFeedback({
        type: 'success',
        message: 'Application removed from tracker.',
      });
      setTimeout(() => setSyncFeedback(null), 3000);
    }
  };

  // Export applications to CSV spreadsheet
  const handleExportCsv = () => {
    if (applications.length === 0) {
      setSyncFeedback({
        message: 'No applications available in tracker to export.',
        type: 'error',
      });
      return;
    }
    const targetApps = filteredApplications.length > 0 ? filteredApplications : applications;
    exportApplicationsToCsv(targetApps);
    setSyncFeedback({
      message: `Exported ${targetApps.length} applications to CSV spreadsheet!`,
      type: 'success',
    });
    notificationAudio.playSuccessTone();
    setTimeout(() => setSyncFeedback(null), 4000);
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
        const isActionStatus = ['SAMPLE_REQUESTED', 'PAYMENT_PENDING'].includes(app.status) ||
          (app.status === 'RFI_ACTION_REQUIRED' && app.supplierStatus !== 'WAITING_FOR_SUPPLIER_DOCS');
        const hasPendingApplicantAction = app.actionItems.some((a) => !a.isCompleted && isActionRequired(a));
        if (!isActionStatus && !hasPendingApplicantAction) return false;
      } else if (statusFilter === 'IN_PROGRESS') {
        if (!['SUBMITTED', 'UNDER_REVIEW', 'SAMPLE_SUBMITTED', 'TESTING_IN_PROGRESS', 'FINAL_EVALUATION'].includes(app.status) &&
            !(app.status === 'RFI_ACTION_REQUIRED' && app.supplierStatus === 'WAITING_FOR_SUPPLIER_DOCS')) {
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
      if (assigneeFilter === 'ME') {
        const myEmail = authSession?.email?.toLowerCase();
        if (!myEmail) return false;
        const hasMyAction = app.actionItems.some(
          (a) =>
            !a.isCompleted &&
            (a.assignedToUserEmail?.toLowerCase() === myEmail ||
              (a.assignedToName && myEmail.includes(a.assignedToName.toLowerCase())))
        );
        if (!hasMyAction) return false;
      } else if (assigneeFilter !== 'ALL') {
        const hasAssigneeAction = app.actionItems.some(
          (a) => !a.isCompleted && a.assignedTo === assigneeFilter
        );
        if (!hasAssigneeAction) return false;
      }

      return true;
    });
  }, [applications, searchQuery, statusFilter, schemeFilter, assigneeFilter, authSession?.email]);

  // Counts for header badge (active tasks required from applicant)
  const pendingActionsCount = useMemo(() => {
    return applications
      .flatMap((a) => a.actionItems)
      .filter((act) => !act.isCompleted && isActionRequired(act)).length;
  }, [applications]);

  const criticalActionsCount = useMemo(() => {
    return applications
      .flatMap((a) => a.actionItems)
      .filter((act) => !act.isCompleted && act.priority === 'CRITICAL' && isActionRequired(act)).length;
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
        applicationsCount={applications.length}
        activeUsers={activeUsers}
        onOpenActivityDrawer={() => setIsActivityDrawerOpen(true)}
        onOpenUserManual={() => setIsUserManualOpen(true)}
        onOpenSheetModal={() => setIsSheetModalOpen(true)}
        onOpenGmailScanner={() => setIsGmailScannerOpen(true)}
        onOpenNewAppModal={() => setIsNewAppModalOpen(true)}
        onOpenNotificationDrawer={() => setIsNotificationDrawerOpen(true)}
        onOpenAutomationModal={() => setIsAutomationModalOpen(true)}
        onConnectGoogle={handleConnectGoogle}
        onDisconnectGoogle={handleDisconnectGoogle}
        onManualSyncSheet={handleSyncToGoogleSheet}
        onClearAll={handleClearAllApplications}
        onExportCsv={handleExportCsv}
        onOpenPreScreen={() => setIsGlobalPreScreenOpen(true)}
        isSyncingSheet={isSyncingSheet}
        isRunningAutomation={isRunningAutomation}
        serverSyncStatus={serverSyncStatus}
        lastServerSyncTime={lastServerSyncTime}
        onRefreshFromServer={() => fetchApplicationsFromServer(false)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Sync Feedback Alert */}
        {syncFeedback && (
          <div
            className={`mb-4 px-3.5 py-2.5 rounded-lg border flex items-center justify-between text-xs font-medium transition-all ${
              syncFeedback.type === 'success'
                ? 'bg-emerald-50/80 text-emerald-800 border-emerald-200'
                : 'bg-rose-50/80 text-rose-800 border-rose-200'
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
                className="underline flex items-center gap-1 hover:text-emerald-950 font-semibold"
              >
                <span>View Sheet</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Autonomous Agent Sentinel Banner */}
        <AutonomousAgentBanner
          automationConfig={automationConfig}
          sheetConfig={sheetConfig}
          authSession={authSession}
          isRunningAutomation={isRunningAutomation}
          onOpenAutomationModal={() => setIsAutomationModalOpen(true)}
          onOpenSheetModal={() => setIsSheetModalOpen(true)}
          onConnectGoogle={handleConnectGoogle}
          onRunNow={() => handleRunAutomationNow(false)}
        />

        {/* Stats & KPI Highlights (rendered only when active applications exist) */}
        {applications.length > 0 && (
          <>
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
              totalAppsCount={applications.length}
              currentUserEmail={authSession?.email}
              onClearAll={handleClearAllApplications}
              onExportCsv={handleExportCsv}
            />
          </>
        )}

        {/* Applications List */}
        {applications.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-xl p-8 sm:p-12 text-center space-y-6 shadow-2xs max-w-xl mx-auto my-8">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center mx-auto text-slate-700 shadow-2xs">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-slate-900">No SIRIM Applications Loaded</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Your registry is currently empty. Scan your Gmail inbox for official SIRIM e-ComM correspondence, sync from Google Sheets, or ingest an email thread directly.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2">
              <button
                onClick={() => {
                  if (!authSession?.isAuthenticated) {
                    handleConnectGoogle();
                  } else {
                    setIsGmailScannerOpen(true);
                  }
                }}
                className="flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-lg border border-slate-200/80 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-800 font-semibold text-xs transition-all shadow-2xs"
              >
                <Mail className="w-4 h-4 text-slate-600" />
                <span>Scan Gmail</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {authSession?.isAuthenticated ? 'Inbox ready' : 'Sign in first'}
                </span>
              </button>

              <button
                onClick={() => setIsNewAppModalOpen(true)}
                className="flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-lg border border-slate-900 bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>+ Ingest Email</span>
                <span className="text-[10px] text-slate-300 font-normal">Paste text</span>
              </button>

              <button
                onClick={() => setIsSheetModalOpen(true)}
                className="flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-lg border border-slate-200/80 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-800 font-semibold text-xs transition-all shadow-2xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Link Sheet</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {sheetConfig?.spreadsheetId ? 'Connected' : 'Google Sheet'}
                </span>
              </button>

              <button
                onClick={() => setIsUserManualOpen(true)}
                className="flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-lg border border-sky-200 bg-sky-50/50 hover:bg-sky-100/70 hover:border-sky-300 text-sky-900 font-semibold text-xs transition-all shadow-2xs"
              >
                <BookOpen className="w-4 h-4 text-sky-600" />
                <span>User Guide</span>
                <span className="text-[10px] text-sky-600 font-normal">
                  Getting Started
                </span>
              </button>
            </div>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-xl p-10 text-center space-y-4 shadow-2xs">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Search className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">No applications match your filter</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Try searching for a different reference or reset the active filter criteria.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setSchemeFilter('ALL');
                  setAssigneeFilter('ALL');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Reset Filters
              </button>
              <button
                onClick={() => setIsNewAppModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors"
              >
                + Ingest Email
              </button>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredApplications.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                currentUserEmail={authSession?.email}
                currentUserName={authSession?.name}
                onSelect={handleOpenDetails}
                onToggleActionItem={handleToggleActionItem}
                onQuickDraftReply={handleQuickDraftReply}
                onDelete={handleDeleteApplication}
              />
            ))}
          </div>
        ) : (
          <ApplicationTable
            applications={filteredApplications}
            currentUserEmail={authSession?.email}
            onSelect={handleOpenDetails}
            onQuickDraftReply={handleQuickDraftReply}
            onDelete={handleDeleteApplication}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200/80 bg-white py-3.5 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">SIRIM CoC Workspace</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>Malaysian Regulatory Intelligence Register</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
            <span>Google Workspace Synchronized</span>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      {isDetailModalOpen && selectedApplication && (
        <ApplicationDetailModal
          isOpen={isDetailModalOpen}
          application={selectedApplication}
          onClose={() => setIsDetailModalOpen(false)}
          onUpdateApplication={handleUpdateApplication}
          onDeleteApplication={handleDeleteApplication}
          initialTab={detailInitialTab}
          accessToken={authSession?.accessToken}
          currentUserEmail={authSession?.email}
          currentUserName={authSession?.name}
        />
      )}

      {/* Team Activity Audit Feed Drawer */}
      <TeamActivityDrawer
        isOpen={isActivityDrawerOpen}
        onClose={() => setIsActivityDrawerOpen(false)}
        activities={teamActivities}
        isLoading={isLoadingActivities}
        onRefresh={fetchTeamActivities}
        onSelectApplicationRef={(ref) => {
          const matched = applications.find(
            (a) => a.applicationRef.toLowerCase() === ref.toLowerCase()
          );
          if (matched) {
            handleOpenDetails(matched);
            setIsActivityDrawerOpen(false);
          }
        }}
      />

      {isSheetModalOpen && (
        <GoogleSheetSyncModal
          isOpen={isSheetModalOpen}
          onClose={() => setIsSheetModalOpen(false)}
          sheetConfig={sheetConfig}
          authSession={authSession}
          applications={applications}
          onSaveSheetConfig={handleSaveSheetConfig}
          onConnectGoogle={handleConnectGoogle}
        />
      )}

      {isGmailScannerOpen && (
        <GmailScannerModal
          isOpen={isGmailScannerOpen}
          onClose={() => setIsGmailScannerOpen(false)}
          authSession={authSession}
          onConnectGoogle={handleConnectGoogle}
          onImportApplications={handleImportApplications}
        />
      )}

      {isNewAppModalOpen && (
        <NewApplicationModal
          isOpen={isNewAppModalOpen}
          onClose={() => setIsNewAppModalOpen(false)}
          onAddApplication={handleAddApplication}
        />
      )}

      {isNotificationDrawerOpen && (
        <NotificationDrawer
          isOpen={isNotificationDrawerOpen}
          onClose={() => setIsNotificationDrawerOpen(false)}
          applications={applications}
          onToggleActionItem={handleToggleActionItem}
          onSelectApplication={handleOpenDetails}
          onQuickDraftReply={handleQuickDraftReply}
        />
      )}

      {isAutomationModalOpen && (
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
      )}

      {/* Global AI Document Pre-Screening Scanner */}
      {isGlobalPreScreenOpen && (
        <DocumentPreScreenModal
          isOpen={isGlobalPreScreenOpen}
          onClose={() => setIsGlobalPreScreenOpen(false)}
          application={selectedApplication || applications[0] || null}
          onApplyResult={(result) => {
            const targetApp = selectedApplication || applications[0];
            if (targetApp) {
              const now = new Date().toISOString();
              const updatedApp: SirimApplication = {
                ...targetApp,
                timeline: [
                  ...targetApp.timeline,
                  {
                    id: `prescreen-${Date.now()}`,
                    date: now,
                    title: `AI Pre-Screen: ${result.documentType}`,
                    description: `Score: ${result.score}% (${result.overallVerdict}). ${result.summary.slice(0, 100)}...`,
                    sender: 'Me (Compliance Audit)',
                    type: 'status_change',
                    senderRole: 'APPLICANT',
                  },
                ],
                notes:
                  (targetApp.notes ? targetApp.notes + '\n\n' : '') +
                  `[AI Pre-Screen - ${result.documentType}]: ${result.overallVerdict} (${result.score}%). ${result.summary}`,
              };
              handleUpdateApplication(updatedApp);
              setSyncFeedback({
                message: `Applied pre-screen findings to ${targetApp.applicationRef}!`,
                type: 'success',
              });
            }
          }}
        />
      )}
      {/* User Manual & Getting Started Modal */}
      {isUserManualOpen && (
        <UserManualModal
          isOpen={isUserManualOpen}
          onClose={() => setIsUserManualOpen(false)}
          onOpenGmailScan={() => setIsGmailScannerOpen(true)}
          onOpenAutomation={() => setIsAutomationModalOpen(true)}
          onOpenPreScreen={() => setIsGlobalPreScreenOpen(true)}
          onOpenNewApp={() => setIsNewAppModalOpen(true)}
        />
      )}
    </div>
  );
}
