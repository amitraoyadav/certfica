import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  XCircle,
  Search,
  ShieldCheck,
  Building2,
  ExternalLink,
  RotateCcw,
  X,
  Copy,
  Check,
  Lock,
  FileCheck2,
  AlertTriangle,
  History,
  KeyRound,
} from 'lucide-react';
import type { PublicVerificationResponse } from '../types';
import { PScrapLogo } from './PScrapLogo';

interface PublicVerifyViewProps {
  initialCertificateNumber?: string;
  initialToken?: string;
  onViewCertificate?: (certNumber: string) => void;
}

export const PublicVerifyView: React.FC<PublicVerifyViewProps> = ({
  initialCertificateNumber = '',
  initialToken = '',
  onViewCertificate,
}) => {
  const [certInput, setCertInput] = useState<string>(initialCertificateNumber);
  const [tokenInput] = useState<string>(initialToken);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PublicVerificationResponse | null>(null);
  const [searchedNumber, setSearchedNumber] = useState<string>('');
  const [verifiedQrUrl, setVerifiedQrUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  const performVerification = async (certNumber: string, token?: string) => {
    let cleaned = certNumber.trim();
    if (!cleaned) return;

    // Handle full URLs or verify paths pasted or scanned into search
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://') || cleaned.includes('/verify')) {
      try {
        const u = new URL(cleaned.startsWith('http') ? cleaned : `https://example.com/${cleaned.replace(/^\//, '')}`);
        const param =
          u.searchParams.get('certificateNumber') ||
          u.searchParams.get('certNumber') ||
          u.searchParams.get('cert') ||
          u.searchParams.get('q') ||
          u.searchParams.get('number');
        if (param) {
          cleaned = param;
        } else if (u.pathname.includes('/verify/')) {
          cleaned = u.pathname.split('/verify/')[1].split('/')[0];
        }
        const urlToken = u.searchParams.get('token');
        if (urlToken && !token) {
          token = urlToken;
        }
      } catch {}
    }

    cleaned = cleaned.replace(/^\/?verify\/?/i, '').trim();

    try {
      while (cleaned.includes('%')) {
        const d = decodeURIComponent(cleaned);
        if (d === cleaned) break;
        cleaned = d;
      }
    } catch {}

    cleaned = cleaned.trim().toUpperCase();
    if (!cleaned) return;

    setIsLoading(true);
    setSearchedNumber(cleaned);

    try {
      // Query canonical backend database verification endpoint strictly
      let data: PublicVerificationResponse | null = null;
      let url = `/api/verify?certificateNumber=${encodeURIComponent(cleaned)}`;
      if (token) {
        url += `&token=${encodeURIComponent(token)}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        data = await res.json();
      } else {
        // Fallback POST query with pure identifiers
        const postRes = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ certificateNumber: cleaned, token }),
        });
        if (postRes.ok) {
          data = await postRes.json();
        }
      }

      if (data) {
        setResult(data);

        if (data.verified && data.certificateNumber) {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const verifyUrl = `${origin}/verify?certificateNumber=${encodeURIComponent(data.certificateNumber)}`;
          QRCode.toDataURL(verifyUrl, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 200,
            color: { dark: '#0d2847', light: '#ffffff' },
          })
            .then((qr) => setVerifiedQrUrl(qr))
            .catch(() => setVerifiedQrUrl(''));
        }
      } else {
        setResult({
          verified: false,
          status: 'NOT_FOUND',
          message: 'Certificate record not found in official registry database.',
          verifiedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      setResult({
        verified: false,
        status: 'NOT_FOUND',
        message: 'Could not connect to official registry database. Please try again.',
        verifiedAt: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-verify if an initial certificate number is provided (e.g. from QR scan or route)
  useEffect(() => {
    if (initialCertificateNumber) {
      setCertInput(initialCertificateNumber);
      performVerification(initialCertificateNumber, initialToken);
    }
  }, [initialCertificateNumber, initialToken]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performVerification(certInput, tokenInput);
  };

  const handleClear = () => {
    setCertInput('');
    setResult(null);
    setVerifiedQrUrl('');
  };

  const handleCopyNumber = (num: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(num).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Verification Header with pScrap logo */}
      <div className="text-center">
        <div className="flex justify-center mb-2.5">
          <PScrapLogo size="sm" variant="dark" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[#0d2847]">
          Digital Certificate Verification
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-lg mx-auto">
          PARIVAHAN SCRAPPERS official online registry. Verify certificate
          authenticity, vehicle scrapping status, and cryptographic record.
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-xs">
        <div className="mb-4 bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-3 sm:p-3.5 text-xs text-emerald-950 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-emerald-900">
              Official Database Verification
            </p>
            <p className="text-emerald-800 text-[11px] sm:text-xs mt-0.5 leading-relaxed">
              Enter the Certificate Number printed on your certificate (e.g.{' '}
              <strong className="font-mono">PS/26/R1000</strong>) to verify its permanent immutable record and SHA-256 cryptographic authenticity.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch gap-3">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="input-verify-cert-num"
              type="text"
              value={certInput}
              onChange={(e) => setCertInput(e.target.value)}
              placeholder="Enter Certificate No. (e.g. PS/26/R1000)"
              required
              autoFocus
              className="w-full pl-11 pr-12 py-3 text-base sm:text-sm font-mono uppercase font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0d2847] focus:border-transparent outline-none bg-slate-50/50 min-h-[48px]"
            />
            {certInput && (
              <button
                id="btn-clear-verify-input"
                type="button"
                onClick={() => setCertInput('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-700 active:text-slate-900 rounded-lg transition-colors cursor-pointer"
                title="Clear input"
                aria-label="Clear certificate number"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            id="btn-verify-submit"
            type="submit"
            disabled={isLoading || !certInput.trim()}
            className="w-full sm:w-auto px-6 py-3 text-sm font-bold text-white bg-[#0d2847] hover:bg-[#163a63] active:bg-[#091b30] rounded-xl transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shrink-0 min-h-[48px] min-w-[44px]"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Verifying...
              </span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>VERIFY CERTIFICATE</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center shadow-xs">
          <div className="animate-spin w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm font-bold text-[#0d2847]">Verifying Certificate...</p>
          <p className="text-xs text-slate-500 mt-1">
            Querying canonical database registry for {searchedNumber}
          </p>
        </div>
      )}

      {/* Results View */}
      {!isLoading && result && (
        <div className="space-y-4">
          {result.verified ? (
            /* SUCCESS VERIFIED STATE */
            <div className="bg-white rounded-xl border-2 border-emerald-500 shadow-md overflow-hidden animate-in fade-in zoom-in duration-300">
              {/* Green Verified Banner */}
              <div className="bg-gradient-to-b from-emerald-50 to-white p-6 sm:p-8 text-center border-b border-emerald-100 flex flex-col items-center">
                {/* Big Green Verified Tick */}
                <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-emerald-600 text-white shadow-lg mb-3 ring-8 ring-emerald-100">
                  <svg
                    className="w-12 h-12 sm:w-14 sm:h-14"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                  <div className="inline-flex items-center gap-1 px-3.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-extrabold uppercase tracking-widest rounded-full">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-700" />
                    CANONICAL DATABASE RECORD
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-extrabold uppercase tracking-widest rounded-full">
                    <Lock className="w-3.5 h-3.5 text-emerald-700" />
                    PERMANENTLY IMMUTABLE
                  </div>
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-emerald-950 font-serif">
                  ✓ VERIFIED CERTIFICATE
                </h2>
                <p className="text-xs sm:text-sm text-emerald-800 mt-1 max-w-md mx-auto font-medium">
                  {result.message}
                </p>

                {/* SUPERSEDED ALERT BOX */}
                {result.status === 'SUPERSEDED' && (
                  <div className="mt-4 w-full max-w-lg bg-amber-50 border-2 border-amber-400 rounded-xl p-4 text-left shadow-sm">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-amber-900 text-sm">
                          SUPERSEDED RECORD (REPLACED BY CORRECTION)
                        </h4>
                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                          This certificate (version {result.version || 1}) has been officially superseded and replaced by corrected certificate{' '}
                          <strong className="font-mono font-bold text-amber-950">{result.supersededBy}</strong>. The original issued data shown below remains permanently preserved in the registry for audit and compliance.
                        </p>
                        {result.supersededBy && (
                          <button
                            type="button"
                            onClick={() => {
                              setCertInput(result.supersededBy!);
                              performVerification(result.supersededBy!);
                            }}
                            className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg transition-colors cursor-pointer shadow-xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Verify Corrected Certificate ({result.supersededBy}) →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* REISSUED FROM NOTICE */}
                {result.correctedFrom && (
                  <div className="mt-4 w-full max-w-lg bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-left shadow-xs">
                    <div className="flex items-start gap-2.5">
                      <History className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-blue-900 uppercase">
                            Corrected / Reissued Certificate (v{result.version || 2})
                          </span>
                        </div>
                        <p className="text-xs text-blue-800 mt-0.5">
                          Issued as a replacement for original certificate{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setCertInput(result.correctedFrom!);
                              performVerification(result.correctedFrom!);
                            }}
                            className="font-mono font-bold underline hover:text-blue-950 cursor-pointer"
                          >
                            {result.correctedFrom}
                          </button>
                          . Reason: <span className="italic">{result.correctionReason || 'Clerical correction'}</span>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Clickable QR code box opening the certificate */}
                {verifiedQrUrl && onViewCertificate && result.certificateNumber && (
                  <button
                    id="btn-click-qr-open-cert"
                    type="button"
                    onClick={() => onViewCertificate(result.certificateNumber!)}
                    className="mt-4 p-3 sm:p-4 bg-white rounded-xl border-2 border-dashed border-emerald-300 hover:border-emerald-600 active:border-emerald-700 shadow-xs flex flex-col items-center cursor-pointer transition-all hover:scale-105 active:scale-95 group min-w-[120px] min-h-[120px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                    title="Click QR Code to view certificate document"
                    aria-label="Open full certificate view"
                  >
                    <img
                      src={verifiedQrUrl}
                      alt="Verified Certificate QR"
                      className="w-20 h-20 object-contain rounded"
                    />
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-[#0d2847] group-hover:text-emerald-700 min-h-[24px]">
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Click QR to Open Certificate</span>
                    </div>
                  </button>
                )}
              </div>

              {/* Verified Details Grid */}
              <div className="p-5 sm:p-8 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200 text-sm">
                  {/* Cryptographic SHA-256 Data Integrity Verified Badge */}
                  <div className="col-span-1 sm:col-span-2 bg-emerald-50/90 border border-emerald-300 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-950">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-emerald-700 shrink-0" />
                      <div>
                        <span className="font-bold text-emerald-900 block">
                          ✓ DATA INTEGRITY VERIFIED (SHA-256)
                        </span>
                        <span className="text-[11px] text-emerald-800">
                          Cryptographic hash matched against canonical ledger record. Record has not been altered.
                        </span>
                      </div>
                    </div>
                    {result.dataHash && (
                      <span className="font-mono text-[10px] text-emerald-900 bg-white/90 px-2 py-1 rounded border border-emerald-200 truncate max-w-xs" title={`SHA-256 Hash: ${result.dataHash}`}>
                        HASH: {result.dataHash.substring(0, 16)}...
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Certificate No.
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono font-bold text-lg text-[#0d2847]">
                        {result.certificateNumber}
                      </span>
                      {result.certificateNumber && (
                        <button
                          id="btn-copy-cert-num"
                          type="button"
                          onClick={() => handleCopyNumber(result.certificateNumber!)}
                          className="w-11 h-11 inline-flex items-center justify-center text-slate-500 hover:text-emerald-700 active:bg-emerald-50 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Copy certificate number"
                          aria-label="Copy certificate number"
                        >
                          {isCopied ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Scrapping Registration No.
                    </span>
                    <span className="font-mono font-bold text-lg text-emerald-800 block mt-0.5">
                      {result.scrappingRegistrationNumber}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Owner Name
                    </span>
                    <span className="font-bold text-slate-900 uppercase block mt-0.5">
                      {result.ownerName}
                    </span>
                  </div>

                  {result.idProofNumber && result.idProofNumber !== 'Not Provided' && (
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        ID Proof Number
                      </span>
                      <span className="font-mono text-slate-900 font-bold block mt-0.5">
                        {result.idProofNumber}
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Vehicle Reg. (RC) No.
                    </span>
                    <span className="font-mono font-bold text-slate-900 uppercase block mt-0.5">
                      {result.vehicleRegistrationNumber || 'Not Specified'}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Vehicle Make &amp; Model
                    </span>
                    <span className="text-slate-800 font-medium block mt-0.5">
                      {result.make} {result.model}
                    </span>
                  </div>

                  {result.chassisNumberMasked && result.chassisNumberMasked !== 'Not Provided' && (
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        {result.showFullChassisEngine ? 'Chassis Number' : 'Chassis No. (Secured)'}
                      </span>
                      <span className="font-mono text-slate-900 font-bold block mt-0.5">
                        {result.chassisNumberMasked}
                      </span>
                    </div>
                  )}

                  {result.engineNumberMasked && result.engineNumberMasked !== 'Not Provided' && (
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        {result.showFullChassisEngine ? 'Engine Number' : 'Engine No. (Secured)'}
                      </span>
                      <span className="font-mono text-slate-900 font-bold block mt-0.5">
                        {result.engineNumberMasked}
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Location / Region
                    </span>
                    <span className="text-slate-800 font-semibold block mt-0.5">
                      {result.location || 'Delhi NCR'}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Date of Handover
                    </span>
                    <span className="text-slate-800 font-medium block mt-0.5">
                      {result.dateOfHandover}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Date of Issue
                    </span>
                    <span className="text-slate-800 font-medium block mt-0.5">
                      {result.dateOfIssue}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Record Status
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold mt-1 ${
                      result.status === 'SUPERSEDED'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      ● {result.status}
                    </span>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Verified On
                    </span>
                    <span className="text-xs text-slate-600 block mt-1 font-mono">
                      {new Date(result.verifiedAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Privacy & Legal Authenticity Note */}
                <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3.5 sm:p-4 text-xs text-blue-950 leading-relaxed">
                  <div className="flex items-start gap-2.5">
                    <Building2 className="w-4 h-4 text-[#0d2847] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#0d2847]">
                        Company Issued Digital Verification
                      </p>
                      <p className="text-slate-700 mt-0.5">
                        This verification confirms that the motor vehicle above was accepted by{' '}
                        <strong>PARIVAHAN SCRAPPERS</strong> (A Unit OF Scrapping Yard Ltd.) for
                        environmentally sound dismantling and recycling. To protect customer privacy,
                        sensitive personal identity proofs are masked in public verification.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  {onViewCertificate && result.certificateNumber && (
                    <button
                      id="btn-customer-view-download"
                      type="button"
                      onClick={() => onViewCertificate(result.certificateNumber!)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-md transition-all cursor-pointer hover:shadow-lg min-h-[48px] min-w-[44px]"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" />
                      <span>View &amp; Download Certificate (PDF)</span>
                    </button>
                  )}

                  <button
                    id="btn-verify-another-cert"
                    type="button"
                    onClick={handleClear}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 rounded-xl transition-colors cursor-pointer min-h-[48px] min-w-[44px]"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Verify Another</span>
                  </button>
                </div>
              </div>
            </div>
          ) : result.status === 'CANCELLED' || result.status === 'DELETED' ? (
            /* CANCELLED OR DELETED PRESERVED ARCHIVAL STATE */
            <div className="bg-white rounded-xl border-2 border-amber-400 shadow-md overflow-hidden animate-in fade-in duration-300">
              <div className="bg-gradient-to-b from-amber-50 to-white p-6 sm:p-8 text-center border-b border-amber-200">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 text-amber-700 mb-3 ring-8 ring-amber-50">
                  <AlertTriangle className="w-12 h-12" />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                  <span className="px-3.5 py-1 bg-amber-100 text-amber-900 text-xs font-black uppercase tracking-wider rounded-full border border-amber-300">
                    ⚠ CERTIFICATE {result.status === 'DELETED' ? 'DELETED / CANCELLED' : 'CANCELLED'}
                  </span>
                  <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full border border-slate-300">
                    PRESERVED FOR COMPLIANCE AUDIT
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-amber-950 font-serif">
                  CERTIFICATE VOIDED / {result.status}
                </h2>
                <p className="text-xs sm:text-sm text-amber-900 mt-2 max-w-lg mx-auto font-medium leading-relaxed">
                  {result.message}
                </p>
                {result.cancellationReason && (
                  <div className="mt-3 inline-block bg-white/90 border border-amber-300 rounded-lg px-4 py-2 text-xs text-amber-950 font-medium">
                    Reason: <em>{result.cancellationReason}</em>
                  </div>
                )}
              </div>

              {/* Preserved Vehicle & Certificate Record */}
              <div className="p-5 sm:p-7 space-y-4 bg-white">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                  <span>Preserved Historical Record</span>
                  <span className="font-mono text-slate-700 font-bold">{result.certificateNumber}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div>
                    <span className="text-slate-500 font-semibold block">Owner Name:</span>
                    <span className="text-slate-900 font-bold uppercase block">{result.ownerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block">Vehicle RC:</span>
                    <span className="font-mono text-slate-900 font-bold block">{result.vehicleRegistrationNumber || 'Not Provided'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block">Make &amp; Model:</span>
                    <span className="text-slate-800 font-medium block">{result.make} {result.model}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block">Scrapping Reg No:</span>
                    <span className="font-mono text-slate-800 font-medium block">{result.scrappingRegistrationNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block">Original Date of Issue:</span>
                    <span className="text-slate-800 block">{result.dateOfIssue}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block">Cancellation Date:</span>
                    <span className="text-amber-900 font-bold block">
                      {result.cancelledAt ? new Date(result.cancelledAt).toLocaleDateString() : 'Recorded'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 leading-relaxed">
                  Notice: This certificate has been officially voided and is no longer valid for official submissions. The permanent record remains archived in the Parivahan Scrappers registry to maintain non-repudiable audit logs.
                </div>

                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={handleClear}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer min-h-[44px]"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-500" />
                    <span>Search Another Certificate</span>
                  </button>
                </div>
              </div>
            </div>
          ) : result.status === 'REVOKED' ? (
            /* REVOKED STATE */
            <div className="bg-white rounded-xl border-2 border-rose-400 shadow-md p-6 sm:p-8 text-center animate-in fade-in duration-300">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-rose-100 text-rose-600 mb-4 ring-8 ring-rose-50">
                <XCircle className="w-12 h-12" />
              </div>
              <h2 className="text-2xl font-black text-rose-950 font-serif">
                CERTIFICATE REVOKED
              </h2>
              <p className="text-sm text-rose-700 mt-2 max-w-md mx-auto">
                {result.message}
              </p>
              <div className="mt-4 p-4 bg-rose-50 rounded-lg text-xs text-rose-800 max-w-md mx-auto">
                Certificate Number: <span className="font-mono font-bold">{searchedNumber}</span> is no
                longer active or valid in official records.
              </div>
              <div className="mt-5 flex justify-center">
                <button
                  id="btn-retry-verify-revoked"
                  type="button"
                  onClick={handleClear}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 rounded-xl transition-colors cursor-pointer min-h-[48px] min-w-[44px]"
                >
                  <RotateCcw className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Search Another Certificate</span>
                </button>
              </div>
            </div>
          ) : (
            /* NOT FOUND STATE */
            <div className="bg-white rounded-xl border-2 border-slate-300 shadow-md p-6 sm:p-8 text-center animate-in fade-in duration-300">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 text-slate-500 mb-4 ring-8 ring-slate-50">
                <XCircle className="w-12 h-12" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 font-serif">
                CERTIFICATE NOT FOUND
              </h2>
              <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
                The certificate number <span className="font-mono font-bold text-[#0d2847]">{searchedNumber}</span> could
                not be verified in the company's official digital registry.
              </p>
              <p className="text-xs text-slate-500 mt-3">
                Please verify that the Certificate Number was typed correctly or contact Parivahan Scrappers support.
              </p>

              <div className="mt-5 flex justify-center">
                <button
                  id="btn-retry-verify-notfound"
                  type="button"
                  onClick={handleClear}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 rounded-xl transition-colors cursor-pointer min-h-[48px] min-w-[44px]"
                >
                  <RotateCcw className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Try Another Certificate</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
