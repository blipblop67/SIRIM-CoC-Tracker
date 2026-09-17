import React, { useState } from 'react';
import {
  X,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  Sparkles,
  ShieldCheck,
  Radio,
  Zap,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import { CertificationScheme, DocumentPreScreenResult, SirimApplication } from '../types';
import { safeFetchJson } from '../utils/api';

interface DocumentPreScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  application?: SirimApplication | null;
  onApplyResult?: (result: DocumentPreScreenResult) => void;
}

export const DocumentPreScreenModal: React.FC<DocumentPreScreenModalProps> = ({
  isOpen,
  onClose,
  application,
  onApplyResult,
}) => {
  const [documentName, setDocumentName] = useState(
    application ? `${application.productName} RF Test Report` : 'ETSI EN 300 328 Test Report'
  );
  const [scheme, setScheme] = useState<CertificationScheme>(
    application?.scheme || 'Type Approval (MCMC/SIRIM)'
  );
  const [modelNumber, setModelNumber] = useState(application?.modelNumber || 'ESP32-S3-WROOM-1');
  const [productName, setProductName] = useState(application?.productName || 'Wi-Fi / BLE IoT Controller');
  const [documentText, setDocumentText] = useState(
    `TEST REPORT FOR ELECTROMAGNETIC COMPATIBILITY AND RADIO SPECTRUM MATTERS (ERM)
Standard: ETSI EN 300 328 V2.2.2 (2019-07)
Wideband transmission systems; Data transmission equipment operating in the 2.4 GHz ISM band.
Laboratory: Shenzhen Microtest Co., Ltd.
Accreditation: ISO/IEC 17025 (CNAS L5868 / ILAC-MRA Mutual Recognition Endorsed)
Equipment Under Test (EUT): Wi-Fi / BLE IoT Controller
Model Tested: ${modelNumber}
Operating Frequency: 2412 MHz - 2472 MHz (802.11b/g/n HT20/HT40), 2402 - 2480 MHz (Bluetooth LE)
Modulation: DSSS, OFDM, GFSK
Maximum Peak Conducted Output Power: 17.82 dBm
Antenna Type: Integrated PCB Trace Antenna
Peak Antenna Gain: 2.5 dBi
Maximum Equivalent Isotropically Radiated Power (E.I.R.P.): 19.32 dBm (85.5 mW)
Occupied Bandwidth: 17.65 MHz (99% power)
Transmitter Unwanted Emissions in the Out-of-band Domain: Complies with limits
Transmitter Unwanted Emissions in the Spurious Domain: 30MHz - 1GHz < -36dBm; 1GHz - 12.75GHz < -30dBm (PASS)
Receiver Spurious Emissions: Complies with -57 dBm limit (PASS)`
  );

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<DocumentPreScreenResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDocumentName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setDocumentText(text.slice(0, 30000));
      }
    };
    reader.onerror = () => {
      setErrorMessage('Could not read the uploaded file. Please paste text directly.');
    };
    reader.readAsText(file);
  };

  const handleRunPreScreen = async () => {
    if (!documentText.trim()) {
      setErrorMessage('Please paste or upload document content to analyze.');
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);
    setScanResult(null);

    try {
      const res = await safeFetchJson<{ success: boolean; result: DocumentPreScreenResult; isFallback?: boolean }>(
        '/api/gemini/pre-screen-document',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentName,
            documentText,
            scheme,
            productName,
            modelNumber,
          }),
        }
      );

      if (res.result) {
        setScanResult(res.result);
      } else {
        throw new Error('No pre-screening evaluation returned from server');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Pre-screening scan failed. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleCopySummary = () => {
    if (!scanResult) return;
    const report = `SIRIM / MCMC COMPLIANCE PRE-SCREEN REPORT
Document: ${scanResult.documentName} (${scanResult.documentType})
Overall Verdict: ${scanResult.overallVerdict} (Score: ${scanResult.score}/100)
Summary: ${scanResult.summary}

Critical Issues:
${scanResult.issues.map((i) => `• [${i.severity}] ${i.issue} (Ref: ${i.malaysianStandardRef})\n  Action: ${i.recommendation}`).join('\n')}

Passed Checks:
${scanResult.passedChecks.map((p) => `✓ ${p}`).join('\n')}
`;
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold">SIRIM & MCMC Document Compliance Scanner</h3>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-semibold px-2 py-0.5 rounded-full">
                  AI Pre-Screen
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Pre-screen supplier test reports & technical files against Malaysian Standards (MS) & MCMC technical codes before lodging with SIRIM.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Scanner Error</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Form Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Document Title</label>
              <input
                type="text"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="e.g. ETSI EN 300 328 Test Report"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Certification Scheme</label>
              <select
                value={scheme}
                onChange={(e) => setScheme(e.target.value as CertificationScheme)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
              >
                <option value="Type Approval (MCMC/SIRIM)">Type Approval (MCMC/SIRIM)</option>
                <option value="Modular Approval">Modular Approval</option>
                <option value="Special Approval">Special Approval</option>
                <option value="Safety & EMC (MS Standards)">Safety & EMC (MS Standards)</option>
                <option value="CIDB Certification">CIDB Certification</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">Tested Product & Model</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={modelNumber}
                  onChange={(e) => setModelNumber(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Model No"
                />
              </div>
            </div>
          </div>

          {/* Document Content Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700">
                Document Text / Test Laboratory Extract
              </label>
              <label className="cursor-pointer inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Report (.txt, .log)</span>
                <input
                  type="file"
                  accept=".txt,.log,.json,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              rows={6}
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              placeholder="Paste the front sheet, accreditation summary, frequency tables, or power output parameters from the supplier test report..."
              className="w-full text-xs font-mono px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed bg-slate-50"
            />
          </div>

          {/* Scan Action Button */}
          <div className="flex justify-end">
            <button
              onClick={handleRunPreScreen}
              disabled={isScanning || !documentText.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              {isScanning ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Evaluating against Malaysian Standards...</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span>Run Compliance Pre-Screen</span>
                </>
              )}
            </button>
          </div>

          {/* Scan Result Output */}
          {scanResult && (
            <div className="mt-6 border border-slate-200 rounded-2xl p-4 sm:p-5 bg-white space-y-4 shadow-xs">
              {/* Verdict Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-black uppercase px-2.5 py-1 rounded-full border ${
                        scanResult.overallVerdict === 'COMPLIANT'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : scanResult.overallVerdict === 'RISK_OF_REJECTION'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                    >
                      {scanResult.overallVerdict === 'COMPLIANT'
                        ? '✓ Ready for SIRIM Submission'
                        : scanResult.overallVerdict === 'RISK_OF_REJECTION'
                        ? '⚠️ Risk of SIRIM Query / Rejection'
                        : 'ℹ️ Additional Details Needed'}
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      Score: <strong className="text-slate-900">{scanResult.score} / 100</strong>
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{scanResult.summary}</p>
                </div>

                <button
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Audit Summary'}</span>
                </button>
              </div>

              {/* Detected Specs Badge Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Lab Accreditation</span>
                  <span className="font-semibold text-slate-800 truncate block">
                    {scanResult.detectedLabAccreditation || 'ISO/IEC 17025'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Frequencies</span>
                  <span className="font-mono text-slate-800 truncate block">
                    {scanResult.detectedFrequencies?.join(', ') || '2.4 GHz ISM'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Radiated Power</span>
                  <span className="font-mono text-slate-800 truncate block">
                    {scanResult.detectedPowerOutput || '≤ 20 dBm EIRP'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Standards Ref</span>
                  <span className="font-medium text-slate-800 truncate block">
                    {scanResult.detectedStandards?.join(', ') || 'ETSI EN 300 328'}
                  </span>
                </div>
              </div>

              {/* Issues / Rejection Risks */}
              {scanResult.issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Regulatory Observations & Rejection Risks ({scanResult.issues.length})
                  </h4>
                  <div className="space-y-2">
                    {scanResult.issues.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border text-xs space-y-1 ${
                          item.severity === 'CRITICAL'
                            ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                            : item.severity === 'WARNING'
                            ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                            : 'bg-blue-50/70 border-blue-200 text-blue-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{item.issue}</span>
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white/80 border border-current">
                            {item.malaysianStandardRef}
                          </span>
                        </div>
                        <p className="text-[11px] opacity-90">
                          <strong>Action:</strong> {item.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Passed Checks */}
              {scanResult.passedChecks.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Verified Compliance Criteria ({scanResult.passedChecks.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {scanResult.passedChecks.map((check, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 p-2 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs text-emerald-900"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{check}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">
            Powered by Gemini AI • Malaysian MCMC MTSFB TC T007 & MS IEC 62368-1 Rules
          </span>
          <div className="flex items-center gap-2">
            {scanResult && onApplyResult && (
              <button
                onClick={() => {
                  onApplyResult(scanResult);
                  onClose();
                }}
                className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save to Application Notes & Timeline</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              Close Scanner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
