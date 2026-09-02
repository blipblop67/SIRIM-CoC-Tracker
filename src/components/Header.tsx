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
} from 'lucide-react';
import { SheetSyncConfig, UserAuthSession } from '../types';

interface HeaderProps {
  sheetConfig: SheetSyncConfig | null;
  authSession: UserAuthSession | null;
  pendingActionsCount: number;
  criticalActionsCount: number;
  onOpenSheetModal: () => void;
  onOpenGmailScanner: () => void;
  onOpenNewAppModal: () => void;
  onOpenNotificationDrawer: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onManualSyncSheet: () => void;
  isSyncingSheet: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  sheetConfig,
  authSession,
  pendingActionsCount,
  criticalActionsCount,
  onOpenSheetModal,
  onOpenGmailScanner,
  onOpenNewAppModal,
  onOpenNotificationDrawer,
  onConnectGoogle,
  onDisconnectGoogle,
  onManualSyncSheet,
  isSyncingSheet,
}) => {
  return (
    <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-8 shrink-0 shadow-lg z-10 sticky top-0">
      {/* Logo & Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">
          SIRIM CoC <span className="text-indigo-400">Progress Tracker</span>
        </h1>
      </div>

      {/* Quick Actions & Workspace Integrations */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Sync Status / Google Sheets */}
        {sheetConfig?.spreadsheetUrl ? (
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-xs text-slate-400 uppercase tracking-widest flex items-center gap-1">
              Google Sheet <ExternalLink className="w-3 h-3" />
            </span>
            <div className="flex items-center gap-2">
              <a
                href={sheetConfig.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium hover:text-emerald-400 transition-colors"
                title="Open Master Google Sheet"
              >
                {sheetConfig.sheetName || 'Active CoC Applications'}
              </a>
              <button
                onClick={onManualSyncSheet}
                disabled={isSyncingSheet}
                className="text-slate-400 hover:text-white transition-colors"
                title="Sync All Applications"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onOpenSheetModal}
            className="hidden sm:flex text-sm font-medium text-emerald-300 hover:text-emerald-200 transition-colors items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Connect Sheet
          </button>
        )}

        <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>

        {/* Scan & Ingest */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenGmailScanner}
            className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md text-sm font-medium border border-slate-700 transition-colors flex items-center gap-1.5"
            title="Scan Gmail Inbox"
          >
            <Mail className="w-4 h-4" />
            <span className="hidden sm:inline">Scan Gmail</span>
          </button>
          <button
            onClick={onOpenNewAppModal}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md text-sm font-medium border border-indigo-500 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-indigo-200" />
            <span className="hidden sm:inline">Ingest Email</span>
          </button>
        </div>

        <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>

        {/* Notifications Bell */}
        <button
          onClick={onOpenNotificationDrawer}
          className="relative text-slate-300 hover:text-white transition-colors"
          title="Pending Action Items & Alerts"
        >
          <Bell className="w-5 h-5" />
          {pendingActionsCount > 0 && (
            <span
              className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold rounded-full text-white ring-2 ring-slate-900 ${
                criticalActionsCount > 0 ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
              }`}
            >
              {pendingActionsCount}
            </span>
          )}
        </button>

        {/* Google OAuth Session */}
        {authSession?.isAuthenticated ? (
          <div className="flex items-center gap-2" title={`Signed in as ${authSession.email || 'Google User'}`}>
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs border border-indigo-200 overflow-hidden cursor-pointer" onClick={onDisconnectGoogle}>
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
          </div>
        ) : (
          <button
            onClick={onConnectGoogle}
            className="bg-slate-800 hover:bg-slate-700 p-2 rounded-md border border-slate-700 transition-colors"
            title="Connect your Google Account"
          >
            <User className="w-4 h-4 text-slate-300" />
          </button>
        )}
      </div>
    </header>
  );
};
