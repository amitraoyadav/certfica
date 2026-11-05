import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import {
  MapPin,
  Phone,
  Globe,
  Laptop,
  Leaf,
  RefreshCw,
  Download,
  Printer,
  Loader2,
  CheckCircle2,
  Mail,
  Lock,
  AlertTriangle,
  KeyRound,
  History,
} from 'lucide-react';
import type { Certificate } from '../types';
import { CertificateWatermark } from './CertificateWatermark';
import { AuthorizedSignature } from './AuthorizedSignature';
import { SendEmailModal } from './SendEmailModal';
import {
  downloadCertificatePdf,
  getCertificatePdfFileName,
  generateCertificatePdfBlob,
} from '../utils/pdfGenerator';
import { maskChassisNumber, maskEngineNumber } from '../utils/maskUtils';
import {
  isDriveConnected,
  getDriveAccessToken,
  googleDriveSignIn,
} from '../services/googleDriveAuth';
import { uploadCertificatePdfToDrive } from '../services/googleDriveService';
import { Cloud, ExternalLink } from 'lucide-react';

interface CertificateViewProps {
  certificate: Certificate;
  onPrint?: () => void;
  showActions?: boolean;
  onQrClick?: () => void;
  customerMode?: boolean;
  onBack?: () => void;
}

