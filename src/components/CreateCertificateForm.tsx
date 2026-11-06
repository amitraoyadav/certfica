import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Car,
  Calendar,
  Sparkles,
  Loader2,
  MapPin,
  X,
  LogOut,
  User,
  ShieldAlert,
  Eye,
  History,
  Lock,
  FileCheck2,
  Cloud,
  RefreshCw,
  KeyRound,
  Download,
  FileText,
} from 'lucide-react';
import type { Certificate } from '../types';
import { maskChassisNumber, maskEngineNumber } from '../utils/maskUtils';
import { getApiUrl } from '../config/apiConfig';

interface CreateCertificateFormProps {
  onCertificateCreated: (cert: Certificate) => void;
  onCancel: () => void;
  onLogout?: () => void;
  onViewExistingCertificate?: (certNumber: string) => void;
  onViewRecentCertificate?: (cert: Certificate) => void;
  onRequestReissue?: (cert: Certificate) => void;
  recentCertificates?: Certificate[];
  isMainAdmin?: boolean;
  onRequestMainAdmin?: () => void;
  onLogoutMainAdmin?: () => void;
}

const BIKE_BRANDS = [
  'Honda',
  'Bajaj',
  'Hero MotoCorp',
  'Hero Honda',
  'TVS',
  'Royal Enfield',
  'Yamaha',
  'Suzuki',
  'KTM',
  'Jawa / Yezdi',
  'Kawasaki',
  'Other',
];

const ID_PROOF_TYPES = [
  'Aadhaar Card',
  'Voter ID',
  'PAN Card',
  'Driving License',
  'Passport',
  'Other ID',
];

