import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ShieldCheck,
  ExternalLink,
  Eye,
  FileCheck2,
  Car,
  Calendar,
  Lock,
  Download,
  ScanLine,
  RefreshCw,
  Sparkles,
  Layers,
} from 'lucide-react';
import type { Certificate } from '../types';

interface DirectPdfScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewCertificate?: (certificate: Certificate) => void;
  onCertificateUpdated?: () => void;
}

interface ScanResult {
  filename: string;
  success: boolean;
  isExistingMatch: boolean;
  message: string;
  matchedCertificate?: Certificate;
  extractedFields?: any;
}

export const DirectPdfScannerModal: React.FC<DirectPdfScannerModalProps> = ({
  isOpen,
  onClose,
  onViewCertificate,
  onCertificateUpdated,
}) => {
  const [activeMode, setActiveMode] = useState<'single' | 'batch'>('single');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Single scan state
  const [singleResult, setSingleResult] = useState<ScanResult | null>(null);

  // Batch scan state
  const [batchResults, setBatchResults] = useState<ScanResult[]>([]);
  const [batchSummary, setBatchSummary] = useState<{ total: number; matched: number; newCerts: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const resetScanner = () => {
    setSingleResult(null);
    setBatchResults([]);
    setBatchSummary(null);
    setErrorMessage(null);
    setIsScanning(false);
    setScanProgress('');
  };

  // Handle single PDF scan
  const handleSingleFile = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Please select a valid PDF file.');
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);
    setSingleResult(null);
    setScanProgress(`Reading PDF data from ${file.name}...`);

    try {
      const pdfBase64 = await fileToBase64(file);
      setScanProgress('Parsing certificate text & cross-referencing active database...');

      const res = await fetch('/api/certificates/scan-direct-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64,
          filename: file.name,
          autoCommit: true,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Server failed to scan PDF.');
      }

      const data = await res.json();
      setSingleResult({
        filename: file.name,
        success: data.success,
        isExistingMatch: Boolean(data.isExistingMatch),
        message: data.message,
        matchedCertificate: data.certificate,
        extractedFields: data.extractedFields,
      });

      onCertificateUpdated?.();
    } catch (err: any) {
      console.error('Single scan error:', err);
      setErrorMessage(err.message || 'Error occurred while scanning PDF.');
    } finally {
      setIsScanning(false);
      setScanProgress('');
    }
  };

  // Handle batch PDF scan
  const handleBatchFiles = async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      setErrorMessage('No PDF files found in selection.');
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);
    setBatchResults([]);
    setBatchSummary(null);

    try {
      const payloadFiles: Array<{ filename: string; fileData: string }> = [];
      for (let i = 0; i < pdfFiles.length; i++) {
        setScanProgress(`Reading PDF ${i + 1} of ${pdfFiles.length}: ${pdfFiles[i].name}...`);
        const base64 = await fileToBase64(pdfFiles[i]);
        payloadFiles.push({
          filename: pdfFiles[i].name,
          fileData: base64,
        });
      }

      setScanProgress(`Scanning ${payloadFiles.length} PDF(s) against official database...`);

      const res = await fetch('/api/certificates/scan-direct-pdfs-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: payloadFiles,
          autoCommit: true,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Batch scan failed.');
      }

      const data = await res.json();
      setBatchResults(data.results || []);
      setBatchSummary({
        total: data.total || pdfFiles.length,
        matched: data.matchedCount || 0,
        newCerts: data.newCount || 0,
      });

      onCertificateUpdated?.();
    } catch (err: any) {
      console.error('Batch scan error:', err);
      setErrorMessage(err.message || 'Error occurred during batch PDF scanning.');
    } finally {
      setIsScanning(false);
      setScanProgress('');
    }
  };

  const handleDropSingle = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length === 1) {
        handleSingleFile(e.dataTransfer.files[0]);
      } else {
        setActiveMode('batch');
        handleBatchFiles(e.dataTransfer.files);
      }
    }
  };

  const handleDropBatch = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleBatchFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0d2847] to-[#163a63] text-white px-5 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 border border-emerald-400/30 rounded-xl">
              <ScanLine className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-serif tracking-wide text-white">
                  Direct PDF Database Scanner
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                  Auto-Check Database
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Upload direct PDF(s). Automatically cross-references database to match identical records or register new ones.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-4 border-b border-slate-200 flex items-center gap-4 bg-slate-50/70">
          <button
            type="button"
            onClick={() => {
              setActiveMode('single');
              resetScanner();
            }}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeMode === 'single'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Single PDF Scanner</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode('batch');
              resetScanner();
            }}
            className={`pb-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeMode === 'batch'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Batch PDF Scanner (Multiple)</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-xs text-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* SINGLE PDF MODE */}
          {activeMode === 'single' && (
            <div className="space-y-5">
              {!singleResult && !isScanning && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDropSingle}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-2xl p-8 sm:p-12 text-center bg-slate-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleSingleFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 mb-4 group-hover:scale-110 transition-transform shadow-xs">
                    <Upload className="w-7 h-7" />
                  </div>
                  <h4 className="text-base font-bold text-slate-800">
                    Drop Direct Certificate PDF Here
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Click to browse or drop an official certificate PDF. The scanner will automatically verify if it's already in the database.
                  </p>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-4 rounded-full text-[11px] font-semibold bg-white border border-slate-200 text-slate-600 shadow-2xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Auto-scans Certificate No, Vehicle RC &amp; Scrapping Reg</span>
                  </div>
                </div>
              )}

              {/* Scanning Spinner */}
              {isScanning && (
                <div className="p-8 sm:p-12 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Scanning Database in Real-Time</h4>
                    <p className="text-xs text-slate-500 mt-1 animate-pulse">{scanProgress}</p>
                  </div>
                  <div className="w-48 h-1.5 bg-slate-200 rounded-full mx-auto overflow-hidden">
                    <div className="w-full h-full bg-emerald-500 animate-indeterminate"></div>
                  </div>
                </div>
              )}

              {/* Scan Result Details */}
              {singleResult && (
                <div className="space-y-4">
                  {singleResult.isExistingMatch && singleResult.matchedCertificate ? (
                    /* DATABASE MATCH CARD */
                    <div className="p-5 sm:p-6 bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl space-y-4 shadow-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-200 text-emerald-900 uppercase tracking-wide">
                              Database Match — Same Record Found
                            </span>
                            <h4 className="text-lg font-bold font-serif text-emerald-950 mt-1">
                              {singleResult.matchedCertificate.certificateNumber}
                            </h4>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-emerald-800 border border-emerald-300 shadow-2xs">
                          <Lock className="w-3.5 h-3.5 text-emerald-600" />
                          <span>100% Cryptographic Match</span>
                        </span>
                      </div>

                      <p className="text-xs text-emerald-800 leading-relaxed">
                        This certificate already exists in your official registry. The original record is preserved intact without duplication, and this direct PDF has been securely linked and archived.
                      </p>

                      {/* Details Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-white/90 p-4 rounded-xl border border-emerald-200 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Registered Owner</span>
                          <span className="font-bold text-slate-800 text-sm">{singleResult.matchedCertificate.ownerName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Vehicle Registration</span>
                          <span className="font-mono font-bold text-slate-800 text-sm">{singleResult.matchedCertificate.vehicleRegistrationNumber}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Scrapping Reg No</span>
                          <span className="font-mono font-semibold text-slate-700">{singleResult.matchedCertificate.scrappingRegistrationNumber}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Vehicle Make / Model</span>
                          <span className="font-medium text-slate-700">{singleResult.matchedCertificate.make} - {singleResult.matchedCertificate.model}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Date of Issue</span>
                          <span className="font-medium text-slate-700">{singleResult.matchedCertificate.dateOfIssue}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Status</span>
                          <span className="font-bold text-emerald-700 uppercase">{singleResult.matchedCertificate.status}</span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {onViewCertificate && (
                          <button
                            type="button"
                            onClick={() => {
                              onViewCertificate(singleResult.matchedCertificate!);
                              onClose();
                            }}
                            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                          >
                            <Eye className="w-4 h-4" />
                            <span>View Certificate in Registry</span>
                          </button>
                        )}

                        <a
                          href={`/api/certificates/pdf/${encodeURIComponent(singleResult.matchedCertificate.certificateNumber.replace(/[\/\\]/g, '_'))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          <FileText className="w-4 h-4 text-emerald-600" />
                          <span>Open Stored PDF</span>
                        </a>

                        <a
                          href={`/verify?certificateNumber=${encodeURIComponent(singleResult.matchedCertificate.certificateNumber)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          <ExternalLink className="w-4 h-4 text-slate-500" />
                          <span>Public Verification Link</span>
                        </a>

                        <button
                          type="button"
                          onClick={resetScanner}
                          className="px-3.5 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold ml-auto transition-colors cursor-pointer"
                        >
                          Scan Another PDF
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* NEW CERTIFICATE CARD */
                    <div className="p-5 sm:p-6 bg-sky-50 border-2 border-sky-300 rounded-2xl space-y-4 shadow-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-sky-600 text-white rounded-xl shadow-xs">
                          <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-200 text-sky-900 uppercase tracking-wide">
                            New Certificate Added to Database
                          </span>
                          <h4 className="text-lg font-bold font-serif text-sky-950 mt-1">
                            {singleResult.matchedCertificate?.certificateNumber || singleResult.extractedFields?.certificateNumber || 'New Certificate'}
                          </h4>
                        </div>
                      </div>

                      <p className="text-xs text-sky-800">
                        {singleResult.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {singleResult.matchedCertificate && onViewCertificate && (
                          <button
                            type="button"
                            onClick={() => {
                              onViewCertificate(singleResult.matchedCertificate!);
                              onClose();
                            }}
                            className="px-4 py-2 bg-[#0d2847] hover:bg-[#163a63] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                          >
                            <Eye className="w-4 h-4" />
                            <span>View in Registry</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={resetScanner}
                          className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          Scan Another PDF
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* BATCH PDF MODE */}
          {activeMode === 'batch' && (
            <div className="space-y-5">
              {!batchSummary && !isScanning && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDropBatch}
                  onClick={() => batchFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-2xl p-8 sm:p-12 text-center bg-slate-50/50 hover:bg-emerald-50/20 transition-all cursor-pointer group"
                >
                  <input
                    ref={batchFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleBatchFiles(e.target.files);
                      }
                    }}
                  />
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700 mb-4 group-hover:scale-110 transition-transform shadow-xs">
                    <Layers className="w-7 h-7" />
                  </div>
                  <h4 className="text-base font-bold text-slate-800">
                    Select Multiple Certificate PDFs
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Drag and drop a folder or multiple PDF files. The scanner will process each and check whether it's already in the database.
                  </p>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-4 rounded-full text-[11px] font-semibold bg-white border border-slate-200 text-slate-600 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Auto-scans each PDF &amp; updates matching database records</span>
                  </div>
                </div>
              )}

              {isScanning && (
                <div className="p-8 sm:p-12 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Batch Scanning in Progress</h4>
                    <p className="text-xs text-slate-500 mt-1 animate-pulse">{scanProgress}</p>
                  </div>
                </div>
              )}

              {batchSummary && (
                <div className="space-y-4">
                  {/* Summary Banner */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="font-bold text-emerald-900">
                        Scanned {batchSummary.total} PDF(s): {batchSummary.matched} matched existing database records (same only), {batchSummary.newCerts} new registered.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={resetScanner}
                      className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Scan More PDFs
                    </button>
                  </div>

                  {/* Results Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                          <th className="p-3">File Name</th>
                          <th className="p-3">Certificate No</th>
                          <th className="p-3">Owner / Vehicle</th>
                          <th className="p-3">Database Match</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {batchResults.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-medium text-slate-800 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-slate-400" />
                              <span className="truncate max-w-[160px]">{r.filename}</span>
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-800">
                              {r.certificateNumber || '—'}
                            </td>
                            <td className="p-3 text-slate-600">
                              <div>{r.ownerName || '—'}</div>
                              <div className="text-[10px] font-mono text-slate-400">{r.vehicleRegistrationNumber}</div>
                            </td>
                            <td className="p-3">
                              {r.isExistingMatch ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Same in Database
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                                  <Sparkles className="w-3 h-3 text-sky-600" />
                                  New Registered
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {r.matchedCertificate && onViewCertificate && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onViewCertificate(r.matchedCertificate!);
                                    onClose();
                                  }}
                                  className="text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer"
                                >
                                  View
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Guarantees non-destructive matching &amp; full data preservation</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