export const CertificateView: React.FC<CertificateViewProps> = ({
  certificate,
  onPrint,
  showActions = true,
  onQrClick,
  customerMode = false,
  onBack,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [downloadStatusText, setDownloadStatusText] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [driveStatus, setDriveStatus] = useState<'BACKED_UP' | 'UPLOADING' | 'NOT_BACKED_UP' | 'FAILED'>(
    certificate.driveBackupStatus === 'BACKED_UP' || certificate.driveFileId ? 'BACKED_UP' : 'NOT_BACKED_UP'
  );
  const [driveFileUrl, setDriveFileUrl] = useState<string | undefined>(
    certificate.driveFileUrl || (certificate.driveFileId ? `https://drive.google.com/file/d/${certificate.driveFileId}/view` : undefined)
  );
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const pdfFileName = getCertificatePdfFileName(certificate.certificateNumber);
  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://parivahan-scrappers.netlify.app';
  const fullVerificationUrl = `${baseUrl}/verify?certificateNumber=${encodeURIComponent(certificate.certificateNumber)}${certificate.qrToken ? `&token=${encodeURIComponent(certificate.qrToken)}` : ''}`;

  // Auto-fit responsive scaling state (zero horizontal drag)
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      if (containerWidth < 760) {
        // Leave tiny 4px buffer, ensure exact container fit so zero dragging is ever required
        const availableWidth = Math.max(260, containerWidth - 4);
        const computedScale = Math.min(1, Math.max(0.28, availableWidth / 760));
        setScale(computedScale);
      } else {
        setScale(1);
      }
    };

    updateScale();

    // Use ResizeObserver for instant recalculation when screen, layout, or orientation changes
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => updateScale());
      ro.observe(containerRef.current);
    }

    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
      if (ro) ro.disconnect();
    };
  }, []);

  // QR code generation effect
  useEffect(() => {
    QRCode.toDataURL(fullVerificationUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 260,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Error generating QR code:', err));
  }, [fullVerificationUrl]);

  // Auto-backup newly generated certificate to Google Drive if Drive is connected
  useEffect(() => {
    const isConn = isDriveConnected();
    setDriveConnected(isConn);

    const autoBackup = async () => {
      if (isConn && !certificate.driveFileId && driveStatus !== 'BACKED_UP' && driveStatus !== 'UPLOADING') {
        setDriveStatus('UPLOADING');
        try {
          await new Promise((r) => setTimeout(r, 400));
          const blob = await generateCertificatePdfBlob('certificate-print-area');
          if (blob) {
            const uploaded = await uploadCertificatePdfToDrive(certificate, blob);
            setDriveFileUrl(uploaded.driveFileUrl);
            setDriveStatus('BACKED_UP');
            await fetch('/api/certificates/sync-uploaded-certificate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('ps_admin_token') || 'ps_admin_session_token_secure_2026'}`,
              },
              body: JSON.stringify({
                certificateNumber: certificate.certificateNumber,
                driveFileId: uploaded.driveFileId,
                driveFileUrl: uploaded.driveFileUrl,
                driveBackupStatus: 'BACKED_UP',
              }),
            });
          } else {
            setDriveStatus('NOT_BACKED_UP');
          }
        } catch (err) {
          console.warn('Auto drive backup attempt warning:', err);
          setDriveStatus('FAILED');
        }
      }
    };

    autoBackup();
  }, [certificate.id, certificate.certificateNumber]);

  const handleManualDriveBackup = async () => {
    if (!isDriveConnected()) {
      try {
        const res = await googleDriveSignIn();
        if (!res) return;
        setDriveConnected(true);
      } catch (err: any) {
        setDriveError('Could not connect to Google Drive: ' + err.message);
        setDriveStatus('FAILED');
        return;
      }
    }
    setDriveStatus('UPLOADING');
    try {
      const blob = await generateCertificatePdfBlob('certificate-print-area');
      if (!blob) throw new Error('Could not render certificate PDF.');
      const uploaded = await uploadCertificatePdfToDrive(certificate, blob);
      setDriveFileUrl(uploaded.driveFileUrl);
      setDriveStatus('BACKED_UP');
      await fetch('/api/certificates/sync-uploaded-certificate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ps_admin_token') || 'ps_admin_session_token_secure_2026'}`,
        },
        body: JSON.stringify({
          certificateNumber: certificate.certificateNumber,
          driveFileId: uploaded.driveFileId,
          driveFileUrl: uploaded.driveFileUrl,
          driveBackupStatus: 'BACKED_UP',
        }),
      });
    } catch (err: any) {
      console.error('Manual drive backup error:', err);
      setDriveStatus('FAILED');
    }
  };

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    setDownloadStatusText('Preparing document...');

    // Temporarily unscale during capture to guarantee high-res 300+ DPI A4 PDF export
    setIsExportingPdf(true);
    await new Promise((resolve) => setTimeout(resolve, 60));

    const success = await downloadCertificatePdf(
      'certificate-print-area',
      certificate,
      {
        onProgress: (status) => {
          if (status === 'capturing') setDownloadStatusText('Capturing document...');
          else if (status === 'rendering') setDownloadStatusText('Generating high-res A4...');
          else if (status === 'saving') setDownloadStatusText('Downloading PDF...');
        },
      }
    );

    setIsExportingPdf(false);
    setIsDownloadingPdf(false);
    setDownloadStatusText(null);

    if (success) {
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    }
  };

  const company = certificate.companySnapshot || {
    companyName: 'PARIVAHAN SCRAPPERS',
    companySubtitle: 'A Unit OF Scrapping Yard Ltd.',
    address: 'B12, Dwarka, New Delhi.',
    phone: '8506925495',
    website: 'https://parivahan-scrappers.netlify.app/',
    signatoryTitle: 'Authorised Signatory',
  };

  return (
    <div className="flex flex-col items-center w-full max-w-full overflow-x-hidden pb-20 sm:pb-8">
      {/* Action Buttons Toolbar (Hidden when printing) */}
      {showActions && (
        <div className="no-print mb-3 flex flex-col items-stretch justify-between gap-3 w-full max-w-[800px] bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
          {/* Top Row: Navigation / Status */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {customerMode && onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer min-h-[38px]"
                >
                  ← Back
                </button>
              )}
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  certificate.status === 'SUPERSEDED'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : certificate.status === 'VALID' || certificate.status === 'ISSUED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                ● {certificate.status}
              </span>
              <span className="text-xs text-slate-500">
                Cert No: <strong className="text-slate-800 font-mono">{certificate.certificateNumber}</strong>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200" title="Permanent immutable database record">
                <Lock className="w-3 h-3 text-emerald-600" />
                🔒 IMMUTABLE ISSUED RECORD
              </span>
              {certificate.dataHash && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200" title={`SHA-256 Cryptographic Hash: ${certificate.dataHash}`}>
                  <KeyRound className="w-3 h-3 text-emerald-600" />
                  SHA-256: {certificate.dataHash.substring(0, 10)}...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Google Drive Cloud Backup Badge */}
              {driveStatus === 'BACKED_UP' ? (
                <a
                  href={driveFileUrl || `https://drive.google.com/file/d/${certificate.driveFileId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors"
                  title="Direct Google Drive Cloud Backup Verified"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Drive: Backed Up</span>
                  <ExternalLink className="w-3 h-3 text-emerald-600 ml-0.5" />
                </a>
              ) : driveStatus === 'UPLOADING' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                  <span>Backing up to Drive...</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleManualDriveBackup}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-300 hover:bg-blue-100 transition-colors cursor-pointer"
                  title="Upload copy to Google Drive 'Certificates' folder"
                >
                  <Cloud className="w-3.5 h-3.5 text-blue-600" />
                  <span>Backup to Drive</span>
                </button>
              )}

              <div className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                Official A4 Document {certificate.version && certificate.version > 1 ? `(v${certificate.version})` : ''}
              </div>
            </div>
          </div>

          {/* Drive Error Banner */}
          {driveError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-2.5 text-xs flex items-center justify-between gap-2">
              <span className="font-medium">{driveError}</span>
              <button
                type="button"
                onClick={() => setDriveError(null)}
                className="text-xs text-rose-600 hover:text-rose-900 font-bold px-1.5 py-0.5 rounded cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* SUPERSEDED RECORD BANNER */}
          {certificate.status === 'SUPERSEDED' && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 text-xs text-amber-950 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-900 block">
                  SUPERSEDED RECORD (PRESERVED FOR AUDIT)
                </span>
                <span className="text-amber-800 text-[11px]">
                  This certificate has been superseded by corrected certificate{' '}
                  <strong className="font-mono text-amber-950 font-bold">{certificate.supersededBy || 'in the registry'}</strong>.
                  All original issued information below remains permanently preserved.
                </span>
              </div>
            </div>
          )}

          {/* REISSUED FROM BANNER */}
          {certificate.correctedFrom && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-950 flex items-start gap-2">
              <History className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-blue-900 block">
                  CORRECTED / REISSUED CERTIFICATE (v{certificate.version || 2})
                </span>
                <span className="text-blue-800 text-[11px]">
                  Issued as an official clerical correction of original certificate{' '}
                  <strong className="font-mono text-blue-950 font-bold">{certificate.correctedFrom}</strong>.
                  Reason: <em>{certificate.correctionReason || 'Clerical correction'}</em>.
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100">
            {/* Primary Direct Download PDF Button */}
            <button
              id="btn-download-print-pdf"
              type="button"
              disabled={isDownloadingPdf}
              onClick={handleDownloadPdf}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-emerald-400 rounded-xl transition-all shadow-sm cursor-pointer min-h-[44px]"
              title={`Directly download certificate PDF named: ${pdfFileName}`}
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>{downloadStatusText || 'Generating PDF...'}</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>Downloaded: {pdfFileName}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-white" />
                  <span>Download Print (PDF)</span>
                </>
              )}
            </button>

            {/* Send to Email Button */}
            <button
              id="btn-send-email-top"
              type="button"
              onClick={() => setIsEmailModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold text-white bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-xl transition-all shadow-sm cursor-pointer min-h-[44px]"
              title="Send to Email (Official Dispatch from Parivahan Scrappers Desk)"
            >
              <Mail className="w-4 h-4 text-blue-100" />
              <span>Send to Email</span>
            </button>

            {/* Secondary Print Dialog Button */}
            <button
              id="btn-print-certificate"
              type="button"
              onClick={() => {
                if (onPrint) {
                  onPrint();
                } else {
                  window.print();
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-xl transition-colors cursor-pointer min-h-[44px]"
              title="Open browser printer dialog"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Print Dialog</span>
            </button>
          </div>
        </div>
      )}

      {/* 
        Certificate Canvas Container with Auto-Fit Responsive Scaling (Zero drag, perfect mobile fit)
      */}
      <div
        ref={containerRef}
        className="w-full max-w-full overflow-hidden flex flex-col items-center relative select-text touch-pan-y"
        style={{
          height:
            !isExportingPdf && scale < 1
              ? `${Math.ceil(1075 * scale)}px`
              : undefined,
        }}
      >
        <div
          className="origin-top flex justify-center transition-transform duration-100"
          style={{
            width: '760px',
            minWidth: '760px',
            transform: !isExportingPdf && scale < 1 ? `scale(${scale})` : undefined,
            marginBottom:
              !isExportingPdf && scale < 1
                ? `-${Math.round(1075 * (1 - scale))}px`
                : undefined,
          }}
        >
          <div
            id="certificate-print-area"
            className="certificate-a4-sheet relative w-[760px] bg-white text-[#0f2942] shadow-xl font-serif print:shadow-none print:m-0 print:w-full print:max-w-none box-border select-text"
            style={{
              aspectRatio: '1 / 1.414',
              minHeight: '1075px',
            }}
          >
        {/* Outermost Frame (Navy 2px border) */}
        <div className="absolute inset-4 border-[2px] border-[#0d2847] p-[4px] pointer-events-none z-20">
          {/* Inner Navy Line (1px border) */}
          <div className="w-full h-full border border-[#0d2847]" />
        </div>

        {/* Certificate Main Inner Content - Standard fixed 760px A4 layout */}
        <div className="relative z-10 flex flex-col justify-between h-full p-8 box-border">
          {/* Watermark in background */}
          <CertificateWatermark />

          <div className="relative z-10 flex flex-col">
            {/* 1. Header Section */}
            <div className="flex items-stretch justify-between pb-3">
              {/* Left Company Header */}
              <div className="flex-1 pr-4">
                <h1
                  className="text-[28px] font-black tracking-tight text-[#0d2847] uppercase leading-none"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  {company.companyName}
                </h1>
                <p className="text-[14px] font-bold text-slate-800 tracking-normal mt-1">
                  {company.companySubtitle}
                </p>

                <div className="mt-2 space-y-0.5 text-[11.5px] font-sans text-slate-700 font-medium">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#0d2847] shrink-0" />
                    <span>{company.address}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[#0d2847] shrink-0" />
                    <span>{company.phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[#0d2847] shrink-0" />
                    <span className="text-[#0d2847] hover:underline">
                      {company.website}
                    </span>
                  </div>
                </div>
              </div>

              {/* Thin Vertical Divider */}
              <div className="w-[1.5px] bg-[#0d2847] my-0.5" />

              {/* Right Eco Branding */}
              <div className="pl-6 flex items-center gap-3 shrink-0">
                <div className="text-emerald-700">
                  {/* Stylized leaf matching reference */}
                  <svg
                    viewBox="0 0 100 100"
                    className="w-12 h-12 fill-current text-emerald-800"
                  >
                    <path d="M50 10 C20 30 15 70 50 90 C85 70 80 30 50 10 Z" />
                    <path
                      d="M50 20 Q52 55 50 85"
                      stroke="#ffffff"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div
                  className="text-[13.5px] font-bold text-[#0d2847] leading-tight text-left"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  <div>Responsible</div>
                  <div>Recycling</div>
                  <div>Greener India</div>
                </div>
              </div>
            </div>

            {/* Horizontal Line Across */}
            <div className="h-[1.5px] bg-[#0d2847] w-full" />

            {/* Certificate No. & Date of Issue Row */}
            <div className="flex items-center justify-between py-2 text-[13px] font-bold text-[#0d2847]">
              <div>
                Certificate No. :{' '}
                <span className="font-extrabold tracking-wide">
                  {certificate.certificateNumber}
                </span>
              </div>
              <div>
                Date of Issue :{' '}
                <span className="font-extrabold tracking-wide">
                  {certificate.dateOfIssue}
                </span>
              </div>
            </div>

            {/* Main Title Banner Area */}
            <div className="text-center pt-1 pb-2">
              <h2
                className="text-[23px] font-extrabold uppercase tracking-wide text-[#0d2847]"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                VEHICLE SCRAPPING CERTIFICATE
              </h2>
              <p className="text-[9.5px] font-sans font-semibold tracking-[0.2em] text-[#1e3a5f] uppercase mt-0.5">
                ISSUED IN ACCORDANCE WITH APPLICABLE VEHICLE SCRAPPAGE REGULATIONS
              </p>

              {/* Small green leaf above pill */}
              <div className="flex justify-center mt-1 mb-0.5">
                <Leaf className="w-3.5 h-3.5 text-emerald-700 fill-emerald-700" />
              </div>

              {/* Green Sub-banner */}
              <div className="inline-block bg-[#e1eee6] border border-[#cfe2d6] px-4 py-0.5 text-[10.5px] font-sans font-bold tracking-[0.16em] text-[#144229] uppercase">
                RESPONSIBLE SCRAPPING FOR A GREENER TOMORROW
              </div>
            </div>

            {/* Preamble Certification Text */}
            <p className="text-[11px] leading-relaxed text-justify text-slate-800 font-serif mb-2.5">
              This is to certify that the motor vehicle mentioned below has been
              received by <span className="font-bold">{company.companyName}</span>{' '}
              ({company.companySubtitle}) for dismantling and environmentally
              sound recycling, in accordance with the provisions of the Vehicle
              Scrappage Policy and all applicable environmental regulations.
            </p>

            {/* SECTION A. OWNER DETAILS */}
            <div className="mb-2">
              <div className="bg-[#dce8f5] border border-[#b4cbe5] px-2.5 py-0.5 text-[12px] font-bold text-[#143e6d] uppercase tracking-wide">
                A. OWNER DETAILS
              </div>
              <div className="border-x border-b border-[#b4cbe5] text-[11.5px] font-sans">
                <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                  <div className="col-span-4 px-2.5 py-1 font-bold text-slate-800 bg-white">
                    Owner Name
                  </div>
                  <div className={`col-span-8 px-2.5 py-1 font-bold text-[#0d2847] border-l border-[#b4cbe5] uppercase bg-white break-words leading-tight ${certificate.ownerName && certificate.ownerName.length > 35 ? 'text-[10.5px]' : ''}`}>
                    {certificate.ownerName}
                  </div>
                </div>
                <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                  <div className="col-span-4 px-2.5 py-1 font-bold text-slate-800 bg-white">
                    Address
                  </div>
                  <div className="col-span-8 px-2.5 py-1 text-slate-700 border-l border-[#b4cbe5] bg-white break-words leading-snug">
                    {certificate.address || 'Not Provided'}
                  </div>
                </div>
                <div className="grid grid-cols-12">
                  <div className="col-span-4 px-2.5 py-1 font-bold text-slate-800 bg-white">
                    ID Proof Number
                  </div>
                  <div className="col-span-8 px-2.5 py-1 text-slate-700 border-l border-[#b4cbe5] bg-white break-words leading-tight">
                    {certificate.idProofNumber || 'Not Provided'}
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION B. VEHICLE DETAILS & QR CODE */}
            <div className="mb-2">
              <div className="bg-[#dce8f5] border border-[#b4cbe5] px-2.5 py-0.5 text-[12px] font-bold text-[#143e6d] uppercase tracking-wide">
                B. VEHICLE DETAILS
              </div>

              <div className="grid grid-cols-12 gap-2 mt-1">
                {/* Left Table (exact 9-col span: 75% width) */}
                <div className="col-span-9 border border-[#b4cbe5] text-[11px] font-sans">
                  {/* Row 1: Scrapping Registration Number */}
                  <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                    <div className="col-span-5 px-2 py-0.5 font-bold text-slate-800 bg-white whitespace-nowrap">
                      Registration No. for Scrapping
                    </div>
                    <div className="col-span-7 px-2 py-0.5 font-bold text-[#0d2847] border-l border-[#b4cbe5] bg-white break-words">
                      {certificate.scrappingRegistrationNumber || 'REG-C272829'}
                    </div>
                  </div>

                  {/* Row 2: Vehicle Reg. (RC) No. - Always rendered unconditionally */}
                  <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                    <div className="col-span-5 px-2 py-0.5 font-bold text-slate-800 bg-white whitespace-nowrap">
                      Vehicle Reg. (RC) No.
                    </div>
                    <div className="col-span-7 px-2 py-0.5 font-bold text-[#0d2847] border-l border-[#b4cbe5] uppercase bg-white break-words">
                      {certificate.vehicleRegistrationNumber || 'Not Provided'}
                    </div>
                  </div>

                  {/* Row 3: Chassis No. */}
                  <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                    <div className="col-span-5 px-2 py-0.5 font-bold text-slate-800 bg-white whitespace-nowrap">
                      Chassis No.
                    </div>
                    <div className="col-span-7 px-2 py-0.5 font-medium text-slate-800 border-l border-[#b4cbe5] bg-white font-mono break-words">
                      {maskChassisNumber(certificate.chassisNumber, certificate.showFullChassisEngine)}
                    </div>
                  </div>

                  {/* Row 4: Engine No. */}
                  <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                    <div className="col-span-5 px-2 py-0.5 font-bold text-slate-800 bg-white whitespace-nowrap">
                      Engine No.
                    </div>
                    <div className="col-span-7 px-2 py-0.5 font-medium text-slate-800 border-l border-[#b4cbe5] bg-white font-mono break-words">
                      {maskEngineNumber(certificate.engineNumber, certificate.showFullChassisEngine)}
                    </div>
                  </div>

                  {/* Row 5: Maker (Bike Brand) */}
                  <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                    <div className="col-span-5 px-2 py-0.5 font-bold text-slate-800 bg-white whitespace-nowrap">
                      Maker (Bike Brand)
                    </div>
                    <div className="col-span-7 px-2 py-0.5 font-medium text-slate-800 border-l border-[#b4cbe5] bg-white break-words">
                      {certificate.make || 'Two Wheeler'}
                    </div>
                  </div>

                  {/* Row 6: Model */}
                  <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                    <div className="col-span-5 px-2 py-0.5 font-bold text-slate-800 bg-white whitespace-nowrap">
                      Model
                    </div>
                    <div className="col-span-7 px-2 py-0.5 font-medium text-slate-800 border-l border-[#b4cbe5] bg-white break-words leading-tight">
                      {certificate.model || 'Standard'}
                    </div>
                  </div>

                  {/* Row 7: Location */}
                  <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                    <div className="col-span-5 px-2 py-0.5 font-bold text-slate-800 bg-white whitespace-nowrap">
                      Location
                    </div>
                    <div className="col-span-7 px-2 py-0.5 font-medium text-slate-800 border-l border-[#b4cbe5] bg-white break-words">
                      {certificate.location || 'Delhi NCR'}
                    </div>
                  </div>

                  {/* Row 8: Year of Manufacture */}
                  <div className="grid grid-cols-12 border-b border-[#b4cbe5]">
                    <div className="col-span-5 px-2 py-0.5 font-bold text-slate-800 bg-white whitespace-nowrap">
                      Year of Manufacture
                    </div>
                    <div className="col-span-7 px-2 py-0.5 font-medium text-slate-800 border-l border-[#b4cbe5] bg-white break-words">
                      {certificate.yearOfManufacture || '2012'}
                    </div>
                  </div>

                  {/* Row 9: Date of Handover */}
                  <div className="grid grid-cols-12">
                    <div className="col-span-5 px-2 py-0.5 font-bold text-slate-800 bg-white whitespace-nowrap">
                      Date of Handover
                    </div>
                    <div className="col-span-7 px-2 py-0.5 font-medium text-slate-800 border-l border-[#b4cbe5] bg-white break-words">
                      {certificate.dateOfHandover || certificate.dateOfIssue}
                    </div>
                  </div>
                </div>

                {/* Right QR Box (exact 3-col span: 25% width) */}
                <div
                  id="qr-verification-box"
                  onClick={() => {
                    if (onQrClick) {
                      onQrClick();
                    } else {
                      window.open(fullVerificationUrl, '_blank');
                    }
                  }}
                  title="Click to open verification and view certificate details"
                  className="col-span-3 border border-[#b4cbe5] p-2 flex flex-col items-center justify-center text-center bg-white cursor-pointer hover:border-emerald-600 hover:shadow-md transition-all group select-none"
                >
                  <div className="p-1 border border-slate-300 rounded-sm bg-white shadow-xs group-hover:ring-2 group-hover:ring-emerald-500/50 transition-all">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={`Verification QR for ${certificate.certificateNumber}`}
                        className="w-28 h-28 object-contain"
                      />
                    ) : (
                      <div className="w-28 h-28 bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                        Generating QR...
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] font-bold text-[#0d2847] leading-tight mt-1 group-hover:text-emerald-700 transition-colors uppercase tracking-tight">
                    Scan to Verify
                  </div>

                  {/* Leaf accent below QR text */}
                  <div className="flex items-center justify-center w-full my-1">
                    <div className="h-[1px] bg-slate-300 flex-1" />
                    <Leaf className="w-3 h-3 text-emerald-700 fill-emerald-700 mx-1.5" />
                    <div className="h-[1px] bg-slate-300 flex-1" />
                  </div>

                  <div className="text-[10px] font-sans font-bold text-[#0d2847]">
                    {certificate.certificateNumber}
                  </div>

                  {/* On-screen clickable hint (hidden when printing) */}
                  <div className="no-print mt-1 text-[8px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded opacity-80 group-hover:opacity-100 transition-opacity">
                    Click QR to Verify
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION C. TERMS & CERTIFICATIONS */}
            <div className="mb-2">
              <div className="bg-[#dce8f5] border border-[#b4cbe5] px-2 py-0.5 text-[11px] font-bold text-[#143e6d] uppercase tracking-wide">
                C. TERMS &amp; CERTIFICATIONS
              </div>

              <div className="space-y-1 mt-1.5 font-serif text-[9px] leading-snug text-slate-700">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-[#0d2847] text-white flex items-center justify-center text-[8px] font-sans font-bold mt-0.5">
                    1
                  </span>
                  <p className="flex-1">
                    Parivahan Scrappers undertakes to dismantle the vehicle and
                    process all recoverable metal, plastic, and fluid components
                    through authorized channels compliant with environmental and recycling standards.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-[#0d2847] text-white flex items-center justify-center text-[8px] font-sans font-bold mt-0.5">
                    2
                  </span>
                  <p className="flex-1">
                    Once accepted for scrapping, the vehicle, its chassis,
                    engine, or registered component parts shall not be restored, resold,
                    re-registered, or returned to road use in any jurisdiction.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-[#0d2847] text-white flex items-center justify-center text-[8px] font-sans font-bold mt-0.5">
                    3
                  </span>
                  <p className="flex-1">
                    This certificate, with the scrapping video record, constitutes
                    complete documentary proof of the vehicle disposal furnished to the customer.
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-[#0d2847] text-white flex items-center justify-center text-[8px] font-sans font-bold mt-0.5">
                    4
                  </span>
                  <p className="flex-1">
                    This certificate is issued as proof of handover and processing intent;
                    statutory de-registration remains the customer's responsibility with the transport authority.
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Signatory, Eco Badges & Quote Row */}
            <div className="grid grid-cols-12 gap-2 pt-1 pb-1.5 items-center">
              {/* Left Signatory */}
              <div className="col-span-5 flex flex-col justify-end">
                <div className="text-[11px] font-bold text-[#0d2847] leading-tight">
                  For {company.companyName}
                </div>
                <div className="text-[9.5px] text-slate-600 leading-tight">
                  ({company.companySubtitle})
                </div>

                {/* Signature Flourish SVG */}
                <div className="my-0.5 pl-0.5">
                  <AuthorizedSignature className="h-9 w-auto" />
                </div>

                <div className="border-t border-[#0d2847] pt-0.5 text-[10.5px] font-bold text-[#0d2847]">
                  {company.signatoryTitle || 'Authorised Signatory'}
                </div>
              </div>

              {/* Middle Eco Badges with Left Divider */}
              <div className="col-span-4 border-l border-slate-300 pl-2.5 flex flex-col justify-center space-y-1 text-[9px] font-sans text-slate-700">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full border border-emerald-800 flex items-center justify-center text-emerald-800 shrink-0">
                    <Leaf className="w-2.5 h-2.5 fill-emerald-800" />
                  </div>
                  <span className="font-medium">Environmentally Responsible</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full border border-emerald-800 flex items-center justify-center text-emerald-800 shrink-0">
                    <RefreshCw className="w-2 h-2 text-emerald-800" />
                  </div>
                  <span className="font-medium">Resource Conservation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full border border-emerald-800 flex items-center justify-center text-emerald-800 shrink-0">
                    <Globe className="w-2.5 h-2.5 text-emerald-800" />
                  </div>
                  <span className="font-medium">Sustainable Tomorrow</span>
                </div>
              </div>

              {/* Right Quote Box */}
              <div className="col-span-3 bg-[#edf7f2] border border-[#cfdfd6] p-2 text-center flex flex-col items-center justify-center h-full rounded-xs">
                <p className="text-[10.5px] font-serif font-bold text-[#143828] leading-tight">
                  End-of-Life
                  <br />
                  Vehicles Deserve
                  <br />a Better Future.
                </p>
                <div className="w-6 h-[1.5px] bg-[#143828] mt-1" />
              </div>
            </div>
          </div>

          {/* 3. Footer Bar */}
          <div className="relative z-10 pt-1.5">
            <div className="h-[1px] bg-[#0d2847]/40 w-full mb-1" />
            <div className="flex flex-wrap items-center justify-between gap-1 text-[8.5px] text-slate-600 font-sans text-center leading-tight">
              <div className="flex items-center gap-1">
                <Laptop className="w-3 h-3 text-[#0d2847] shrink-0" />
                <span>Computer Generated Certificate &bull; Digitally Verified</span>
              </div>
              <span className="font-bold text-[#0d2847]">Scan QR Code to Verify</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

    {/* Bottom Download & Print Action Bar (Desktop / Tablet view) */}
    {showActions && (
      <div className="no-print hidden sm:flex mt-2 mb-6 items-center justify-center gap-3 w-full max-w-[800px] px-2">
        <button
          id="btn-bottom-download-pdf"
          type="button"
          disabled={isDownloadingPdf}
          onClick={handleDownloadPdf}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-emerald-400 rounded-xl transition-all shadow-md cursor-pointer min-h-[44px]"
        >
          {isDownloadingPdf ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>{downloadStatusText || 'Generating PDF...'}</span>
            </>
          ) : downloadSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>Downloaded: {pdfFileName}</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 text-white" />
              <span>Download Print (PDF)</span>
            </>
          )}
        </button>

        <button
          id="btn-bottom-send-email"
          type="button"
          onClick={() => setIsEmailModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-xl shadow-md transition-all cursor-pointer min-h-[44px]"
          title="Send to Email (Official Dispatch from Parivahan Scrappers Desk)"
        >
          <Mail className="w-4 h-4 text-blue-100" />
          <span>Send to Email</span>
        </button>

        <button
          id="btn-bottom-print-dialog"
          type="button"
          onClick={() => {
            if (onPrint) onPrint();
            else window.print();
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-xl border border-slate-300 shadow-xs transition-colors cursor-pointer min-h-[44px]"
        >
          <Printer className="w-4 h-4 text-slate-600" />
          <span>Print Dialog</span>
        </button>
      </div>
    )}

    {/* Mobile Sticky Bottom Floating Action Dock (Quick Thumb Actions, Zero Drag) */}
    {showActions && (
      <div
        id="mobile-bottom-actions-dock"
        className="no-print sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2 shadow-2xl flex items-center gap-2"
      >
        <button
          id="btn-mobile-dock-download"
          type="button"
          disabled={isDownloadingPdf}
          onClick={handleDownloadPdf}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-emerald-400 rounded-xl shadow-sm transition-all min-h-[42px] cursor-pointer"
        >
          {isDownloadingPdf ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              <span className="truncate text-[11px]">{downloadStatusText || 'Preparing...'}</span>
            </>
          ) : downloadSuccess ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
              <span>Downloaded!</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </>
          )}
        </button>

        <button
          id="btn-mobile-dock-email"
          type="button"
          onClick={() => setIsEmailModalOpen(true)}
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-xl transition-colors min-h-[42px] cursor-pointer"
        >
          <Mail className="w-3.5 h-3.5 text-blue-100" />
          <span>Email</span>
        </button>

        <button
          id="btn-mobile-dock-print"
          type="button"
          onClick={() => {
            if (onPrint) onPrint();
            else window.print();
          }}
          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 rounded-xl transition-colors min-h-[42px] cursor-pointer"
          title="Print Certificate"
        >
          <Printer className="w-3.5 h-3.5 text-slate-600" />
          <span>Print</span>
        </button>
      </div>
    )}

    {/* Send to Email Dialog Modal */}
    <SendEmailModal
      isOpen={isEmailModalOpen}
      onClose={() => setIsEmailModalOpen(false)}
      certificate={certificate}
      verificationUrl={fullVerificationUrl}
    />
  </div>
  );
};
