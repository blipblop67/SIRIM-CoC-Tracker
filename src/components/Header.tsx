import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  Mail,
  Plus,
  Bell,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  User,
  LogOut,
  Zap,
  Send,
  Trash2,
  Download,
  FileCheck,
  Database,
  Activity,
  MoreHorizontal,
  ChevronDown,
  BookOpen,
} from 'lucide-react';
import { AutomationConfig, SheetSyncConfig, UserAuthSession, UserPresence } from '../types';

interface HeaderProps {
  sheetConfig: SheetSyncConfig | null;
  authSession: UserAuthSession | null;
  automationConfig: AutomationConfig;
  pendingActionsCount: number;
  criticalActionsCount: number;
  applicationsCount?: number;
  serverSyncStatus?: 'synced' | 'syncing' | 'offline';
  lastServerSyncTime?: string;
  activeUsers?: UserPresence[];
  onRefreshFromServer?: () => void;
  onOpenSheetModal: () => void;
  onOpenGmailScanner: () => void;
  onOpenNewAppModal: () => void;
  onOpenNotificationDrawer: () => void;
  onOpenAutomationModal: () => void;
  onOpenActivityDrawer?: () => void;
  onOpenUserManual?: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onManualSyncSheet: () => void;
  onClearAll?: () => void;
  onExportCsv?: () => void;
  onOpenPreScreen?: () => void;
  isSyncingSheet: boolean;
  isRunningAutomation: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  sheetConfig,
  authSession,
  automationConfig,
  pendingActionsCount,
  criticalActionsCount,
  applicationsCount = 0,
  serverSyncStatus = 'synced',
  activeUsers = [],
  onRefreshFromServer,
  onOpenSheetModal,
  onOpenGmailScanner,
  onOpenNewAppModal,
  onOpenNotificationDrawer,
  onOpenAutomationModal,
  onOpenActivityDrawer,
  onOpenUserManual,
  onConnectGoogle,
  onDisconnectGoogle,
  onManualSyncSheet,
  onClearAll,
  onExportCsv,
  onOpenPreScreen,
  isSyncingSheet,
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isTelegramReady = Boolean(
    automationConfig.telegram?.botToken?.trim() && automationConfig.telegram?.chatId?.trim()
  );