export const CreateCertificateForm: React.FC<CreateCertificateFormProps> = ({
  onCertificateCreated,
  onCancel,
  onLogout,
  onViewExistingCertificate,
  onViewRecentCertificate,
  onRequestReissue,
  recentCertificates = [],
  isMainAdmin = false,
  onRequestMainAdmin,
  onLogoutMainAdmin,
}) => {
  // Today's formatted date DD-MM-YYYY
  const getTodayFormatted = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const [nextNumbers, setNextNumbers] = useState<{
    nextCertificateNumber: string;
    nextScrappingRegistrationNumber: string;
  }>({
    nextCertificateNumber: 'Loading...',
    nextScrappingRegistrationNumber: 'Loading...',
  });

  const [selectedBrandOption, setSelectedBrandOption] = useState<string>('Honda');
  const [customBrand, setCustomBrand] = useState<string>('');

  const [formData, setFormData] = useState({
    ownerName: '',
    address: 'Not Provided',
    idProofType: 'Aadhaar Card',
    idProofNumber: '',
    vehicleRegistrationNumber: '',
    chassisNumber: '',
    engineNumber: '',
    showFullChassisEngine: false,
    make: 'Honda',
    model: '',
    location: 'Delhi NCR',
    yearOfManufacture: '2012',
    dateOfHandover: getTodayFormatted(),
    dateOfIssue: getTodayFormatted(),
  });

  const resetForm = () => {
    setFormData({
      ownerName: '',
      address: 'Not Provided',
      idProofType: 'Aadhaar Card',
      idProofNumber: '',
      vehicleRegistrationNumber: '',
      chassisNumber: '',
      engineNumber: '',
      showFullChassisEngine: false,
      make: 'Honda',
      model: '',
      location: 'Delhi NCR',
      yearOfManufacture: '2012',
      dateOfHandover: getTodayFormatted(),
      dateOfIssue: getTodayFormatted(),
    });
    setSelectedBrandOption('Honda');
    setCustomBrand('');
    setDuplicateCert(null);
    setAllowDuplicateOverride(false);
    setIncludeIdProof(false);
    setErrorMessage(null);
    fetchNext(true);
  };

  interface DuplicateInfo {
    exists: boolean;
    certificateNumber: string;
    scrappingRegistrationNumber?: string;
    ownerName: string;
    dateOfIssue: string;
    matchField?: string;
    matchValue?: string;
    certificateId?: string;
    vehicleRegistrationNumber?: string;
    chassisNumber?: string;
    engineNumber?: string;
    make?: string;
    model?: string;
  }

  const [duplicateCert, setDuplicateCert] = useState<DuplicateInfo | null>(null);
  const [allowDuplicateOverride, setAllowDuplicateOverride] = useState(false);
  const [includeIdProof, setIncludeIdProof] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isFetchingNumbers, setIsFetchingNumbers] = useState(false);

  // Fetch next numbers from backend on mount with multi-endpoint fallback
  const fetchNext = async (isMounted = true) => {
    setIsFetchingNumbers(true);
    try {
      let res = await fetch(getApiUrl('/api/certificates/next-numbers'));
      if (!res.ok) {
        res = await fetch(getApiUrl('/api/certificates/next-number'));
      }
      if (!res.ok) {
        res = await fetch(getApiUrl('/api/certificates?action=next-numbers'));
      }
      if (res.ok) {
        const data = await res.json();
        if (isMounted && data && (data.nextCertificateNumber || data.certificateNumber)) {
          setNextNumbers({
            nextCertificateNumber: data.nextCertificateNumber || data.certificateNumber,
            nextScrappingRegistrationNumber: data.nextScrappingRegistrationNumber || data.scrappingRegistrationNumber,
          });
          setIsFetchingNumbers(false);
          return;
        }
      }
    } catch (err) {
      console.error('Error fetching next numbers:', err);
    }
    if (isMounted) {
      setIsFetchingNumbers(false);
      // If server could not be reached, ensure clear indication rather than infinite Loading
      setNextNumbers((prev) => ({
        nextCertificateNumber: prev.nextCertificateNumber.includes('Loading')
          ? 'Allocation pending (click Refresh)'
          : prev.nextCertificateNumber,
        nextScrappingRegistrationNumber: prev.nextScrappingRegistrationNumber.includes('Loading')
          ? 'Allocation pending (click Refresh)'
          : prev.nextScrappingRegistrationNumber,
      }));
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetchNext(isMounted);
    return () => {
      isMounted = false;
    };
  }, []);

  // Duplicate vehicle checking: check Vehicle No, Chassis No, Engine No with debounce
  useEffect(() => {
    const vNo = formData.vehicleRegistrationNumber.trim();
    const cNo = formData.chassisNumber.trim();
    const eNo = formData.engineNumber.trim();

    const isVNoValid = vNo && vNo !== 'Not Provided';
    const isCNoValid = cNo && cNo !== 'Not Provided';
    const isENoValid = eNo && eNo !== 'Not Provided';

    if (!isVNoValid && !isCNoValid && !isENoValid) {
      setDuplicateCert(null);
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (isVNoValid) params.append('vehicleRegistrationNumber', vNo);
      if (isCNoValid) params.append('chassisNumber', cNo);
      if (isENoValid) params.append('engineNumber', eNo);

      fetch(getApiUrl(`/api/certificates/check-vehicle?${params.toString()}`))
        .then((res) => res.json())
        .then((data) => {
          if (data && data.exists) {
            setDuplicateCert(data);
          } else {
            setDuplicateCert(null);
          }
        })
        .catch(() => setDuplicateCert(null));
    }, 450);

    return () => clearTimeout(timer);
  }, [formData.vehicleRegistrationNumber, formData.chassisNumber, formData.engineNumber]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBrandSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedBrandOption(val);
    if (val === 'Other') {
      setFormData((prev) => ({ ...prev, make: customBrand }));
    } else {
      setFormData((prev) => ({ ...prev, make: val }));
    }
  };

  const handleCustomBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomBrand(val);
    setFormData((prev) => ({ ...prev, make: val }));
  };

  const handleFillSample = (sampleType: 'splendor' | 'pulsar') => {
    setIncludeIdProof(true);
    if (sampleType === 'splendor') {
      setSelectedBrandOption('Hero Honda');
      setFormData({
        ownerName: 'AKASH',
        address: 'Not Provided',
        idProofType: 'Aadhaar Card',
        idProofNumber: '9876 5432 1098',
        vehicleRegistrationNumber: 'DL 01 AB 1373',
        chassisNumber: '01373',
        engineNumber: '02098',
        showFullChassisEngine: false,
        make: 'Hero Honda',
        model: 'Splendor (Alloy)',
        location: 'Delhi NCR',
        yearOfManufacture: '2011',
        dateOfHandover: getTodayFormatted(),
        dateOfIssue: getTodayFormatted(),
      });
    } else {
      setSelectedBrandOption('Bajaj');
      setFormData({
        ownerName: 'RAHUL SHARMA',
        address: 'Rohini Sector 7, Delhi',
        idProofType: 'PAN Card',
        idProofNumber: 'ABCDE1234F',
        vehicleRegistrationNumber: 'DL 08 CD 4921',
        chassisNumber: 'MD2A11CY3NC00981',
        engineNumber: 'DHGBNC01294',
        showFullChassisEngine: false,
        make: 'Bajaj',
        model: 'Pulsar 150',
        location: 'Delhi NCR',
        yearOfManufacture: '2013',
        dateOfHandover: getTodayFormatted(),
        dateOfIssue: getTodayFormatted(),
      });
    }
    setAllowDuplicateOverride(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);

    // Form Validations - Mandatory fields
    if (!formData.ownerName.trim()) {
      setErrorMessage('Please enter Owner Name (Mandatory).');
      return;
    }

    // If a matching vehicle is found, automatically enable safe override so the user is never blocked
    if (duplicateCert) {
      setAllowDuplicateOverride(true);
    }

    // Open confirmation popup asking if customer wants to scrap this vehicle
    setShowConfirmModal(true);
  };

  const handleConfirmGenerate = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const safePayload = {
      ...formData,
      ownerName: formData.ownerName.trim(),
      idProofNumber: includeIdProof && (formData.idProofNumber || '').trim()
        ? formData.idProofNumber.trim()
        : 'Not Provided',
      idProofType: includeIdProof && (formData.idProofNumber || '').trim()
        ? formData.idProofType
        : 'Not Provided',
      address: (formData.address || '').trim() || 'Not Provided',
      vehicleRegistrationNumber: formData.vehicleRegistrationNumber.trim() || 'Not Provided',
      chassisNumber: formData.chassisNumber.trim() || 'Not Provided',
      engineNumber: formData.engineNumber.trim() || 'Not Provided',
      showFullChassisEngine: Boolean(formData.showFullChassisEngine),
      make: (formData.make || 'Two Wheeler').trim(),
      model: (formData.model || 'Standard').trim(),
      yearOfManufacture: (formData.yearOfManufacture || '2012').trim(),
      dateOfHandover: (formData.dateOfHandover || getTodayFormatted()).trim(),
      dateOfIssue: (formData.dateOfIssue || getTodayFormatted()).trim(),
      location: 'Delhi NCR', // Enforce location is strictly Delhi NCR
      forceDuplicate: allowDuplicateOverride || Boolean(duplicateCert),
      certificateNumber:
        nextNumbers.nextCertificateNumber &&
        !nextNumbers.nextCertificateNumber.includes('Loading') &&
        !nextNumbers.nextCertificateNumber.includes('pending')
          ? nextNumbers.nextCertificateNumber
          : undefined,
      scrappingRegistrationNumber:
        nextNumbers.nextScrappingRegistrationNumber &&
        !nextNumbers.nextScrappingRegistrationNumber.includes('Loading') &&
        !nextNumbers.nextScrappingRegistrationNumber.includes('pending')
          ? nextNumbers.nextScrappingRegistrationNumber
          : undefined,
    };

    try {
      const adminToken =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        '';

      let res: Response | null = null;
      let retries = 0;
      const maxRetries = 2;

      while (retries <= maxRetries) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (adminToken) {
          headers.Authorization = `Bearer ${adminToken}`;
          headers['x-admin-token'] = adminToken;
        }
        res = await fetch(getApiUrl('/api/certificates'), {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(safePayload),
        });

        // Exponential backoff for HTTP 429 rate limit
        if (res.status === 429 && retries < maxRetries) {
          retries++;
          const delay = 1000 * Math.pow(2, retries);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        break;
      }

      if (!res || !res.ok) {
        if (res && res.status === 429) {
          throw new Error('Server rate limit reached. Please wait a moment before trying again.');
        }
        if (res && res.status === 401 && onLogout) {
          onLogout();
          throw new Error('Your administrator session has expired. Please sign in again.');
        }
        const errorData = await res?.json().catch(() => ({}));
        if (errorData?.isDuplicateVehicle) {
          setDuplicateCert(errorData.existingCertificate);
          throw new Error(errorData.message || 'Duplicate vehicle record detected.');
        }
        throw new Error(errorData?.message || 'Failed to issue certificate on server database');
      }

      const createdCertificate: Certificate = await res.json();

      resetForm();
      setIsSubmitting(false);
      setShowConfirmModal(false);
      onCertificateCreated(createdCertificate);
    } catch (err: any) {
      console.error('Certificate creation failed:', err);
      setErrorMessage(err.message || 'Failed to issue certificate. Please check server connection.');
      setIsSubmitting(false);
      setShowConfirmModal(false);
    }
  };

  const handleStartReissue = () => {
    if (!duplicateCert) return;
    if (onRequestReissue) {
      // Build a minimal certificate object or fetch full one
      fetch(`/api/public/certificate?certificateNumber=${encodeURIComponent(duplicateCert.certificateNumber)}`)
        .then((res) => res.json())
        .then((fullCert) => {
          if (fullCert && fullCert.id) {
            onRequestReissue(fullCert);
          }
        })
        .catch(() => {
          // Fallback minimal cert
          onRequestReissue({
            id: duplicateCert.certificateId || duplicateCert.certificateNumber,
            certificateNumber: duplicateCert.certificateNumber,
            scrappingRegistrationNumber: duplicateCert.scrappingRegistrationNumber || 'REG-C000000',
            ownerName: duplicateCert.ownerName,
            address: 'Not Provided',
            idProofNumber: 'Not Provided',
            vehicleRegistrationNumber: duplicateCert.vehicleRegistrationNumber || '',
            chassisNumber: duplicateCert.chassisNumber || '',
            engineNumber: duplicateCert.engineNumber || '',
            make: duplicateCert.make || 'Two Wheeler',
            model: duplicateCert.model || 'Standard',
            yearOfManufacture: '2012',
            dateOfHandover: getTodayFormatted(),
            dateOfIssue: duplicateCert.dateOfIssue || getTodayFormatted(),
            status: 'VALID',
            isLocked: true,
            isImmutable: true,
            location: 'Delhi NCR',
            qrToken: `tok_${Date.now()}`,
            verificationUrl: `/verify?certificateNumber=${encodeURIComponent(duplicateCert.certificateNumber)}`,
            companySnapshot: {
              companyName: 'PARIVAHAN SCRAPPERS',
              companySubtitle: 'A Unit OF Scrapping Yard Ltd.',
              address: 'B12, Dwarka, New Delhi.',
              phone: '8506925495',
              website: 'https://parivahan-scrappers.netlify.app/',
              signatoryTitle: 'Authorised Signatory',
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });
    } else if (onViewExistingCertificate) {
      onViewExistingCertificate(duplicateCert.certificateNumber);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Form Header */}
      <div className="bg-[#0d2847] p-4 sm:p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] sm:text-xs font-semibold text-emerald-400 uppercase tracking-widest block">
            Central Certificate Registry
          </span>
          <h2 className="text-xl sm:text-2xl font-bold font-serif mt-0.5">
            Make Certificate
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            System automatically generates unique Certificate Number, Scrapping Reg. No., and permanent immutable database record.
          </p>
        </div>

        {/* Quick Fill Sample Buttons & Logout */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-300 font-medium hidden lg:inline">
            Quick Fill:
          </span>
          <button
            type="button"
            onClick={() => handleFillSample('splendor')}
            className="flex-1 sm:flex-none px-3 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-lg text-xs font-semibold border border-white/20 transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
            title="Fill reference data (Hero Honda Splendor)"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            Splendor Sample
          </button>
          <button
            type="button"
            onClick={() => handleFillSample('pulsar')}
            className="flex-1 sm:flex-none px-3 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-lg text-xs font-semibold border border-white/20 transition-colors flex items-center justify-center cursor-pointer min-h-[40px]"
          >
            Pulsar Sample
          </button>

          {!isMainAdmin && onRequestMainAdmin && (
            <button
              id="btn-form-main-core-admin"
              type="button"
              onClick={onRequestMainAdmin}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-amber-200 hover:text-white rounded-lg text-xs font-bold border border-amber-400/30 shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
              title="Unlock Main Core Admin Dashboard"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-300" />
              <span>Main Core Admin</span>
            </button>
          )}

          {isMainAdmin && onLogoutMainAdmin && (
            <button
              id="btn-form-lock-core-admin"
              type="button"
              onClick={onLogoutMainAdmin}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white rounded-lg text-xs font-bold border border-amber-400/40 shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
              title="Lock Main Core Admin and return to Certificate Maker mode"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock Core Admin</span>
            </button>
          )}

          {onLogout && (
            <button
              id="btn-form-header-logout"
              type="button"
              onClick={onLogout}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-rose-600/30 hover:bg-rose-600 active:bg-rose-700 text-rose-200 hover:text-white rounded-lg text-xs font-bold border border-rose-400/40 shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
              title="Sign out of Admin session and return to Login screen"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>

      {/* System Generated Identifiers Banner */}
      <div className="bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50 border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold">Auto-Allocated Cert No.:</span>
            <span className="font-mono font-bold text-[#0d2847] text-xs sm:text-sm bg-blue-100 border border-blue-300 px-2.5 py-0.5 rounded shadow-2xs">
              {nextNumbers.nextCertificateNumber}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold">Auto-Allocated Scrap Reg.:</span>
            <span className="font-mono font-bold text-emerald-800 text-xs sm:text-sm bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded shadow-2xs">
              {nextNumbers.nextScrappingRegistrationNumber}
            </span>
          </div>

          <button
            type="button"
            onClick={() => fetchNext(true)}
            disabled={isFetchingNumbers}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer disabled:opacity-50 transition-colors"
            title="Refresh auto-allocated numbers from database"
          >
            <RefreshCw className={`w-3 h-3 ${isFetchingNumbers ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Server Generated &bull; Permanent &bull; Non-Reusable</span>
        </div>
      </div>

      {/* DUPLICATE PREVENTION: PROMINENT ALERT WHEN VEHICLE ALREADY EXISTS */}
      {duplicateCert && (
        <div className="m-4 sm:m-6 mb-0 p-4 sm:p-5 bg-rose-50 border-2 border-rose-400 rounded-xl text-rose-950 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-black text-rose-900 uppercase tracking-wide">
                  STOP CREATION — Certificate Already Exists
                </h4>
                <span className="px-2.5 py-0.5 bg-rose-200 text-rose-900 font-bold text-xs rounded-full">
                  Duplicate Detected
                </span>
              </div>

              <p className="text-xs sm:text-sm text-rose-800 leading-relaxed">
                A vehicle with matching {duplicateCert.matchField || 'records'} already has an active issued certificate in the central registry.
              </p>

              <div className="bg-white/80 border border-rose-300 rounded-lg p-3 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1 font-mono">
                  <span className="text-slate-600">Existing Certificate No:</span>
                  <strong className="text-rose-900 font-bold text-sm">
                    {duplicateCert.certificateNumber}
                  </strong>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-slate-600">Issued to Owner:</span>
                  <span className="font-semibold text-slate-800">{duplicateCert.ownerName}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-slate-600">Date of Issue:</span>
                  <span className="text-slate-800">{duplicateCert.dateOfIssue}</span>
                </div>
                {duplicateCert.vehicleRegistrationNumber && duplicateCert.vehicleRegistrationNumber !== 'Not Provided' && (
                  <div className="flex flex-wrap items-center justify-between gap-1 font-mono">
                    <span className="text-slate-600">Vehicle RC No:</span>
                    <span className="text-slate-800 font-bold">{duplicateCert.vehicleRegistrationNumber}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons to View Existing or Reissue or Proceed cleanly */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {onViewExistingCertificate && (
                  <button
                    type="button"
                    onClick={() => onViewExistingCertificate(duplicateCert.certificateNumber)}
                    className="px-3.5 py-2 text-xs font-bold text-white bg-[#0d2847] hover:bg-[#163a63] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View Existing Certificate ({duplicateCert.certificateNumber})
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleStartReissue}
                  className="px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <History className="w-3.5 h-3.5 text-amber-700" />
                  Reissue / Correct Certificate
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAllowDuplicateOverride(true);
                    setErrorMessage(null);
                    setShowConfirmModal(true);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  Make Additional Certificate (Preserving Original)
                </button>
              </div>

              {/* Explicit Admin Override Option */}
              <div className="pt-2 border-t border-rose-200/80">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-rose-900 font-medium">
                  <input
                    type="checkbox"
                    checked={allowDuplicateOverride}
                    onChange={(e) => setAllowDuplicateOverride(e.target.checked)}
                    className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <span>
                    Authorize intentional registration for this vehicle (original certificate will remain permanently preserved and never replaced)
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* General Error Message */}
      {errorMessage && (
        <div className="m-4 sm:m-6 mb-0 p-3.5 sm:p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{errorMessage}</div>
        </div>
      )}

      {/* Input Form with 3 Clearly Defined Sections */}
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
        {/* ================================================== */}
        {/* SECTION 1 — OWNER DETAILS */}
        {/* ================================================== */}
        <div className="bg-slate-50/60 p-4 sm:p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-4">
            <h3 className="text-sm font-bold text-[#0d2847] uppercase tracking-wide flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" />
              SECTION 1 — OWNER DETAILS
            </h3>
            <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">
              Owner Identification
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Owner Name */}
            <div>
              <label htmlFor="input-ownerName" className="block text-xs font-semibold text-slate-700 mb-1">
                Owner Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="input-ownerName"
                type="text"
                name="ownerName"
                value={formData.ownerName}
                onChange={handleChange}
                placeholder="e.g. AKASH"
                required
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm uppercase border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none font-medium min-h-[44px] bg-white"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Full legal name as per vehicle RC
              </span>
            </div>

            {/* Owner Address */}
            <div>
              <label htmlFor="input-address" className="block text-xs font-semibold text-slate-700 mb-1">
                Owner Address <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                id="input-address"
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Not Provided or Full Street Address, City"
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none min-h-[44px] bg-white"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Residential address (defaults to "Not Provided")
              </span>
            </div>

            {/* ID Proof Tick Option (Optional - Not Mandatory) */}
            <div className="sm:col-span-2 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label htmlFor="checkbox-includeIdProof" className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    id="checkbox-includeIdProof"
                    type="checkbox"
                    checked={includeIdProof}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIncludeIdProof(checked);
                      if (!checked) {
                        setFormData((prev) => ({
                          ...prev,
                          idProofNumber: '',
                        }));
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-[#0d2847] focus:ring-[#0d2847] mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-slate-800">
                        Add Government ID Proof
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        Optional
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Optional — tick this box only if customer wants to add an ID proof (Aadhaar, PAN, Voter ID, DL). If not, leave unticked.
                    </p>
                  </div>
                </label>

                <span
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full self-start sm:self-auto shrink-0 transition-colors ${
                    includeIdProof
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {includeIdProof ? '✓ ID Proof Enabled' : 'Optional (Unticked)'}
                </span>
              </div>

              {/* Collapsible ID fields when ticked */}
              {includeIdProof && (
                <div className="mt-3.5 pt-3.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-200">
                  {/* ID Proof Type */}
                  <div>
                    <label htmlFor="select-idProofType" className="block text-xs font-semibold text-slate-700 mb-1">
                      ID Proof Type
                    </label>
                    <select
                      id="select-idProofType"
                      name="idProofType"
                      value={formData.idProofType}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none bg-white font-medium min-h-[44px]"
                    >
                      {ID_PROOF_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Select document type
                    </span>
                  </div>

                  {/* ID Proof Number */}
                  <div>
                    <label htmlFor="input-idProofNumber" className="block text-xs font-semibold text-slate-700 mb-1">
                      ID Proof Number <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      id="input-idProofNumber"
                      type="text"
                      name="idProofNumber"
                      value={formData.idProofNumber}
                      onChange={handleChange}
                      placeholder="e.g. 1234 5678 9012"
                      className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm uppercase border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none font-medium min-h-[44px] bg-white font-mono"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Enter official document number
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================== */}
        {/* SECTION 2 — VEHICLE DETAILS */}
        {/* ================================================== */}
        <div className="bg-slate-50/60 p-4 sm:p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-4">
            <h3 className="text-sm font-bold text-[#0d2847] uppercase tracking-wide flex items-center gap-2">
              <Car className="w-4 h-4 text-emerald-600" />
              SECTION 2 — VEHICLE DETAILS
            </h3>
            <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">
              Two-Wheeler &amp; Bike Specs
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Vehicle Registration Number / RC Number */}
            <div>
              <label htmlFor="input-vehicleRegistrationNumber" className="block text-xs font-semibold text-slate-700 mb-1">
                Vehicle Registration No. / RC Number
              </label>
              <input
                id="input-vehicleRegistrationNumber"
                type="text"
                name="vehicleRegistrationNumber"
                value={formData.vehicleRegistrationNumber}
                onChange={handleChange}
                placeholder="e.g. DL 01 AB 1373"
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm uppercase font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none min-h-[44px] bg-white font-bold"
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Official RTO number (leave blank if unallocated)
              </span>
            </div>

            {/* Chassis Number */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-chassisNumber" className="block text-xs font-semibold text-slate-700">
                  Chassis Number
                </label>
                {formData.showFullChassisEngine ? (
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                    Full
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                    XXXX...
                  </span>
                )}
              </div>
              <input
                id="input-chassisNumber"
                type="text"
                name="chassisNumber"
                value={formData.chassisNumber}
                onChange={handleChange}
                placeholder="e.g. MD2A11CY3NC00981 or 01373"
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none min-h-[44px] bg-white uppercase"
              />
              {formData.chassisNumber.trim() && (
                <p className="mt-1 text-[11px] text-slate-500 font-mono">
                  Preview: <span className="font-bold text-slate-800">{maskChassisNumber(formData.chassisNumber, formData.showFullChassisEngine)}</span>
                </p>
              )}
            </div>

            {/* Engine Number */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-engineNumber" className="block text-xs font-semibold text-slate-700">
                  Engine Number
                </label>
                {formData.showFullChassisEngine ? (
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                    Full
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                    XXXXX...
                  </span>
                )}
              </div>
              <input
                id="input-engineNumber"
                type="text"
                name="engineNumber"
                value={formData.engineNumber}
                onChange={handleChange}
                placeholder="e.g. DHGBNC01294 or 02098"
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none min-h-[44px] bg-white uppercase"
              />
              {formData.engineNumber.trim() && (
                <p className="mt-1 text-[11px] text-slate-500 font-mono">
                  Preview: <span className="font-bold text-slate-800">{maskEngineNumber(formData.engineNumber, formData.showFullChassisEngine)}</span>
                </p>
              )}
            </div>

            {/* Maker / Bike Brand Dropdown + Other Option */}
            <div>
              <label htmlFor="select-make-brand" className="block text-xs font-semibold text-slate-700 mb-1">
                Maker (Bike Brand) <span className="text-rose-500">*</span>
              </label>
              <select
                id="select-make-brand"
                value={selectedBrandOption}
                onChange={handleBrandSelect}
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none bg-white font-medium min-h-[44px]"
              >
                {BIKE_BRANDS.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>

              {selectedBrandOption === 'Other' && (
                <div className="mt-2">
                  <input
                    id="input-custom-make"
                    type="text"
                    value={customBrand}
                    onChange={handleCustomBrandChange}
                    placeholder="Type bike brand name here..."
                    required
                    className="w-full px-3.5 py-2 text-sm border border-emerald-500 rounded-lg focus:ring-2 focus:ring-emerald-600 outline-none bg-emerald-50/40 min-h-[40px]"
                  />
                </div>
              )}
            </div>

            {/* Model */}
            <div>
              <label htmlFor="input-model" className="block text-xs font-semibold text-slate-700 mb-1">
                Model
              </label>
              <input
                id="input-model"
                type="text"
                name="model"
                value={formData.model}
                onChange={handleChange}
                placeholder="e.g. Splendor (Alloy) / Pulsar 150"
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none min-h-[44px] bg-white font-medium"
              />
            </div>

            {/* Year of Manufacture */}
            <div>
              <label htmlFor="input-yearOfManufacture" className="block text-xs font-semibold text-slate-700 mb-1">
                Year of Manufacture
              </label>
              <input
                id="input-yearOfManufacture"
                type="text"
                name="yearOfManufacture"
                value={formData.yearOfManufacture}
                onChange={handleChange}
                placeholder="e.g. 2012"
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none min-h-[44px] bg-white"
              />
            </div>

            {/* Masking Toggle */}
            <div className="col-span-1 sm:col-span-2 md:col-span-3 bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  id="input-showFullChassisEngine"
                  type="checkbox"
                  name="showFullChassisEngine"
                  checked={formData.showFullChassisEngine}
                  onChange={(e) => setFormData((prev) => ({ ...prev, showFullChassisEngine: e.target.checked }))}
                  className="mt-0.5 h-4.5 w-4.5 rounded border-slate-300 text-[#0d2847] focus:ring-[#0d2847] cursor-pointer shrink-0 accent-[#0d2847]"
                />
                <div className="flex-1 text-xs">
                  <span className="font-bold text-slate-900 block">
                    Show full Chassis and Engine Number on Certificate (Unmasked)
                  </span>
                  <p className="text-slate-500 mt-0.5">
                    {formData.showFullChassisEngine
                      ? 'Certificate will display the entire chassis and engine numbers without XXX masking.'
                      : 'Default privacy protection: First 4 chassis digits and first 5 engine digits will be masked.'}
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* ================================================== */}
        {/* SECTION 3 — SCRAPPING DETAILS */}
        {/* ================================================== */}
        <div className="bg-slate-50/60 p-4 sm:p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-4">
            <h3 className="text-sm font-bold text-[#0d2847] uppercase tracking-wide flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              SECTION 3 — SCRAPPING DETAILS
            </h3>
            <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">
              Handover &amp; Issuance
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Date of Handover */}
            <div>
              <label htmlFor="input-dateOfHandover" className="block text-xs font-semibold text-slate-700 mb-1">
                Date of Handover <span className="text-rose-500">*</span>
              </label>
              <input
                id="input-dateOfHandover"
                type="text"
                name="dateOfHandover"
                value={formData.dateOfHandover}
                onChange={handleChange}
                placeholder="DD-MM-YYYY"
                required
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none min-h-[44px] bg-white font-medium"
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Format: DD-MM-YYYY (e.g. 03-08-2026)
              </span>
            </div>

            {/* Date of Issue */}
            <div>
              <label htmlFor="input-dateOfIssue" className="block text-xs font-semibold text-slate-700 mb-1">
                Issue Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="input-dateOfIssue"
                type="text"
                name="dateOfIssue"
                value={formData.dateOfIssue}
                onChange={handleChange}
                placeholder="DD-MM-YYYY"
                required
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none min-h-[44px] bg-white font-medium"
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Defaults to today
              </span>
            </div>

            {/* Operational Region */}
            <div>
              <label htmlFor="input-location" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                Operational Region <span className="text-rose-500">*</span>
              </label>
              <input
                id="input-location"
                type="text"
                name="location"
                value="Delhi NCR"
                readOnly
                disabled
                className="w-full px-3.5 py-2.5 sm:py-2 text-base sm:text-sm border border-slate-300 bg-slate-100 text-slate-800 rounded-lg font-bold cursor-not-allowed min-h-[44px]"
              />
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Jurisdiction: Fixed to <strong>Delhi NCR</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isMainAdmin && (
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer text-center min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Reset all fields and generate new random certificate numbers"
            >
              Clear Form
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-submit-generate"
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-[48px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Issuing Certificate...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  CREATE / ISSUE CERTIFICATE
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ================================================== */}
      {/* RECENT 5 CREATED CERTIFICATES PANEL (MAKER SCOPE) */}
      {/* ================================================== */}
      <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0d2847] text-emerald-300 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0d2847] uppercase tracking-wide">
                Recent 5 Created Certificates
              </h3>
              <p className="text-[11px] text-slate-500">
                Latest 5 issued certificates sorted by creation timestamp descending
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold self-start sm:self-auto">
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
            Latest {Math.min(5, recentCertificates.length)} of 5 Recent
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 text-[11px] uppercase font-bold border-b border-slate-200">
                <th className="py-2.5 px-3.5">Certificate No.</th>
                <th className="py-2.5 px-3.5">Scrap Reg. No.</th>
                <th className="py-2.5 px-3.5">Owner Name</th>
                <th className="py-2.5 px-3.5">Vehicle RC</th>
                <th className="py-2.5 px-3.5">Issue Date</th>
                <th className="py-2.5 px-3.5">Status</th>
                <th className="py-2.5 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {recentCertificates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No recent certificates to display.
                  </td>
                </tr>
              ) : (
                recentCertificates.slice(0, 5).map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3.5 font-mono font-bold text-[#0d2847]">
                      {cert.certificateNumber}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-emerald-800 font-semibold">
                      {cert.scrappingRegistrationNumber}
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold uppercase">
                      {cert.ownerName}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-slate-700">
                      {cert.vehicleRegistrationNumber}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-slate-600 text-[11px]">
                      {cert.dateOfIssue}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          cert.status === 'VALID' || cert.status === 'ISSUED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {cert.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (onViewRecentCertificate) {
                              onViewRecentCertificate(cert);
                            } else if (onViewExistingCertificate) {
                              onViewExistingCertificate(cert.certificateNumber);
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-[#0d2847] bg-slate-100 hover:bg-slate-200 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                          title="View Certificate"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        <a
                          href={`/api/certificates/pdf/${encodeURIComponent(cert.certificateNumber)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md flex items-center gap-1 transition-colors"
                          title="Download Official Certificate PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          id="scrap-confirm-modal"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#0d2847] px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-300" />
                </div>
                <h3 id="confirm-modal-title" className="text-base font-bold">
                  Confirm Vehicle Scrapping &amp; Issuance
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4">
              <div className="p-3.5 bg-amber-50 border border-amber-200/90 rounded-xl text-amber-950 text-sm">
                <p className="font-semibold leading-relaxed">
                  Are you sure you want to issue this certificate and confirm the customer wants to scrap this vehicle?
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  Once issued, this certificate becomes permanently locked and immutable in the registry.
                </p>
              </div>

              {/* Brief Vehicle & Owner Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 shrink-0">Customer / Owner:</span>
                  <span className="font-bold text-slate-900 text-right truncate">{formData.ownerName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 shrink-0">ID Proof:</span>
                  {includeIdProof && formData.idProofNumber ? (
                    <span className="font-mono text-slate-900 text-right truncate">
                      {formData.idProofType}: {formData.idProofNumber}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-right italic">
                      Not Provided (Optional — Unticked)
                    </span>
                  )}
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 shrink-0">Vehicle:</span>
                  <span className="font-bold text-slate-900 text-right truncate">{formData.make} {formData.model}</span>
                </div>
                {formData.vehicleRegistrationNumber && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Registration No.:</span>
                    <span className="font-mono font-bold text-slate-900 text-right">{formData.vehicleRegistrationNumber}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 shrink-0">Chassis No. (on Cert):</span>
                  <span className="font-mono text-slate-800 text-right truncate font-bold">
                    {maskChassisNumber(formData.chassisNumber, formData.showFullChassisEngine)}
                  </span>
                </div>
                {formData.engineNumber && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Engine No. (on Cert):</span>
                    <span className="font-mono text-slate-800 text-right truncate font-bold">
                      {maskEngineNumber(formData.engineNumber, formData.showFullChassisEngine)}
                    </span>
                  </div>
                )}
              </div>

              {/* Google Drive Auto-Sync Info */}
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-sky-950">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-sky-600 shrink-0" />
                  <span className="font-semibold">Google Drive Auto-Sync:</span>
                  <span className="text-sky-700">Auto-saved to Drive "certificates" folder from all devices</span>
                </div>
                <span className="px-2 py-0.5 bg-sky-200/80 text-sky-900 font-bold text-[10px] rounded-md uppercase tracking-wider shrink-0">
                  Auto-Sync On
                </span>
              </div>

              {/* Yes / No Actions */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  id="btn-confirm-no"
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
                >
                  Cancel
                </button>

                <button
                  id="btn-confirm-yes"
                  type="button"
                  onClick={handleConfirmGenerate}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none px-7 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Making Certificate...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Yes, Issue Certificate
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
