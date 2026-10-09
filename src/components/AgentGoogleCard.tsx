import React, { useState } from 'react';
import { Link2, Link2Off, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AutomationConfig } from '../types';
import { safeFetchJson } from '../utils/api';

/**
 * Connects the agent to one Google account for good, so the daily 08:30 run can read Gmail and update
 * the Sheet without anyone being signed in. Also shows first-scan progress and the SIRIM agent addresses.
 */
export const AgentGoogleCard: React.FC<{
  config: AutomationConfig;
  onUpdate: (patch: Partial<AutomationConfig>) => void;
}> = ({ config, onUpdate }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ag = config.agentGoogle;
  const scan = config.scanState;

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await safeFetchJson<{ url: string }>('/api/automation/google/connect', { method: 'POST' });
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || 'Could not start the Google connection.');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect the agent from Google? Daily scans and Sheet updates will stop until it is connected again.')) return;
    setBusy(true);
    try {
      await safeFetchJson('/api/automation/google/disconnect', { method: 'POST' });
      onUpdate({ agentGoogle: { connected: false } });
    } catch (e: any) {
      setError(e?.message || 'Could not disconnect.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Google account for daily scans</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            The agent reads this inbox every morning and updates the Google Sheet, even when nobody is signed in.
          </p>
        </div>
        {ag?.connected ? (
          ag.needsReconnect ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full shrink-0">
              <AlertTriangle className="w-3 h-3" /> Needs reconnecting
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
            <AlertTriangle className="w-3 h-3" /> Not connected
          </span>
        )}
      </div>

      {ag?.connected && (
        <p className="text-xs text-slate-700">
          Reading <b>{ag.email}</b>
          {ag.connectedAt ? ` · connected ${new Date(ag.connectedAt).toLocaleDateString()}` : ''}
          {ag.lastError ? <span className="block text-rose-600 mt-1">Last problem: {ag.lastError}</span> : null}
        </p>
      )}

      {config.agentGoogleAvailable === false && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          The server needs a Google OAuth client secret first (GOOGLE_OAUTH_CLIENT_SECRET in .env). Until then the agent can
          only use the sign-in of whoever last opened the tracker, which lasts about an hour.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={connect}
          disabled={busy || config.agentGoogleAvailable === false}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
          {ag?.connected ? 'Reconnect / change account' : 'Connect Google'}
        </button>
        {ag?.connected && (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Link2Off className="w-3.5 h-3.5" /> Disconnect
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {scan && (scan.remaining > 0 || scan.lastSuccessfulScanAt) && (
        <div className="text-xs text-slate-600 border-t border-slate-100 pt-3">
          {scan.remaining > 0 ? (
            <>
              <b>{scan.mode === 'FIRST_SCAN' ? 'First-time scan' : 'Scan'} in progress:</b> {scan.processed} of {scan.total} email
              threads read. It carries on automatically in the background.
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-sky-500"
                  style={{ width: `${scan.total ? Math.round((scan.processed / scan.total) * 100) : 0}%` }}
                />
              </div>
            </>
          ) : (
            <>Last complete scan: {new Date(scan.lastSuccessfulScanAt!).toLocaleString()}</>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        <label className="block text-xs font-semibold text-slate-700">SIRIM agent / consultant email addresses</label>
        <p className="text-[11px] text-slate-500 mb-1.5">
          Emails with these people (or domains) are always treated as SIRIM emails, even without "SIRIM" in the subject.
          Separate with commas, e.g. <code>agent@consultco.com.my, consultco.com.my</code>.
        </p>
        <input
          type="text"
          value={config.trustedSenders || ''}
          onChange={(e) => onUpdate({ trustedSenders: e.target.value })}
          placeholder="agent@example.com.my"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      </div>
    </div>
  );
};
