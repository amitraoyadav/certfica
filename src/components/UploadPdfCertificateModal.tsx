import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  RefreshCw,
  ExternalLink,
  Eye,
  Calendar,
  User,
  CreditCard,
  MapPin,
  Car,
  Hash,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { Certificate } from '../types';
import { saveToLocalVault } from '../utils/storageVault';
import { autoSyncCertificate } from '../utils/autoSync';
import { maskChassisNumber, maskEngineNumber } from '../utils/maskUtils';

interface UploadPdfCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCertificateSynced: (certificate: Certificate) => void;
  onViewCertificate?: (certificate: Certificate) => void;
}

export const UploadPdfCertificateModal: React.FC<UploadPdfCertificateModalProps> = ({
  isOpen,
  onClose,
  onCertificateSynced,
  onViewCertificate,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawTextSample, setRawTextSample] = useState('');
  const [showRawText, setShowRawText] = useState(false);

  // Extracted and editable fields
  const [certificateNumber, setCertificateNumber] = useState('');
  const [scrappingRegistrationNumber, setScrappingRegistrationNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [address, setAddress] = useState('');
  const [vehicleRegistrationNumber, setVehicleRegistrationNumber] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [engineNumber, setEngineNumber] = useState('');
  const [showFullChassisEngine, setShowFullChassisEngine] = useState(false);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [yearOfManufacture, setYearOfManufacture] = useState('');
  const [dateOfHandover, setDateOfHandover] = useState('');
  const [dateOfIssue, setDateOfIssue] = useState('');
  const [location, setLocation] = useState('Delhi NCR');

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncedCertificate, setSyncedCertificate] = useState<Certificate | null>(null);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setFile(null);
    setFileName('');
    setFileSize('');
    setIsParsing(false);
    setParseError(null);
    setRawTextSample('');
    setShowRawText(false);
    setCertificateNumber('');
    setScrappingRegistrationNumber('');
    setOwnerName('');
    setIdProofNumber('');
    setAddress('');
    setVehicleRegistrationNumber('');
    setChassisNumber('');
    setEngineNumber('');
    setShowFullChassisEngine(false);
    setMake('');
    setModel('');
    setYearOfManufacture('');
    setDateOfHandover('');
    setDateOfIssue('');
    setLocation('Delhi NCR');
    setIsSyncing(false);
    setSyncedCertificate(null);
    setSyncSuccessMessage(null);
  };

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setFileSize((selectedFile.size / 1024).toFixed(1) + ' KB');
    setParseError(null);
    setIsParsing(true);
    setSyncedCertificate(null);

    try {
      // Read file as base64 data URL
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsDataURL(selectedFile);
      const pdfBase64 = await base64Promise;

      // Call parse-pdf API
      const res = await fetch('/api/certificates/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64, fileName: selectedFile.name }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Server failed to parse PDF.');
      }

      const json = await res.json();
      const data = json.data || {};

      setRawTextSample(json.rawTextSample || '');

      // Autofill fields
      if (data.certificateNumber) setCertificateNumber(data.certificateNumber);
      if (data.scrappingRegistrationNumber) setScrappingRegistrationNumber(data.scrappingRegistrationNumber);
      if (data.ownerName) setOwnerName(data.ownerName);
      if (data.idProofNumber) setIdProofNumber(data.idProofNumber);
      if (data.address) setAddress(data.address);
      if (data.vehicleRegistrationNumber) setVehicleRegistrationNumber(data.vehicleRegistrationNumber);
      if (data.chassisNumber) setChassisNumber(data.chassisNumber);
      if (data.engineNumber) setEngineNumber(data.engineNumber);
      if (data.make) setMake(data.make);
      if (data.model) setModel(data.model);
      if (data.yearOfManufacture) setYearOfManufacture(data.yearOfManufacture);
      if (data.dateOfHandover) setDateOfHandover(data.dateOfHandover);
      if (data.dateOfIssue) setDateOfIssue(data.dateOfIssue);
      if (data.location) setLocation(data.location);

    } catch (err: any) {
      console.error('PDF parsing error:', err);
      setParseError(err.message || 'Failed to extract data from PDF. You can still enter details manually below.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSyncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim()) {
      setParseError('Registered Owner Name is required to sync certificate.');
      return;
    }

    setIsSyncing(true);
    try {
      const storedToken =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        'ps_admin_session_token_secure_2026';

      const payload = {
        certificateNumber: certificateNumber.trim() || undefined,
        scrappingRegistrationNumber: scrappingRegistrationNumber.trim() || undefined,
        ownerName: ownerName.trim().toUpperCase(),
        idProofNumber: idProofNumber.trim() || 'Not Provided',
        address: address.trim() || 'Not Provided',
        vehicleRegistrationNumber: vehicleRegistrationNumber.trim().toUpperCase() || 'Not Provided',
        chassisNumber: chassisNumber.trim().toUpperCase() || 'Not Provided',
        engineNumber: engineNumber.trim().toUpperCase() || 'Not Provided',
        showFullChassisEngine: Boolean(showFullChassisEngine),
        make: make.trim() || 'Two Wheeler',
        model: model.trim() || 'Standard',
        yearOfManufacture: yearOfManufacture.trim() || new Date().getFullYear().toString(),
        dateOfHandover: dateOfHandover.trim() || new Date().toISOString().split('T')[0],
        dateOfIssue: dateOfIssue.trim() || new Date().toISOString().split('T')[0],
        location: location.trim() || 'Delhi NCR',
        status: 'VALID' as const,
      };

      const res = await fetch('/api/certificates/sync-uploaded-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedToken}`,
          'x-admin-token': storedToken,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to sync certificate with site.');
      }

      const resJson = await res.json();
      const savedCert: Certificate = resJson.certificate;

      // Persist to local backup vault and auto-sync to site server & frontend
      saveToLocalVault(savedCert);
      await autoSyncCertificate(savedCert);

      setSyncedCertificate(savedCert);
      setSyncSuccessMessage(
        resJson.message ||
          `Certificate ${savedCert.certificateNumber} is now permanently recorded and verified online!`
      );

      // Notify parent to refresh state
      onCertificateSynced(savedCert);
    } catch (err: any) {
      console.error('Error syncing certificate:', err);
      setParseError('Sync failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSyncing(false);
    }
  };

  const detectedFieldsCount = [
    certificateNumber,
    scrappingRegistrationNumber,
    ownerName,
    idProofNumber,
    address,
    vehicleRegistrationNumber,
    chassisNumber,
    engineNumber,
    make,
    model,
    yearOfManufacture,
    dateOfHandover,
    dateOfIssue,
  ].filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-[#0d2847] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <FileText className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Upload Certificate PDF &amp; Sync Online
              </h2>
              <p className="text-xs text-slate-300">
                Auto-fills all details and makes legacy/unverified certificates verified online
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

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 text-slate-800">
          {/* SUCCESS SCREEN */}
          {syncedCertificate ? (
            <div className="text-center py-6 px-4 space-y-5">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  ONLINE VERIFIED &amp; SYNCED
                </span>
                <h3 className="text-xl font-bold text-[#0d2847]">
                  Certificate Synced Successfully!
                </h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                  {syncSuccessMessage ||
                    `Certificate ${syncedCertificate.certificateNumber} has been added to the system and is now accessible for live online verification.`}
                </p>
              </div>

              {/* Certificate Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left max-w-md mx-auto space-y-2.5 text-xs">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-semibold">Certificate Number:</span>
                  <span className="font-mono font-bold text-[#0d2847]">{syncedCertificate.certificateNumber}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-semibold">Registered Owner:</span>
                  <span className="font-bold text-slate-800">{syncedCertificate.ownerName}</span>
                </div>
                {syncedCertificate.idProofNumber && (
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500 font-semibold">ID Proof Number:</span>
                    <span className="font-mono text-slate-700">{syncedCertificate.idProofNumber}</span>
                  </div>
                )}
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-semibold">Vehicle RC Number:</span>
                  <span className="font-mono font-bold text-slate-700">{syncedCertificate.vehicleRegistrationNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Online Status:</span>
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    ● VALID (Verified)
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {onViewCertificate && (
                  <button
                    type="button"
                    onClick={() => {
                      onViewCertificate(syncedCertificate);
                      onClose();
                    }}
                    className="px-4 py-2.5 bg-[#0d2847] hover:bg-[#163a63] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Eye className="w-4 h-4 text-emerald-400" />
                    <span>View / Print Certificate</span>
                  </button>
                )}

                <a
                  href={`/verify?certificateNumber=${encodeURIComponent(syncedCertificate.certificateNumber)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Check Public Verification Page</span>
                </a>

                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload Another PDF</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* UPLOAD & AUTOFILLED FORM FLOW */
            <>
              {/* Dropzone Area */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  file
                    ? 'border-emerald-400 bg-emerald-50/40'
                    : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    {isParsing ? (
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                    ) : (
                      <Upload className="w-6 h-6" />
                    )}
                  </div>

                  {file ? (
                    <div>
                      <p className="text-sm font-bold text-slate-800">{fileName}</p>
                      <p className="text-xs text-slate-500">{fileSize}</p>
                      <p className="text-xs text-emerald-700 font-semibold mt-1">
                        Click or drag to choose a different PDF
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        Click or drag PDF of certificate here
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Supports Parivahan Scrappers certificates, VAHAN certificates &amp; scanned PDF documents
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Parsing State */}
              {isParsing && (
                <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl flex items-center gap-3 text-sky-900 text-xs animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-sky-600 shrink-0" />
                  <div>
                    <p className="font-bold">Analyzing and parsing PDF contents...</p>
                    <p className="text-sky-700 text-[11px]">
                      Extracting Certificate No, Owner Name, ID Proof Number, RC details, and dates.
                    </p>
                  </div>
                </div>
              )}

              {/* Parse Error Notice */}
              {parseError && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Note: </span>
                    {parseError}
                  </div>
                </div>
              )}

              {/* Extraction Summary Banner */}
              {detectedFieldsCount > 0 && !isParsing && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-bold">
                      {detectedFieldsCount} fields automatically extracted &amp; pre-filled!
                    </span>
                  </div>
                  {rawTextSample && (
                    <button
                      type="button"
                      onClick={() => setShowRawText(!showRawText)}
                      className="text-emerald-700 underline font-semibold text-[11px] cursor-pointer hover:text-emerald-900"
                    >
                      {showRawText ? 'Hide Raw Text' : 'View Extracted Text'}
                    </button>
                  )}
                </div>
              )}

              {/* Raw Text Preview if opened */}
              {showRawText && rawTextSample && (
                <div className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {rawTextSample}
                </div>
              )}

              {/* Editable Fields Form */}
              <form onSubmit={handleSyncSubmit} className="space-y-4 pt-1">
                {/* Section A: Certificate Numbers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Certificate Number
                    </label>
                    <div className="relative">
                      <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={certificateNumber}
                        onChange={(e) => setCertificateNumber(e.target.value)}
                        placeholder="e.g. PS/26/R1000 (auto-assigned if empty)"
                        className="w-full pl-8 pr-3 py-2 text-xs font-mono font-medium border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none uppercase"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Scrapping Registration No.
                    </label>
                    <div className="relative">
                      <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={scrappingRegistrationNumber}
                        onChange={(e) => setScrappingRegistrationNumber(e.target.value)}
                        placeholder="e.g. REG-C272829"
                        className="w-full pl-8 pr-3 py-2 text-xs font-mono font-medium border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Section B: Owner Details */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Owner Details</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Registered Owner Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        placeholder="e.g. VIKRAM SHARMA"
                        className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none uppercase"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        ID Proof Number (Aadhaar / Voter / PAN / DL)
                      </label>
                      <div className="relative">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={idProofNumber}
                          onChange={(e) => setIdProofNumber(e.target.value)}
                          placeholder="e.g. 9876 1234 5678"
                          className="w-full pl-8 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Owner Address
                      </label>
                      <div className="relative">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="e.g. Sector 21, Rohini, New Delhi"
                          className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section C: Vehicle Details */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Car className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Vehicle Details</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Vehicle No. (RC)
                      </label>
                      <input
                        type="text"
                        value={vehicleRegistrationNumber}
                        onChange={(e) => setVehicleRegistrationNumber(e.target.value)}
                        placeholder="e.g. DL 01 AB 1234"
                        className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none uppercase"
                      />
                    </div>

                    {/* ONE TICK OPTION FOR CHASSIS AND ENGINE NUMBER */}
                    <div className="col-span-1 md:col-span-2 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-slate-50 border border-blue-200 hover:border-blue-300 rounded-lg p-3 shadow-sm transition-all">
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showFullChassisEngine}
                          onChange={(e) => setShowFullChassisEngine(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0d2847] focus:ring-[#0d2847] cursor-pointer shrink-0 accent-[#0d2847]"
                        />
                        <div className="flex-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">
                              If you want to show this on certificate tick open
                            </span>
                            {showFullChassisEngine ? (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded-full">
                                ✓ Ticked (Full Numbers Visible)
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">
                                Unticked (Hidden/Masked)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {showFullChassisEngine ? (
                              <span className="text-blue-900 font-semibold">
                                Certificate will show the FULL Chassis Number and FULL Engine Number.
                              </span>
                            ) : (
                              <span className="text-slate-500">
                                Certificate will show hidden numbers (Chassis: XXXX..., Engine: XXXXX...).
                              </span>
                            )}
                          </p>
                        </div>
                      </label>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-slate-600">
                          Chassis Number
                        </label>
                        {showFullChassisEngine ? (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            Showing Full
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                            Cert: XXXX...
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={chassisNumber}
                        onChange={(e) => setChassisNumber(e.target.value)}
                        placeholder="e.g. 01373"
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none uppercase"
                      />
                      {chassisNumber.trim() && (
                        <p className="mt-1 text-[11px] text-slate-500 font-mono">
                          On cert: <span className="font-bold text-slate-800">{maskChassisNumber(chassisNumber, showFullChassisEngine)}</span>
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-slate-600">
                          Engine Number
                        </label>
                        {showFullChassisEngine ? (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            Showing Full
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                            Cert: XXXXX...
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={engineNumber}
                        onChange={(e) => setEngineNumber(e.target.value)}
                        placeholder="e.g. 02098"
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none uppercase"
                      />
                      {engineNumber.trim() && (
                        <p className="mt-1 text-[11px] text-slate-500 font-mono">
                          On cert: <span className="font-bold text-slate-800">{maskEngineNumber(engineNumber, showFullChassisEngine)}</span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Make
                      </label>
                      <input
                        type="text"
                        value={make}
                        onChange={(e) => setMake(e.target.value)}
                        placeholder="e.g. Bajaj"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Model
                      </label>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="e.g. PULSAR 150"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Year of Mfg
                      </label>
                      <input
                        type="text"
                        value={yearOfManufacture}
                        onChange={(e) => setYearOfManufacture(e.target.value)}
                        placeholder="e.g. 2018"
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Section D: Dates & Verification */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Date of Handover
                    </label>
                    <div className="relative">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={dateOfHandover}
                        onChange={(e) => setDateOfHandover(e.target.value)}
                        placeholder="DD-MM-YYYY"
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
                        value={dateOfIssue}
                        onChange={(e) => setDateOfIssue(e.target.value)}
                        placeholder="DD-MM-YYYY"
                        className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Delhi NCR"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
                    />
                  </div>
                </div>

                {/* Notice & Submit */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200">
                  <div className="text-slate-500 text-[11px] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Certificate will sync with the database and be marked <b>VALID</b> online.</span>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSyncing || isParsing}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      {isSyncing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Syncing Online...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Sync &amp; Make Verified Online</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
