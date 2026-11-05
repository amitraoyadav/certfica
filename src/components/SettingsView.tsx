import React, { useState, useEffect } from 'react';
import {
  Building2,
  Hash,
  Lock,
  Save,
  Database,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import type { SystemSettings } from '../types';
import { UploadCertificatesModal } from './UploadCertificatesModal';

interface SettingsViewProps {
  onSettingsSaved?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSettingsSaved }) => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => setSettings(data))
      .catch((err) => console.error('Error loading settings:', err));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [name]: type === 'number' ? parseInt(value, 10) || 0 : value,
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const payload: any = { ...settings };

      const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(coreToken ? { 'x-main-admin-token': coreToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to update settings');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
      if (onSettingsSaved) onSettingsSaved();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = () => {
    const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
    fetch('/api/certificates', {
      headers: coreToken ? { 'x-main-admin-token': coreToken } : {},
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error('Main Core Admin authorization required');
        return res.json();
      })
      .then((certs) => {
        const exportBlob = new Blob(
          [JSON.stringify({ settings, certificates: certs, exportedAt: new Date().toISOString() }, null, 2)],
          { type: 'application/json' }
        );
        const url = URL.createObjectURL(exportBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `parivahan-scrappers-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => setErrorMessage('Export failed: ' + err.message));
  };

  if (!settings) {
    return (
      <div className="p-12 text-center text-slate-500">
        <div className="animate-spin w-8 h-8 border-4 border-[#0d2847] border-t-transparent rounded-full mx-auto mb-2" />
        Loading system configuration...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <h2 className="text-xl sm:text-2xl font-bold font-serif text-[#0d2847]">
          Company &amp; Registry Configuration
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Configure organization identity, sequence counters, and security credentials.
        </p>

        {/* Data Preservation Guarantee Banner */}
        <div className="mt-4 p-3.5 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-xs text-blue-900 leading-relaxed">
          <Info className="w-4 h-4 text-[#0d2847] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Data Preservation Guarantee: </span>
            Every issued certificate maintains its own immutable company snapshot. Updating
            settings below only applies to new certificates and will never alter previously issued
            certificates (e.g. PS-2026-0001).
          </div>
        </div>

        {saveSuccess && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Settings updated successfully. Future certificates will use these settings.
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800 font-semibold">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          {/* Section 1: Company Profile */}
          <div>
            <h3 className="text-sm font-bold text-[#0d2847] uppercase tracking-wide border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              Company Identity (Header Information)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company Name
                </label>
                <input
                  id="setting-companyName"
                  type="text"
                  name="companyName"
                  value={settings.companyName}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company Subtitle
                </label>
                <input
                  id="setting-companySubtitle"
                  type="text"
                  name="companySubtitle"
                  value={settings.companySubtitle}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address
                </label>
                <input
                  id="setting-address"
                  type="text"
                  name="address"
                  value={settings.address}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Phone Number
                </label>
                <input
                  id="setting-phone"
                  type="text"
                  name="phone"
                  value={settings.phone}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Website URL
                </label>
                <input
                  id="setting-website"
                  type="text"
                  name="website"
                  value={settings.website}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Authorized Signatory Title
                </label>
                <input
                  id="setting-signatoryTitle"
                  type="text"
                  name="signatoryTitle"
                  value={settings.signatoryTitle}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Sequential Numbering Counters */}
          <div>
            <h3 className="text-sm font-bold text-[#0d2847] uppercase tracking-wide border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
              <Hash className="w-4 h-4 text-emerald-600" />
              Sequential Numbering Configuration
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Certificate Number Prefix
                </label>
                <input
                  id="setting-certificatePrefix"
                  type="text"
                  name="certificatePrefix"
                  value={settings.certificatePrefix}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Example: "PS-2026-"
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Next Certificate Sequence Number
                </label>
                <input
                  id="setting-certificateNextSeq"
                  type="number"
                  name="certificateNextSeq"
                  value={settings.certificateNextSeq}
                  onChange={handleChange}
                  min={1}
                  required
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Current: {settings.certificatePrefix}{String(settings.certificateNextSeq).padStart(4, '0')}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Scrapping Registration Prefix
                </label>
                <input
                  id="setting-scrappingPrefix"
                  type="text"
                  name="scrappingPrefix"
                  value={settings.scrappingPrefix}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Example: "RS-2026-"
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Next Scrapping Registration Sequence
                </label>
                <input
                  id="setting-scrappingNextSeq"
                  type="number"
                  name="scrappingNextSeq"
                  value={settings.scrappingNextSeq}
                  onChange={handleChange}
                  min={1}
                  required
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Current: {settings.scrappingPrefix}{String(settings.scrappingNextSeq).padStart(4, '0')}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Admin Credentials (Password Change Disabled) */}
          <div>
            <h3 className="text-sm font-bold text-[#0d2847] uppercase tracking-wide border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              Admin Security &amp; Access Control
            </h3>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-[#0d2847] block">
                    Fixed Administrator Credentials
                  </span>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Username: <strong className="font-mono text-slate-800">pscrappers</strong> • Password changes are disabled.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <Lock className="w-3.5 h-3.5" />
                  Password Modification Locked
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Security Policy: To prevent unauthorized credential hijacking, credentials cannot be altered from this panel. Only authorized login via the login modal is allowed.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-600" />
                Upload / Bulk Import Certificates
              </button>

              <button
                type="button"
                onClick={handleExportData}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Backup / Export Database (JSON)
              </button>
            </div>

            <button
              id="btn-save-settings"
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-[#0d2847] hover:bg-[#163a63] rounded-md transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving Settings...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>

      <UploadCertificatesModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onImportSuccess={() => {
          if (onSettingsSaved) onSettingsSaved();
        }}
      />
    </div>
  );
};
