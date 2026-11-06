import React, { useState, useEffect } from 'react';
import {
  Edit3,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  User,
  CreditCard,
  MapPin,
  Car,
  Hash,
  ShieldCheck,
  ShieldAlert,
  Globe,
  Lock,
  KeyRound,
  Cloud,
  FileText,
} from 'lucide-react';
import type { Certificate, CertificateStatus } from '../types';
import { saveToLocalVault } from '../utils/storageVault';

interface EditCertificateModalProps {
  certificate: Certificate | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: (updated: Certificate) => void;
}

export const EditCertificateModal: React.FC<EditCertificateModalProps> = ({
  certificate,
  isOpen,
  onClose,
  onSaveSuccess,
}) => {
  const [formData, setFormData] = useState<Certificate | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (certificate) {
      setFormData({
        ...certificate,
        idProofNumber: certificate.idProofNumber || '',
        address: certificate.address || '',
        chassisNumber: certificate.chassisNumber || '',
        engineNumber: certificate.engineNumber || '',
        make: certificate.make || '',
        model: certificate.model || '',
        yearOfManufacture: certificate.yearOfManufacture || '',
        location: certificate.location || 'Delhi NCR',
        statusReason: certificate.statusReason || '',
        driveFileUrl: certificate.driveFileUrl || '',
        driveFileId: certificate.driveFileId || '',
        driveBackupStatus: certificate.driveBackupStatus || 'NOT_CONNECTED',
      });
      setAdminPassword('');
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [certificate]);

  if (!isOpen || !formData || !certificate) return null;

  const handleChange = (field: keyof Certificate, value: any) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ownerName.trim()) {
      setErrorMessage('Registered Owner Name is required.');
      return;
    }
    if (!formData.certificateNumber.trim()) {
      setErrorMessage('Certificate Number is required.');
      return;
    }
    const mainAdminToken = typeof window !== 'undefined' ? sessionStorage.getItem('ps_main_admin_token') : null;
    if (!mainAdminToken && !adminPassword.trim()) {
      setErrorMessage('Authorization password is required for certificate modification.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const storedToken =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        'ps_admin_session_token_secure_2026';

      const payload = {
        ...formData,
        certificateNumber: formData.certificateNumber.trim().toUpperCase(),
        scrappingRegistrationNumber: formData.scrappingRegistrationNumber.trim().toUpperCase(),
        ownerName: formData.ownerName.trim().toUpperCase(),
        idProofNumber: formData.idProofNumber?.trim() || 'Not Provided',
        vehicleRegistrationNumber: formData.vehicleRegistrationNumber.trim().toUpperCase(),
        chassisNumber: formData.chassisNumber.trim().toUpperCase(),
        engineNumber: formData.engineNumber.trim().toUpperCase(),
        address: formData.address.trim(),
        make: formData.make.trim(),
        model: formData.model.trim(),
        yearOfManufacture: formData.yearOfManufacture.trim(),
        dateOfHandover: formData.dateOfHandover.trim(),
        dateOfIssue: formData.dateOfIssue.trim(),
        location: formData.location.trim(),
        status: formData.status,
        statusReason: formData.statusReason?.trim() || undefined,
        driveFileId: formData.driveFileId?.trim() || undefined,
        driveFileUrl: formData.driveFileUrl?.trim() || undefined,
        driveBackupStatus: formData.driveBackupStatus,
        adminPassword: adminPassword.trim(),
      };

      const res = await fetch(`/api/certificates/${encodeURIComponent(certificate.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedToken}`,
          'x-admin-token': storedToken,
          'x-admin-password': adminPassword.trim(),
          'x-protected-password': adminPassword.trim(),
          ...(mainAdminToken ? { 'x-main-admin-token': mainAdminToken } : {}),
        },
        body: JSON.stringify(payload),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resData.message || 'Server rejected certificate modification.');
      }

      const updatedCert: Certificate = resData;

      // Update local storage vault safely
      try {
        saveToLocalVault(updatedCert);
      } catch {}

      setSuccessMessage('Certificate successfully updated and verified in database!');
      onSaveSuccess(updatedCert);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error updating certificate:', err);
      setErrorMessage(err.message || 'Failed to save edits.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-[#0d2847] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <Edit3 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Edit Certificate &amp; Sync Online
              </h2>
              <p className="text-xs text-slate-300">
                Editing Record: <span className="font-mono text-emerald-300 font-bold">{certificate.certificateNumber}</span> (ID: <span className="font-mono text-slate-300 text-[11px]">{certificate.id}</span>)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4 text-slate-800">
          {/* Status and online alert */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <Globe className="w-4 h-4 text-sky-600 shrink-0" />
              <span>
                Live Verification URL: <span className="font-mono text-slate-800 font-semibold">{certificate.certificateNumber}</span>
              </span>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full font-bold ${
                formData.status === 'VALID'
                  ? 'bg-emerald-100 text-emerald-800'
                  : formData.status === 'SUPERSEDED'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {formData.status}
            </span>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Section 1: Certificate Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Certificate Number *
              </label>
              <div className="relative">
                <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={formData.certificateNumber}
                  onChange={(e) => handleChange('certificateNumber', e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Scrapping Registration Number *
              </label>
              <div className="relative">
                <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={formData.scrappingRegistrationNumber}
                  onChange={(e) => handleChange('scrappingRegistrationNumber', e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Owner Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Registered Owner Name *
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={formData.ownerName}
                  onChange={(e) => handleChange('ownerName', e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs uppercase font-medium border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ID Proof Number
              </label>
              <div className="relative">
                <CreditCard className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={formData.idProofNumber}
                  onChange={(e) => handleChange('idProofNumber', e.target.value)}
                  placeholder="Aadhaar, PAN, Voter ID, or Not Provided"
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Owner Address
            </label>
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="e.g. Dwarka, New Delhi"
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>
          </div>

          {/* Section 3: Vehicle Information */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vehicle No. (RC) *
              </label>
              <div className="relative">
                <Car className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={formData.vehicleRegistrationNumber}
                  onChange={(e) => handleChange('vehicleRegistrationNumber', e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs font-mono uppercase font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chassis Number *
              </label>
              <input
                type="text"
                required
                value={formData.chassisNumber}
                onChange={(e) => handleChange('chassisNumber', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Engine Number *
              </label>
              <input
                type="text"
                required
                value={formData.engineNumber}
                onChange={(e) => handleChange('engineNumber', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Make (Brand)
              </label>
              <input
                type="text"
                value={formData.make}
                onChange={(e) => handleChange('make', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Model
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => handleChange('model', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Year of Manufacture
              </label>
              <input
                type="text"
                value={formData.yearOfManufacture}
                onChange={(e) => handleChange('yearOfManufacture', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>
          </div>

          {/* Section 4: Dates & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date of Handover
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={formData.dateOfHandover}
                  onChange={(e) => handleChange('dateOfHandover', e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date of Issue
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={formData.dateOfIssue}
                  onChange={(e) => handleChange('dateOfIssue', e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value as CertificateStatus)}
                className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              >
                <option value="VALID">VALID (Active &amp; Online Verified)</option>
                <option value="REVOKED">REVOKED (Invalidated)</option>
                <option value="CANCELLED">CANCELLED (Cancelled record)</option>
                <option value="SUPERSEDED">SUPERSEDED (Replaced by newer version)</option>
              </select>
            </div>
          </div>

          {formData.status !== 'VALID' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Status Change
              </label>
              <input
                type="text"
                value={formData.statusReason || ''}
                onChange={(e) => handleChange('statusReason', e.target.value)}
                placeholder="e.g. Corrected typo in owner name or vehicle cancelled by RTO"
                className="w-full px-3 py-2 text-xs border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>
          )}

          {/* Section 5: Google Drive Link Details */}
          <div className="p-3 bg-sky-50/60 border border-sky-200 rounded-xl space-y-2.5">
            <div className="flex items-center gap-2 text-sky-900 font-bold text-xs">
              <Cloud className="w-4 h-4 text-sky-700" />
              <span>Google Drive Link &amp; Status</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Google Drive URL
                </label>
                <input
                  type="text"
                  value={formData.driveFileUrl || ''}
                  onChange={(e) => handleChange('driveFileUrl', e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full px-3 py-1.5 text-xs font-mono border border-sky-200 bg-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Drive Backup Status
                </label>
                <select
                  value={formData.driveBackupStatus || 'NOT_CONNECTED'}
                  onChange={(e) => handleChange('driveBackupStatus', e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-semibold border border-sky-200 bg-white rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                >
                  <option value="BACKED_UP">BACKED_UP (Uploaded to Drive)</option>
                  <option value="PENDING">PENDING (Sync in progress)</option>
                  <option value="FAILED">FAILED</option>
                  <option value="NOT_CONNECTED">NOT_CONNECTED</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 6: Master Authorization Password Confirmation */}
          <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
              <KeyRound className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Authorization Password Required</span>
            </div>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              Certificate modification requires master administrative authorization password verification. Unauthenticated or incorrect password requests will be safely rejected on the server.
            </p>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-amber-700 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter Authorization Password"
                className="w-full pl-8 pr-3 py-2 text-xs border border-amber-300 bg-white rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none font-mono"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200">
            <div className="text-slate-500 text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Updates apply strictly to certificate ID {certificate.id}.</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying &amp; Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
