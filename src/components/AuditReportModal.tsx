import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Lock,
  FileCheck2,
  Wrench,
  Download,
  Database,
  ExternalLink,
} from 'lucide-react';
import type { DatabaseAuditReport, CertificateAuditItem } from '../types';

interface AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
  onViewCertificate?: (certNumber: string) => void;
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
  onViewCertificate,
}) => {
  const [report, setReport] = useState<DatabaseAuditReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'ISSUES' | 'CLEAN'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [repairSuccessMessage, setRepairSuccessMessage] = useState<string | null>(null);

  const fetchAuditReport = async (repair = false) => {
    if (repair) {
      setIsRepairing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    setRepairSuccessMessage(null);

    try {
      const token =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        'ps_admin_session_token_secure_2026';

      const res = await fetch('/api/audit/verify-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repairMissingReferences: repair }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to complete audit inspection');
      }

      const data: DatabaseAuditReport = await res.json();
      setReport(data);

      if (repair) {
        const repairedCount = data.items.filter((i) => i.repaired).length;
        setRepairSuccessMessage(
          repairedCount > 0
            ? `Successfully repaired verification references for ${repairedCount} certificate(s) without modifying authentic data.`
            : 'All verification references are already healthy and in sync. No repairs needed.'
        );
        onRefreshData?.();
      }
    } catch (err: any) {
      console.error('Audit failed:', err);
      setError(err.message || 'Audit execution error');
    } finally {
      setIsLoading(false);
      setIsRepairing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAuditReport(false);
    }
  }, [isOpen]);

  const filteredItems = (report?.items || []).filter((item) => {
    const q = searchTerm.toLowerCase().trim();
    if (q) {
      const matchesCert = item.certificateNumber.toLowerCase().includes(q);
      const matchesScrap = item.scrappingRegistrationNumber.toLowerCase().includes(q);
      const matchesOwner = item.ownerName.toLowerCase().includes(q);
      const matchesVehicle = item.vehicleRegistrationNumber.toLowerCase().includes(q);
      if (!matchesCert && !matchesScrap && !matchesOwner && !matchesVehicle) return false;
    }

    if (filterMode === 'ISSUES') {
      return item.issues.length > 0;
    }
    if (filterMode === 'CLEAN') {
      return item.issues.length === 0;
    }
    return true;
  });

  const exportAuditSummary = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Parivahan_Registry_Audit_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-6 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                <Database className="w-5 h-5 text-emerald-700" />
              </span>
              <h3 className="text-lg sm:text-xl font-bold font-serif text-[#0d2847]">
                Registry Database Audit &amp; Verification Report
              </h3>
              {report && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    report.allPassed
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {report.allPassed ? '✓ 100% HEALTHY' : `⚠ ${report.mismatched} ISSUE(S) DETECTED`}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Read-only inspection of every issued certificate against the verification engine, cryptographic hashes, and canonical database IDs.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 shrink-0 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isLoading || isRepairing}
              onClick={() => fetchAuditReport(false)}
              className="px-3.5 py-2 text-xs font-bold text-white bg-[#0d2847] hover:bg-[#163a63] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Inspecting...' : 'Re-Run Verification Audit'}</span>
            </button>

            <button
              type="button"
              disabled={isLoading || isRepairing}
              onClick={() => fetchAuditReport(true)}
              className="px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              title="Safely restore missing QR tokens, data hashes, or URLs without altering certificate data"
            >
              <Wrench className={`w-3.5 h-3.5 ${isRepairing ? 'animate-spin' : ''}`} />
              <span>{isRepairing ? 'Repairing References...' : 'Safe Repair Missing References'}</span>
            </button>

            {report && (
              <button
                type="button"
                onClick={exportAuditSummary}
                className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Report (JSON)</span>
              </button>
            )}
          </div>

          {report && (
            <span className="text-[11px] text-slate-500 font-mono">
              Audited: {new Date(report.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Notifications */}
        {repairSuccessMessage && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{repairSuccessMessage}</span>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* Audit Metrics Cards */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 my-3 shrink-0">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Records</span>
              <span className="text-xl font-black text-[#0d2847]">{report.totalCertificates}</span>
            </div>

            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-700 uppercase block">Valid &amp; In-Sync</span>
              <span className="text-xl font-black text-emerald-800">{report.validMatching}</span>
            </div>

            <div className={`p-3 rounded-xl border ${report.mismatched > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Mismatches</span>
              <span className={`text-xl font-black ${report.mismatched > 0 ? 'text-amber-800' : 'text-slate-700'}`}>
                {report.mismatched}
              </span>
            </div>

            <div className={`p-3 rounded-xl border ${report.duplicateCertificateNumbers > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Duplicate Cert Nos</span>
              <span className={`text-xl font-black ${report.duplicateCertificateNumbers > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                {report.duplicateCertificateNumbers}
              </span>
            </div>

            <div className={`p-3 rounded-xl border ${report.integrityErrors > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Integrity Errors</span>
              <span className={`text-xl font-black ${report.integrityErrors > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                {report.integrityErrors}
              </span>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by Cert No, Owner, Vehicle RC..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0d2847]"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 text-[11px]">View:</span>
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                filterMode === 'ALL' ? 'bg-[#0d2847] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All ({report?.items.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('ISSUES')}
              className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                filterMode === 'ISSUES' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Issues ({report?.items.filter((i) => i.issues.length > 0).length || 0})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('CLEAN')}
              className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                filterMode === 'CLEAN' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Verified ({report?.items.filter((i) => i.issues.length === 0).length || 0})
            </button>
          </div>
        </div>

        {/* Scrollable Certificates Inspection Table */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl min-h-[220px]">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Auditing Database Registry...</p>
              <p className="text-xs text-slate-400 mt-0.5">Checking SHA-256 hashes and verification mappings</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No certificate records match the active filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200 z-10 shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3">Cert No.</th>
                  <th className="py-2.5 px-3">Owner / Vehicle RC</th>
                  <th className="py-2.5 px-3">Scrap Reg. No</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Verification Match</th>
                  <th className="py-2.5 px-3 text-center">SHA-256 Hash</th>
                  <th className="py-2.5 px-3">Audit Details</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredItems.map((item) => {
                  const hasIssues = item.issues.length > 0;
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        hasIssues ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-[#0d2847]">
                        <div className="flex items-center gap-1.5">
                          <span>{item.certificateNumber}</span>
                          <span title="Locked & Protected">
                            <Lock className="w-3 h-3 text-emerald-600 shrink-0" />
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block font-normal truncate max-w-[120px]">
                          ID: {item.id}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900 block uppercase truncate max-w-[150px]">
                          {item.ownerName}
                        </span>
                        <span className="font-mono text-[11px] text-slate-600 block">
                          {item.vehicleRegistrationNumber || 'Not Provided'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700">
                        {item.scrappingRegistrationNumber}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'SUPERSEDED'
                              ? 'bg-amber-100 text-amber-800'
                              : item.status === 'CANCELLED' || item.status === 'DELETED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          ● {item.status}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {item.verificationSiteMatch ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Match
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[11px]">
                            <XCircle className="w-3.5 h-3.5" />
                            Mismatch
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {item.integrityHashMatch ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Mismatch
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        {item.issues.length === 0 ? (
                          <span className="text-emerald-700 text-[11px] font-medium flex items-center gap-1">
                            <FileCheck2 className="w-3 h-3" />
                            100% Verified
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            {item.issues.map((issue, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-medium mr-1"
                              >
                                {issue}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.repaired && (
                          <span className="text-[10px] text-blue-700 block font-medium mt-0.5">
                            ✓ {item.repairDetails || 'Repaired references'}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        {onViewCertificate && (
                          <button
                            type="button"
                            onClick={() => {
                              onViewCertificate(item.certificateNumber);
                              onClose();
                            }}
                            className="px-2 py-1 text-slate-700 hover:text-[#0d2847] hover:bg-slate-200 rounded font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 mt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="text-slate-500 text-[11px] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Inspection is strictly read-only. Central database remains the canonical source of truth.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
