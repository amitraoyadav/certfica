import React, { useState } from 'react';
import {
  X,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Lock,
  ArrowRight,
  FileCheck,
  History,
} from 'lucide-react';
import type { Certificate } from '../types';

interface ReissueCertificateModalProps {
  certificate: Certificate | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCert: Certificate, originalCert: Certificate) => void;
}

export const ReissueCertificateModal: React.FC<ReissueCertificateModalProps> = ({
  certificate,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [ownerName, setOwnerName] = useState(certificate?.ownerName || '');
  const [address, setAddress] = useState(certificate?.address || '');
  const [includeIdProof, setIncludeIdProof] = useState<boolean>(
    Boolean(certificate?.idProofNumber && certificate.idProofNumber !== 'Not Provided')
  );
  const [idProofNumber, setIdProofNumber] = useState(
    certificate?.idProofNumber && certificate.idProofNumber !== 'Not Provided'
      ? certificate.idProofNumber
      : ''
  );
  const [vehicleRegistrationNumber, setVehicleRegistrationNumber] = useState(
    certificate?.vehicleRegistrationNumber || ''
  );
  const [chassisNumber, setChassisNumber] = useState(certificate?.chassisNumber || '');
  const [engineNumber, setEngineNumber] = useState(certificate?.engineNumber || '');
  const [make, setMake] = useState(certificate?.make || '');
  const [model, setModel] = useState(certificate?.model || '');
  const [yearOfManufacture, setYearOfManufacture] = useState(
    certificate?.yearOfManufacture || ''
  );
  const [dateOfHandover, setDateOfHandover] = useState(certificate?.dateOfHandover || '');
  const [dateOfIssue, setDateOfIssue] = useState(certificate?.dateOfIssue || '');
  const [showFullChassisEngine, setShowFullChassisEngine] = useState(
    Boolean(certificate?.showFullChassisEngine)
  );
  const [correctionReason, setCorrectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (certificate) {
      setOwnerName(certificate.ownerName || '');
      setAddress(certificate.address || '');
      setIncludeIdProof(Boolean(certificate.idProofNumber && certificate.idProofNumber !== 'Not Provided'));
      setIdProofNumber(
        certificate.idProofNumber && certificate.idProofNumber !== 'Not Provided'
          ? certificate.idProofNumber
          : ''
      );
      setVehicleRegistrationNumber(certificate.vehicleRegistrationNumber || '');
      setChassisNumber(certificate.chassisNumber || '');
      setEngineNumber(certificate.engineNumber || '');
      setMake(certificate.make || '');
      setModel(certificate.model || '');
      setYearOfManufacture(certificate.yearOfManufacture || '');
      setDateOfHandover(certificate.dateOfHandover || '');
      setDateOfIssue(certificate.dateOfIssue || '');
      setShowFullChassisEngine(Boolean(certificate.showFullChassisEngine));
      setCorrectionReason('');
      setError(null);
    }
  }, [certificate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificate) return;
    if (!correctionReason.trim()) {
      setError('Please provide a mandatory reason for reissuance / correction for the audit ledger.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('ps_admin_token') || 'valid_token';
      const res = await fetch(`/api/certificates/${encodeURIComponent(certificate.id)}/reissue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ownerName: ownerName.trim(),
          address: address.trim(),
          idProofNumber: includeIdProof && idProofNumber.trim() ? idProofNumber.trim() : 'Not Provided',
          vehicleRegistrationNumber: vehicleRegistrationNumber.trim(),
          chassisNumber: chassisNumber.trim(),
          engineNumber: engineNumber.trim(),
          make: make.trim(),
          model: model.trim(),
          yearOfManufacture: yearOfManufacture.trim(),
          dateOfHandover,
          dateOfIssue,
          correctionReason: correctionReason.trim(),
          showFullChassisEngine,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to reissue certificate');
      }

      onSuccess(data.newCertificate, data.originalCertificate);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to process certificate correction');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !certificate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200 my-8">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                <History className="w-5 h-5" />
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-[#0d2847]">
                Create Corrected Certificate (Reissue Workflow)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Correcting issued record{' '}
              <strong className="font-mono text-slate-800 font-bold">
                {certificate.certificateNumber}
              </strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Immutability Architecture Notice */}
        <div className="my-4 bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Permanent Record Preservation Guarantee</span>
          </div>
          <p className="text-amber-800 leading-relaxed">
            In compliance with registry immutability rules, the original certificate{' '}
            <strong className="font-mono text-amber-950 font-bold">{certificate.certificateNumber}</strong> will{' '}
            <strong>never be edited or deleted</strong>. Its original data is preserved permanently and marked as{' '}
            <span className="font-bold text-amber-900">SUPERSEDED</span>. A brand new certificate with the next sequential certificate number will be generated and issued.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mandatory Correction Reason */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-[#0d2847] mb-1">
              Mandatory Audit Reason for Correction / Reissue <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g. Typo in chassis number corrected / Owner surname correction"
              className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none bg-white"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              This reason will be permanently recorded in the immutable audit log and linked to the certificate record.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Owner Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold uppercase focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Vehicle Registration No. (RC) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={vehicleRegistrationNumber}
                onChange={(e) => setVehicleRegistrationNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold uppercase focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Chassis Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={chassisNumber}
                onChange={(e) => setChassisNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Engine Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={engineNumber}
                onChange={(e) => setEngineNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Vehicle Make
              </label>
              <input
                type="text"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Vehicle Model
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Owner Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            {/* Optional ID Proof tick option */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeIdProof}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludeIdProof(checked);
                    if (!checked) setIdProofNumber('');
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-[#0d2847] focus:ring-[#0d2847] cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-700">
                  Include Government ID Proof (Optional)
                </span>
              </label>

              {includeIdProof && (
                <div className="mt-2 pt-2 border-t border-slate-200 animate-in fade-in duration-150">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    ID Proof Number (Aadhaar / Voter / PAN / DL)
                  </label>
                  <input
                    type="text"
                    value={idProofNumber}
                    onChange={(e) => setIdProofNumber(e.target.value)}
                    placeholder="e.g. 1234 5678 9012"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-[#0d2847] outline-none bg-white"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Year of Manufacture
              </label>
              <input
                type="text"
                value={yearOfManufacture}
                onChange={(e) => setYearOfManufacture(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Date of Handover
              </label>
              <input
                type="text"
                value={dateOfHandover}
                onChange={(e) => setDateOfHandover(e.target.value)}
                placeholder="DD-MM-YYYY"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showFullChassisEngine}
                onChange={(e) => setShowFullChassisEngine(e.target.checked)}
                className="rounded border-slate-300 text-[#0d2847] focus:ring-[#0d2847]"
              />
              <span className="text-xs text-slate-700 font-medium">
                Show full chassis and engine numbers (disable public masking on this certificate)
              </span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !correctionReason.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Issuing Corrected Certificate...</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span>Issue Corrected Certificate (Atomic Commit)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