  const validActiveUsers = (activeUsers || []).filter((u) => {
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

  return (
    <header className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between text-slate-800 transition-colors">
      {/* Left: Brand & Telemetry */}
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 tracking-tight text-sm">
              SIRIM CoC
            </span>
            <span className="text-[11px] font-medium text-slate-400 hidden sm:inline">
              Workspace
            </span>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-200 hidden md:block" />

        {/* Database & Sync Status */}
        <div className="hidden md:flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-50 border border-slate-200/80 text-slate-600"
            title={
              serverSyncStatus === 'synced'
                ? `Team Database: Synced (${applicationsCount} applications)`
                : serverSyncStatus === 'syncing'
                ? 'Syncing with Server Database...'
                : 'Offline Cache'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                serverSyncStatus === 'synced'
                  ? 'bg-emerald-500'
                  : serverSyncStatus === 'syncing'
                  ? 'bg-sky-500 animate-ping'
                  : 'bg-amber-500'
              }`}
            />
            <span className="font-mono tabular-nums text-slate-700 font-semibold">
              {applicationsCount}
            </span>
            <span>files</span>
            {onRefreshFromServer && (
              <button
                onClick={onRefreshFromServer}
                disabled={serverSyncStatus === 'syncing'}
                className="text-slate-400 hover:text-slate-700 p-0.5 ml-0.5 rounded transition-colors"
                title="Refresh shared records"
              >
                <RefreshCw
                  className={`w-2.5 h-2.5 ${serverSyncStatus === 'syncing' ? 'animate-spin text-sky-500' : ''}`}
                />
              </button>
            )}
          </div>

          {/* Automation Status */}
          <button
            onClick={onOpenAutomationModal}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
              automationConfig.enabled
                ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
            title={`Autonomous Agent: ${automationConfig.enabled ? `Active (${automationConfig.autonomousIntervalMinutes || 15}m loop + ${automationConfig.scheduleTime} morning briefing)` : 'Disabled'}`}
          >
            <Zap
              className={`w-3 h-3 ${
                automationConfig.enabled ? 'text-amber-500 fill-amber-500' : 'text-slate-400'
              }`}
            />
            <span>{automationConfig.enabled ? `Auto (${automationConfig.autonomousIntervalMinutes || 15}m)` : 'Auto: Off'}</span>
            {isTelegramReady && <Send className="w-2.5 h-2.5 text-sky-500 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* Right: Active Collaborators, Tools & Actions */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Collaborators Stack */}
        {validActiveUsers.length > 0 && (
          <div
            className="hidden lg:flex items-center -space-x-1.5 pr-1"
            title={`Active team: ${validActiveUsers.map((u) => u.name || u.email.split('@')[0]).join(', ')}`}
          >
            {validActiveUsers.slice(0, 3).map((usr) => {
              const displayName = usr.name || usr.email.split('@')[0];
              const initial = displayName.charAt(0).toUpperCase();
              return (
                <div
                  key={usr.email}
                  className="w-6 h-6 rounded-full border-2 border-white bg-slate-800 text-white font-semibold text-[10px] flex items-center justify-center shrink-0 overflow-hidden shadow-2xs"
                  title={`${displayName} (${usr.email})`}
                >
                  {usr.picture ? (
                    <img
                      src={usr.picture}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    initial
                  )}
                </div>
              );
            })}
            {validActiveUsers.length > 3 && (
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-semibold flex items-center justify-center border border-white">
                +{validActiveUsers.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Team Activity Audit Button */}
        {onOpenActivityDrawer && (
          <button
            onClick={onOpenActivityDrawer}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Team Activity & Audit Trail"
          >
            <Activity className="w-4 h-4" />
          </button>
        )}

        {/* User Manual & Getting Started Guide */}
        {onOpenUserManual && (
          <button
            onClick={onOpenUserManual}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="User Manual & Getting Started Guide"
          >
            <BookOpen className="w-4 h-4 text-sky-600" />
          </button>
        )}

        {/* Notifications Bell */}
        <button
          onClick={onOpenNotificationDrawer}
          className="relative p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Action items & alerts"
        >
          <Bell className="w-4 h-4" />
          {pendingActionsCount > 0 && (
            <span
              className={`absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-white ${
                criticalActionsCount > 0 ? 'bg-rose-500' : 'bg-amber-500'
              }`}
            />
          )}
        </button>

        {/* Sheet Connection Status Link */}
        {sheetConfig?.spreadsheetUrl ? (
          <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200/80 rounded-lg px-2 py-1 bg-slate-50">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <a
              href={sheetConfig.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium hover:text-slate-900 truncate max-w-[110px]"
              title="Open Google Sheet"
            >
              {sheetConfig.sheetName || 'Google Sheet'}
            </a>
            <button
              onClick={onManualSyncSheet}
              disabled={isSyncingSheet}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
              title="Sync with Google Sheet"
            >
              <RefreshCw
                className={`w-2.5 h-2.5 ${isSyncingSheet ? 'animate-spin text-emerald-600' : ''}`}
              />
            </button>
          </div>
        ) : null}

        {/* Secondary: Scan Gmail */}
        <button
          onClick={onOpenGmailScanner}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-lg shadow-2xs transition-colors"
          title="Scan Gmail Inbox for SIRIM communications"
        >
          <Mail className="w-3.5 h-3.5 text-slate-500" />
          <span>Scan Inbox</span>
        </button>

        {/* Primary Action: + Ingest Email */}
        <button
          onClick={onOpenNewAppModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
          title="Ingest new SIRIM email or manual thread"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Ingest Email</span>
        </button>

        {/* More Actions Dropdown Menu */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="More workspace actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {isMoreOpen && (
            <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-xs text-slate-700 z-50 divide-y divide-slate-100">
              <div className="py-1">
                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    onOpenGmailScanner();
                  }}
                  className="sm:hidden w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 font-medium"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>Scan Inbox</span>
                </button>
                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    onOpenSheetModal();
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{sheetConfig?.spreadsheetId ? 'Configure Sheet Sync' : 'Connect Google Sheet'}</span>
                </button>
                {onOpenPreScreen && (
                  <button
                    onClick={() => {
                      setIsMoreOpen(false);
                      onOpenPreScreen();
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 font-medium"
                  >
                    <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>AI Pre-Screen Compliance</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    onOpenAutomationModal();
                  }}
                  className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 font-medium"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Automation & Telegram Bot</span>
                </button>
                {onOpenUserManual && (
                  <button
                    onClick={() => {
                      setIsMoreOpen(false);
                      onOpenUserManual();
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 font-medium text-slate-700"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                    <span>User Manual & Guide</span>
                  </button>
                )}
              </div>

              <div className="py-1">
                {onExportCsv && (
                  <button
                    onClick={() => {
                      setIsMoreOpen(false);
                      onExportCsv();
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-600 font-medium"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>Export Register to CSV</span>
                  </button>
                )}
                {applicationsCount > 0 && onClearAll && (
                  <button
                    onClick={() => {
                      setIsMoreOpen(false);
                      onClearAll();
                    }}
                    className="w-full text-left px-3.5 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center gap-2 font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Clear All Data</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-slate-200" />

        {/* User Account / Google Auth */}
        {authSession?.isAuthenticated ? (
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200/80 overflow-hidden flex items-center justify-center text-xs font-semibold text-slate-700 shrink-0"
              title={`Signed in as ${authSession.email}`}
            >
              {authSession.picture ? (
                <img
                  src={authSession.picture}
                  alt={authSession.name || 'User'}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                (authSession.email?.charAt(0) || 'U').toUpperCase()
              )}
            </div>
            <button
              onClick={onDisconnectGoogle}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
              title="Sign out of Google"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onConnectGoogle}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-colors"
            title="Sign in with Google to enable Gmail scanning"
          >
            <User className="w-3 h-3 text-slate-500" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
