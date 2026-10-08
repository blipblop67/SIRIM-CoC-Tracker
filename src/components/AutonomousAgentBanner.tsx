import React from 'react';
import {
  Bot,
  Zap,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  Mail,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { AutomationConfig, SheetSyncConfig, UserAuthSession } from '../types';

interface AutonomousAgentBannerProps {
  automationConfig: AutomationConfig;
  sheetConfig: SheetSyncConfig | null;
  authSession: UserAuthSession | null;
  isRunningAutomation: boolean;
  onOpenAutomationModal: () => void;
  onOpenSheetModal: () => void;
  onConnectGoogle: () => void;
  onRunNow: () => void;
}

export const AutonomousAgentBanner: React.FC<AutonomousAgentBannerProps> = ({
  automationConfig,
  sheetConfig,
  authSession,
  isRunningAutomation,
  onOpenAutomationModal,
  onOpenSheetModal,
  onConnectGoogle,
  onRunNow,
}) => {
  const isGoogleConnected = Boolean(authSession?.accessToken);
  const isSheetConnected = Boolean(sheetConfig?.spreadsheetId);
  const isFullyAutonomous = isGoogleConnected && isSheetConnected && automationConfig.enabled;

  const intervalMin = automationConfig.autonomousIntervalMinutes ?? 0;
  const isDailyMorningOnly = intervalMin === 0;

  const formatLastRunTime = (isoString?: string) => {
    if (!isoString) return 'Pending first cycle';
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin === 1) return '1 minute ago';
      if (diffMin < 60) return `${diffMin} minutes ago`;
      const diffHours = Math.floor(diffMin / 60);
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } catch {
      return 'Recently';
    }
  };

  const getNextRunMinutes = (isoString?: string) => {
    if (isDailyMorningOnly) {
      return `Daily at ${automationConfig.scheduleTime || '08:30'} MYT`;
    }
    if (!isoString) return `~${intervalMin}m`;
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const elapsedMin = Math.floor(diffMs / 60000);
      const remaining = Math.max(1, intervalMin - (elapsedMin % intervalMin));
      return `~${remaining}m`;
    } catch {
      return `~${intervalMin}m`;
    }
  };

  // FULLY AUTONOMOUS ACTIVE STATE
  if (isFullyAutonomous) {
    return (
      <div className="mb-4 bg-white border border-slate-200/90 rounded-xl p-3.5 sm:p-4 shadow-2xs hover:border-slate-300 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left Status */}
          <div className="flex items-start sm:items-center gap-3">
            <div className="relative shrink-0 mt-0.5 sm:mt-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                <Bot className="w-4 h-4 text-emerald-600" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                  Autonomous Agent Active
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Zero Human Trigger Mode
                </span>
                {isRunningAutomation && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 animate-pulse">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    Executing Autonomous Cycle...
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isDailyMorningOnly
                  ? `Every morning at ${automationConfig.scheduleTime || '08:30'} MYT: scans Gmail, updates dashboard, syncs Google Sheet & dispatches Telegram update.`
                  : `Every morning at ${automationConfig.scheduleTime || '08:30'} MYT (with Telegram briefing) + silently scans Gmail & syncs Sheet every ${intervalMin} minutes.`}
              </p>
            </div>
          </div>

          {/* Right Metrics & Quick Links */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap pt-1 md:pt-0 border-t md:border-t-0 border-slate-100">
            <div className="text-[11px] text-slate-500 flex items-center gap-2 sm:gap-3">
              <span className="flex items-center gap-1 text-slate-600 font-medium">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Last run:</span>
                <strong className="text-slate-800">{formatLastRunTime(automationConfig.lastRunAt)}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1 text-slate-600 font-medium">
                <span>Next check:</span>
                <strong className="text-emerald-700">{getNextRunMinutes(automationConfig.lastRunAt)}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 ml-auto md:ml-0">
              <button
                type="button"
                onClick={onRunNow}
                disabled={isRunningAutomation}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                title="Force execute an autonomous sync cycle now"
              >
                <RefreshCw className={`w-3 h-3 ${isRunningAutomation ? 'animate-spin text-sky-600' : 'text-slate-400'}`} />
                <span>Sync Now</span>
              </button>

              <button
                type="button"
                onClick={onOpenAutomationModal}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                title="Configure autonomous cadence and Telegram bot"
              >
                <Sliders className="w-3 h-3 text-slate-400" />
                <span>Cadence</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ONBOARDING / SETUP STATE (WAITING FOR ACCESS)
  return (
    <div className="mb-4 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/70 border border-indigo-200/80 rounded-xl p-4 shadow-2xs">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Information */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5 shadow-xs">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Autonomous Agent Setup
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                Hands-Free Automation
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Once you grant access to your Gmail and Google Sheet, this agent operates completely autonomously:
              it reads incoming SIRIM emails, evaluates checklist action progress with Gemini AI, and auto-syncs live records without any human triggers.
            </p>
          </div>
        </div>

        {/* Right Access Steps */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
          {/* Step 1: Email access */}
          {isGoogleConnected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gmail Connected ({authSession?.email?.split('@')[0]})</span>
            </div>
          ) : (
            <button
              onClick={onConnectGoogle}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-indigo-200 text-indigo-700 text-xs font-semibold shadow-2xs transition-colors hover:border-indigo-300"
            >
              <Mail className="w-3.5 h-3.5 text-indigo-600" />
              <span>1. Grant Gmail Access</span>
              <ArrowRight className="w-3 h-3 text-indigo-400" />
            </button>
          )}

          {/* Step 2: Google Sheet access */}
          {isSheetConnected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="truncate max-w-[140px]">{sheetConfig?.sheetName || 'Sheet Connected'}</span>
            </div>
          ) : (
            <button
              onClick={onOpenSheetModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>2. Link or Auto-Create Sheet</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
