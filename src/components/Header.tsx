import React from 'react';
import {
  FileSpreadsheet,
  Mail,
  Plus,
  Bell,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Radio,
  User,
  LogOut,
  Sparkles,
  Zap,
  Send,
  Trash2,
} from 'lucide-react';
import { AutomationConfig, SheetSyncConfig, UserAuthSession } from '../types';

interface HeaderProps {
  sheetConfig: SheetSyncConfig | null;
  authSession: UserAuthSession | null;
  automationConfig: AutomationConfig;
  pendingActionsCount: number;
  criticalActionsCount: number;
  applicationsCount?: number;
  onOpenSheetModal: () => void;
  onOpenGmailScanner: () => void;
  onOpenNewAppModal: () => void;
  onOpenNotificationDrawer: () => void;
  onOpenAutomationModal: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onManualSyncSheet: () => void;
  onClearAll?: () => void;
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
  onOpenSheetModal,
  onOpenGmailScanner,
  onOpenNewAppModal,
  onOpenNotificationDrawer,
  onOpenAutomationModal,
  onConnectGoogle,
  onDisconnectGoogle,
  onManualSyncSheet,
  onClearAll,
  isSyncingSheet,
  isRunningAutomation,
}) => {
  const isTelegramReady = Boolean(
    automationConfig.telegram?.botToken?.trim() && automationConfig.telegram?.chatId?.trim()
  );

  return (
    <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-6 sm:px-8 shrink-0 shadow-lg z-10 sticky top-0">
      {/* Logo & Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center shadow-inner">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight leading-none">
            SIRIM CoC <span className="text-indigo-400">Progress Tracker</span>
          </h1>
          <span className="text-[10px] text-slate-400 hidden sm:inline">
            Automated Regulatory Intelligence Register
          </span>
        </div>
      </div>

      {/* Quick Actions & Workspace Integrations */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Automation & Telegram Bot Control Center */}
        <button
          onClick={onOpenAutomationModal}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 shadow-xs ${
            automationConfig.enabled
              ? 'bg-indigo-950/80 border-indigo-500/50 text-indigo-200 hover:bg-indigo-900/90'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
          }`}
          title="Configure Morning Automation & Telegram Bot"
        >
          <Zap className={`w-3.5 h-3.5 ${automationConfig.enabled ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
          <span className="hidden md:inline font-medium">
            {automationConfig.enabled ? `Auto: ${automationConfig.scheduleTime}` : 'Automation'}
          </span>
          {isTelegramReady && (
            <Send className="w-3 h-3 text-sky-400 ml-0.5" />
          )}
        </button>

        {/* Sync Status / Google Sheets */}
        {sheetConfig?.spreadsheetUrl ? (
          <div className="flex flex-col items-end hidden lg:flex">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center gap-1">
              Google Sheet <ExternalLink className="w-2.5 h-2.5" />
            </span>
            <div className="flex items-center gap-1.5">
              <a
                href={sheetConfig.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium hover:text-emerald-400 transition-colors truncate max-w-[140px]"
                title="Open Master Google Sheet"
              >
                {sheetConfig.sheetName || 'Active CoC Applications'}
              </a>
              <button
                onClick={onManualSyncSheet}
                disabled={isSyncingSheet}
                className="text-slate-400 hover:text-white transition-colors p-0.5"
                title="Sync All Applications to Google Sheet"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingSheet ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onOpenSheetModal}
            className="hidden sm:flex text-xs font-medium text-emerald-300 hover:text-emerald-200 transition-colors items-center gap-1.5 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1.5 rounded-lg"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Connect Sheet
          </button>
        )}

        <div className="h-6 w-px bg-slate-700 hidden sm:block"></div>

        {/* Scan & Ingest */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenGmailScanner}
            className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1.5"
            title="Scan Gmail Inbox"
          >
            <Mail className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Scan Gmail</span>
          </button>
          <button
            onClick={onOpenNewAppModal}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-500 transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
            <span className="hidden sm:inline">Ingest Email</span>
          </button>
          {applicationsCount > 0 && onClearAll && (
            <button
              onClick={onClearAll}
              className="hidden xl:flex items-center gap-1 text-xs text-rose-300 hover:text-rose-100 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/60 px-2.5 py-1.5 rounded-lg transition-colors font-medium shadow-xs"
              title="Clear all application data and start fresh"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clear Data</span>
            </button>
          )}
        </div>

        <div className="h-6 w-px bg-slate-700 hidden sm:block"></div>

        {/* Notifications Bell */}
        <button
          onClick={onOpenNotificationDrawer}
          className="relative text-slate-300 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          title="Pending Action Items & Alerts"
        >
          <Bell className="w-4 h-4" />
          {pendingActionsCount > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 text-[8px] font-bold rounded-full text-white ring-2 ring-slate-900 ${
                criticalActionsCount > 0 ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
              }`}
            >
              {pendingActionsCount}
            </span>
          )}
        </button>

        {/* Google OAuth Session */}
        {authSession?.isAuthenticated ? (
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 pl-2.5 pr-1.5 py-1 rounded-xl shadow-xs">
            <div className="flex flex-col text-right hidden sm:block">
              <span className="text-[11px] font-bold text-slate-200 leading-tight truncate max-w-[120px]">
                {authSession.name || authSession.email?.split('@')[0] || 'User'}
              </span>
              <span className="text-[9px] text-indigo-400 font-mono leading-none truncate max-w-[120px]">
                {authSession.email || 'Connected'}
              </span>
            </div>
            <div
              className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold text-xs border border-indigo-400/40 overflow-hidden shadow-xs shrink-0"
              title={`Signed in as ${authSession.email}. Click to sign out.`}
            >
              {authSession.picture ? (
                <img
                  src={authSession.picture}
                  alt="User avatar"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                (authSession.email?.charAt(0) || 'U').toUpperCase()
              )}
            </div>
            <button
              onClick={onDisconnectGoogle}
              className="p-1 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-700 transition-colors"
              title="Sign out / Switch Google account"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onConnectGoogle}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-semibold border border-indigo-500 transition-all flex items-center gap-1.5 shadow-xs"
            title="Sign in with Google to scan your Gmail inbox & sync Google Sheets"
          >
            <User className="w-3.5 h-3.5" />
            <span>Sign in with Google</span>
          </button>
        )}
      </div>
    </header>
  );
};

