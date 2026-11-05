import React, { useState, useEffect } from 'react';
import {
  Mail,
  X,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Send,
  Building2,
} from 'lucide-react';
import type { Certificate } from '../types';
import {
  OFFICIAL_SENDER_EMAIL,
  OFFICIAL_SENDER_NAME,
  OFFICIAL_RECORDS_EMAIL,
  generateCertificateEmailSubject,
  generateCertificateEmailBody,
  buildMailtoUrl,
} from '../utils/emailTemplate';

interface SendEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: Certificate;
  verificationUrl: string;
}

export const SendEmailModal: React.FC<SendEmailModalProps> = ({
  isOpen,
  onClose,
  certificate,
  verificationUrl,
}) => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [includeOfficialCc, setIncludeOfficialCc] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const subject = generateCertificateEmailSubject(certificate);
  const body = generateCertificateEmailBody(certificate, verificationUrl);

  const handleOpenMailClient = () => {
    const mailto = buildMailtoUrl({
      to: recipientEmail.trim(),
      cc: includeOfficialCc ? OFFICIAL_SENDER_EMAIL : undefined,
      bcc: OFFICIAL_RECORDS_EMAIL,
      subject,
      body,
    });

    window.location.href = mailto;
    onClose();
  };

  const handleCopyBody = async () => {
    try {
      await navigator.clipboard.writeText(
        `Subject: ${subject}\n\n${body}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
    }
  };

  return (
    <div
      id="modal-send-email"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-send-email-title"
      >
        {/* Header */}
        <div className="bg-[#0d2847] px-5 py-4 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="modal-send-email-title"
                className="font-serif font-bold text-base sm:text-lg leading-tight"
              >
                Send Certificate via Email
              </h3>
              <p className="text-[11px] text-slate-300">
                Official Dispatch • Certificate #{certificate.certificateNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700">
          {/* Official Sender Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-emerald-950 block">
                Official Dispatch Sender:
              </span>
              <span className="font-mono text-emerald-800 font-semibold block text-[11.5px] mt-0.5">
                {OFFICIAL_SENDER_NAME} &lt;{OFFICIAL_SENDER_EMAIL}&gt;
              </span>
              <p className="text-emerald-700 text-[11px] mt-1">
                Mail client will compose official documentation with verified unit details from Parivahan Scrappers.
              </p>
            </div>
          </div>

          {/* Recipient Input */}
          <div>
            <label
              htmlFor="recipient-email"
              className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1"
            >
              Recipient Email Address (Customer / RTO Desk):
            </label>
            <div className="relative">
              <input
                id="recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="e.g. customer@gmail.com (or leave blank to pick in mail client)"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#0d2847] focus:bg-white transition-all"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Optional: If left blank, you can choose or select contacts in your email app.
            </p>
          </div>

          {/* Official CC Checkbox */}
          <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <input
              id="checkbox-official-cc"
              type="checkbox"
              checked={includeOfficialCc}
              onChange={(e) => setIncludeOfficialCc(e.target.checked)}
              className="w-4 h-4 rounded text-[#0d2847] focus:ring-[#0d2847] border-slate-300 cursor-pointer"
            />
            <label
              htmlFor="checkbox-official-cc"
              className="text-xs text-slate-700 cursor-pointer select-none"
            >
              Keep official record copy via CC to{' '}
              <strong className="font-mono text-slate-800">{OFFICIAL_SENDER_EMAIL}</strong>
            </label>
          </div>

          {/* Subject Preview */}
          <div>
            <span className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
              Email Subject Line:
            </span>
            <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 break-words">
              {subject}
            </div>
          </div>

          {/* Body Preview */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Email Message Content (Pre-filled):
              </span>
              <button
                type="button"
                onClick={handleCopyBody}
                className="text-[11px] font-semibold text-[#0d2847] hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            </div>
            <textarea
              readOnly
              rows={6}
              value={body}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700 resize-none focus:outline-hidden"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyBody}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-600" />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            <button
              id="btn-confirm-open-mail-client"
              type="button"
              onClick={handleOpenMailClient}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-blue-700 hover:bg-blue-600 active:bg-blue-800 rounded-xl shadow-sm transition-colors cursor-pointer min-h-[42px]"
            >
              <Send className="w-4 h-4" />
              <span>Open Mail Client</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
