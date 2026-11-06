import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Lock,
  KeyRound,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Trash2,
  FileX,
  History,
} from 'lucide-react';
import type { Certificate } from '../types';

interface ProtectedDeleteModalProps {
  certificate: Certificate | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedCert?: Certificate) => void;
}

export const ProtectedDeleteModal: React.FC<ProtectedDeleteModalProps> = ({
  certificate,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [reason, setReason] = useState('');
  const [actionType, setActionType] = useState<'CANCEL' | 'DELETE'>('CANCEL');
  const [hardDelete, setHardDelete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const targetConfirm = actionType === 'CANCEL' ? 'CANCEL' : 'DELETE';
    if (confirmText.trim().toUpperCase() !== targetConfirm && confirmText.trim().toUpperCase() !== 'DELETE') {
      setErrorMessage(`Please type "${targetConfirm}" exactly as shown to confirm.`);
      return;
    }

    if (!adminPassword.trim()) {
      setErrorMessage('Please enter the server-side administrator authorization password.');
      return;
    }

    if (!reason.trim()) {
      setErrorMessage('Please provide a mandatory reason for cancellation/deletion for the audit log.');
      return;
    }

    setIsSubmitting(true);

    try {
      const token =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        'ps_admin_session_token_secure_2026';

      const mainAdminToken = sessionStorage.getItem('ps_main_admin_token') || '';

      const res = await fetch(`/api/certificates/${encodeURIComponent(certificate.id)}/protected-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-admin-password': adminPassword.trim(),
          'x-protected-password': adminPassword.trim(),
          ...(mainAdminToken ? { 'x-main-admin-token': mainAdminToken } : {}),
        },
        body: JSON.stringify({
          action: actionType,
          confirmationText: confirmText.trim().toUpperCase(),
          adminPassword: adminPassword.trim(),
          reason: reason.trim(),
          hardDelete: actionType === 'DELETE',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || 'Protected operation rejected by server.');
      }

      onSuccess(data.certificate);
      onClose();
    } catch (err: any) {
      console.error('Protected action failed:', err);
      setErrorMessage(err.message || 'Failed to execute protected operation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !certificate) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border-2 border-rose-300 animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Header */}
        <div className="flex items-start justify-between pb-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                🔒 Protected Actions: Cancel / Delete Certificate
              </h3>
              <p className="text-xs text-rose-700 font-semibold mt-0.5">
                Critical Operation &bull; Server-Side Authorization Required
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Certificate Summary */}
        <div className="my-3.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
          <div className="flex justify-between items-center font-mono">
            <span className="text-slate-500 font-semibold">Certificate Number:</span>
            <strong className="text-slate-900 text-sm font-bold">{certificate.certificateNumber}</strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-semibold">Owner Name:</span>
            <span className="font-semibold text-slate-800 uppercase">{certificate.ownerName}</span>
          </div>
          <div className="flex justify-between items-center font-mono">
            <span className="text-slate-500 font-semibold">Vehicle RC:</span>
            <span className="text-slate-800 font-medium">{certificate.vehicleRegistrationNumber || 'Not Provided'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-semibold">Current Status:</span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
              ● {certificate.status}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-3.5 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-950 text-xs flex items-start gap-2 animate-shake">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-semibold">{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Action Mode Choice */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Select Protected Operation:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionType('CANCEL');
                  setHardDelete(false);
                }}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  actionType === 'CANCEL'
                    ? 'border-amber-400 bg-amber-50 text-amber-950 shadow-2xs font-semibold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold mb-0.5">
                  <FileX className="w-3.5 h-3.5 text-amber-600" />
                  <span>Soft Cancel (Recommended)</span>
                </div>
                <p className="text-[10.5px] text-slate-500 font-normal leading-tight">
                  Marks record CANCELLED. Preserves history for legal audit.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActionType('DELETE')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  actionType === 'DELETE'
                    ? 'border-rose-400 bg-rose-50 text-rose-950 shadow-2xs font-semibold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold mb-0.5">
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Void / Delete Record</span>
                </div>
                <p className="text-[10.5px] text-slate-500 font-normal leading-tight">
                  Permanent cancellation. Serial number remains permanently reserved.
                </p>
              </button>
            </div>
          </div>

          {/* Zero Data Loss Banner */}
          <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-lg flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-emerald-950 text-[11px] block">
                🔒 Permanent Record Preservation Guarantee
              </span>
              <span className="text-slate-600 text-[10.5px] leading-tight block">
                In accordance with statutory compliance and anti-disappearance safeguards, certificate records are NEVER deleted or purged from the database. The record will remain permanently preserved in the registry with {actionType === 'DELETE' ? 'VOID' : 'CANCELLED'} status.
              </span>
            </div>
          </div>

          {/* Mandatory Reason */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Mandatory Audit Reason <span className="text-rose-500">*</span>:
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Scrapping cancelled by RTO / Clerical duplicate entry"
              required
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0d2847] bg-white font-medium"
            />
          </div>

          {/* Step 1: Confirmation Word */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3">
            <label className="block font-bold text-amber-950 mb-1">
              Step 1: Type <span className="font-mono text-rose-700 font-black">{actionType === 'CANCEL' ? 'CANCEL' : 'DELETE'}</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Type ${actionType === 'CANCEL' ? 'CANCEL' : 'DELETE'} here`}
              required
              className="w-full px-3 py-2 text-xs font-mono uppercase font-bold border border-amber-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          {/* Step 2: Admin Password */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <label className="block font-bold text-slate-900 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-600" />
                Step 2: Server Deletion Password:
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Server Validated</span>
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Enter authorization password"
              required
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0d2847] bg-white font-medium"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Authorization password is verified directly on the secure backend.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !confirmText.trim() || !adminPassword.trim()}
              className="px-5 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer min-h-[38px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Validating Authorization...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Execute {actionType === 'CANCEL' ? 'Cancellation' : 'Deletion'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
