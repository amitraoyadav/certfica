import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  ShieldCheck,
  AlertTriangle,
  FileCheck2,
  Download,
  Eye,
  KeyRound,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import type { AuditLogEntry, AuditAction } from '../types';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificateNumber?: string;
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({
  isOpen,
  onClose,
  certificateNumber,
}) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('ps_admin_token') || 'valid_token';
      let url = '/api/audit-logs';
      if (certificateNumber) {
        url += `?certificateNumber=${encodeURIComponent(certificateNumber)}`;
      }
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error('Error fetching audit logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, certificateNumber]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== 'ALL' && log.action !== filterAction) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        log.certificateNumber.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q)) ||
        (log.actor && log.actor.toLowerCase().includes(q)) ||
        log.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getActionBadge = (action: AuditAction) => {
    switch (action) {
      case 'CERTIFICATE_ISSUED':
      case 'CERTIFICATE_CREATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
            <FileCheck2 className="w-3 h-3 text-emerald-600" />
            {action}
          </span>
        );
      case 'CERTIFICATE_VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
            <ShieldCheck className="w-3 h-3 text-blue-600" />
            {action}
          </span>
        );
      case 'CERTIFICATE_SUPERSEDED':
      case 'REISSUE_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
            <History className="w-3 h-3 text-amber-600" />
            {action}
          </span>
        );
      case 'CERTIFICATE_DOWNLOADED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800">
            <Download className="w-3 h-3 text-purple-600" />
            {action}
          </span>
        );
      case 'CERTIFICATE_VIEWED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800">
            <Eye className="w-3 h-3 text-slate-600" />
            {action}
          </span>
        );
      case 'INTEGRITY_FAILURE':
      case 'VERIFICATION_FAILURE':
      case 'CERTIFICATE_REVOKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            {action}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
            {action}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200 my-8 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#0d2847] text-white rounded-lg">
                <History className="w-5 h-5" />
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-[#0d2847]">
                Official Immutable Audit Ledger
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {certificateNumber ? (
                <>
                  Viewing tamper-proof lifecycle audit log for certificate{' '}
                  <strong className="font-mono text-slate-800 font-bold">{certificateNumber}</strong>
                </>
              ) : (
                'System-wide append-only audit trail for all certificates, issuances, verifications, and reissues.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-1.5 text-slate-500 hover:text-[#0d2847] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Refresh Audit Logs"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by certificate number, details, or actor..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-700 font-medium focus:ring-2 focus:ring-[#0d2847] outline-none"
            >
              <option value="ALL">All Actions ({logs.length})</option>
              <option value="CERTIFICATE_CREATED">Created</option>
              <option value="CERTIFICATE_ISSUED">Issued</option>
              <option value="CERTIFICATE_VERIFIED">Verified</option>
              <option value="CERTIFICATE_SUPERSEDED">Superseded</option>
              <option value="REISSUE_REQUESTED">Reissued</option>
              <option value="CERTIFICATE_DOWNLOADED">Downloaded</option>
              <option value="CERTIFICATE_REVOKED">Revoked</option>
              <option value="VERIFICATION_FAILURE">Verification Failure</option>
              <option value="INTEGRITY_FAILURE">Integrity Failure</option>
            </select>
          </div>
        </div>

        {/* Log Entries List */}
        <div className="flex-1 overflow-y-auto py-2 divide-y divide-slate-100 pr-1">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <div className="w-6 h-6 border-2 border-[#0d2847] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Loading tamper-proof audit records...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No audit log entries found matching criteria.
            </div>
          ) : (
            filteredLogs.map((entry) => (
              <div key={entry.id} className="py-3 px-2 hover:bg-slate-50 rounded-lg transition-colors text-xs space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getActionBadge(entry.action)}
                    <span className="font-mono font-bold text-slate-800">
                      {entry.certificateNumber}
                    </span>
                    {entry.actor && (
                      <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        actor: {entry.actor}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>

                <p className="text-slate-700 text-xs leading-relaxed font-medium">
                  {entry.details}
                </p>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono">
                  {entry.ip && <span>IP: {entry.ip}</span>}
                  {entry.dataHash && (
                    <span className="flex items-center gap-1 text-slate-500">
                      <KeyRound className="w-3 h-3 text-emerald-600" />
                      Hash: {entry.dataHash.substring(0, 16)}...
                    </span>
                  )}
                  {entry.oldStatus && entry.newStatus && (
                    <span className="text-slate-500">
                      Status: {entry.oldStatus} → {entry.newStatus}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            Total Entries: <strong>{filteredLogs.length}</strong> (Append-Only Ledger)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
