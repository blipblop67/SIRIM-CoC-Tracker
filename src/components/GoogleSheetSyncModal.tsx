import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  Plus,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  TableProperties,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { SheetSyncConfig, SirimApplication, UserAuthSession } from '../types';
import { notificationAudio } from '../utils/audio';

interface GoogleSheetSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetConfig: SheetSyncConfig | null;
  authSession: UserAuthSession | null;
  applications: SirimApplication[];
  onSaveSheetConfig: (config: SheetSyncConfig) => void;
  onConnectGoogle: () => void;
}

export const GoogleSheetSyncModal: React.FC<GoogleSheetSyncModalProps> = ({
  isOpen,
  onClose,
  sheetConfig,
  authSession,
  applications,
  onSaveSheetConfig,
  onConnectGoogle,
}) => {
  if (!isOpen) return null;

  const [mode, setMode] = useState<'create' | 'existing'>('create');
  const [sheetTitle, setSheetTitle] = useState('SIRIM CoC Applications Master Register');
  const [existingIdOrUrl, setExistingIdOrUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Parse ID from URL if user pastes full URL
  const extractSpreadsheetId = (input: string): string => {
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input.trim();
  };

  const handleCreateNewSheet = async () => {
    if (!authSession?.accessToken) {
      setErrorMsg('Please connect your Google Account with Sheets permissions first.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/sheets/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.accessToken}`,
        },
        body: JSON.stringify({
          title: sheetTitle,
          initialRows: applications,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create Google Sheet');
      }

      const newConfig: SheetSyncConfig = {
        spreadsheetId: data.spreadsheetId,
        spreadsheetUrl: data.spreadsheetUrl,
        sheetName: data.sheetName || 'Active CoC Applications',
        autoSync: true,
        lastSynced: new Date().toISOString(),
        rowsCount: data.totalRows,
      };

      onSaveSheetConfig(newConfig);
      setSuccessMsg(`Google Sheet created and populated with ${applications.length} applications!`);
      notificationAudio.playSuccessTone();
      confetti({ particleCount: 50, spread: 60 });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error creating sheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLinkExistingSheet = async () => {
    const sheetId = extractSpreadsheetId(existingIdOrUrl);
    if (!sheetId) {
      setErrorMsg('Please enter a valid Google Spreadsheet ID or URL.');
      return;
    }

    if (!authSession?.accessToken) {
      setErrorMsg('Please connect your Google Account first.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.accessToken}`,
        },
        body: JSON.stringify({
          spreadsheetId: sheetId,
          applications: applications,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync to existing Google Sheet');
      }

      const config: SheetSyncConfig = {
        spreadsheetId: sheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`,
        sheetName: 'Active CoC Applications',
        autoSync: true,
        lastSynced: new Date().toISOString(),
        rowsCount: applications.length + 1,
      };

      onSaveSheetConfig(config);
      setSuccessMsg(`Linked and synced ${applications.length} applications successfully!`);
      notificationAudio.playSuccessTone();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error connecting to sheet.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-emerald-950 text-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600/30 text-emerald-300 ring-1 ring-emerald-500/40">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Google Sheets Synchronization</h3>
              <p className="text-xs text-emerald-200/80">
                Automated live sync for SIRIM Certificate of Conformity applications
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-emerald-300 hover:text-white hover:bg-emerald-900 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Auth warning if not connected */}
          {!authSession?.isAuthenticated && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-amber-900">Google Account Connection Required</p>
                <p className="text-amber-700">
                  To create or sync Google Sheets directly into your Google Drive, please sign in with Google Workspace.
                </p>
                <button
                  onClick={onConnectGoogle}
                  className="mt-1 px-3 py-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors"
                >
                  Connect Google Workspace
                </button>
              </div>
            </div>
          )}

          {/* Active Connected Sheet Info */}
          {sheetConfig?.spreadsheetUrl && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Master Tracking Sheet Connected
                </span>
                <a
                  href={sheetConfig.spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                >
                  <span>Open Sheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="text-xs text-slate-600 font-mono bg-white p-2 rounded border border-emerald-100 truncate">
                {sheetConfig.spreadsheetUrl}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>Tab: <strong>{sheetConfig.sheetName}</strong></span>
                <span>Last Synced: <strong>{sheetConfig.lastSynced ? new Date(sheetConfig.lastSynced).toLocaleTimeString() : 'Never'}</strong></span>
              </div>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setMode('create')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === 'create' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create New Sheet in Drive
            </button>
            <button
              onClick={() => setMode('existing')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === 'existing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Link Existing Sheet ID
            </button>
          </div>

          {/* Form Create */}
          {mode === 'create' ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Spreadsheet Title
                </label>
                <input
                  type="text"
                  value={sheetTitle}
                  onChange={(e) => setSheetTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs text-slate-600">
                <div className="font-semibold text-slate-800 flex items-center gap-1">
                  <TableProperties className="w-3.5 h-3.5 text-emerald-600" />
                  Auto-formatted Columns & Styling:
                </div>
                <p className="text-[11px] leading-relaxed">
                  Includes Navy header formatting, Ref No, Model, Scheme, Status, SIRIM Officer, <strong>Email Subject / Thread Name</strong>, <strong>Gmail Thread Link</strong> (clickable direct search/thread URL), Target SLA Deadline, Action Items, Fees, and Timestamps.
                </p>
              </div>

              <button
                onClick={handleCreateNewSheet}
                disabled={isProcessing || !authSession?.isAuthenticated}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{isProcessing ? 'Creating Sheet & Syncing Data...' : 'Create & Sync Master Sheet'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Google Sheet URL or Spreadsheet ID
                </label>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/1abc.../edit"
                  value={existingIdOrUrl}
                  onChange={(e) => setExistingIdOrUrl(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-mono"
                />
              </div>

              <button
                onClick={handleLinkExistingSheet}
                disabled={isProcessing || !authSession?.isAuthenticated}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>{isProcessing ? 'Connecting & Syncing...' : 'Link & Sync to Existing Sheet'}</span>
              </button>
            </div>
          )}

          {/* Feedback messages */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
