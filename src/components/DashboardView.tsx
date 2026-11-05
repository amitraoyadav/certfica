import React, { useState, useEffect } from 'react';
import {
  FileText,
  PlusCircle,
  ShieldCheck,
  Award,
  Calendar,
  Hash,
  ArrowRight,
  Eye,
  Printer,
  CheckCircle2,
  Cloud,
  Download,
  RotateCcw,
  Archive,
  Settings,
  AlertTriangle,
  RefreshCw,
  Database,
  Layers,
  Check,
  Lock,
  KeyRound,
} from 'lucide-react';
import type { DashboardStats, Certificate, DataIntegrityReport } from '../types';
import { isDriveConnected, googleDriveSignIn, auth } from '../services/googleDriveAuth';
import { syncAllCertificatesFromGoogleDrive } from '../services/googleDriveService';
import { GoogleDriveSyncSection } from './GoogleDriveSyncSection';
import { FullDatabaseSyncMigrationCentre } from './FullDatabaseSyncMigrationCentre';

interface DashboardViewProps {
  stats: DashboardStats | null;
  recentCertificates: Certificate[];
  onNavigate: (tab: string) => void;
  onViewCertificate: (cert: Certificate) => void;
  onOpenImport: () => void;
  onOpenRestore: () => void;
  onOpenIntegrityCheck: () => void;
  onRefreshData?: () => void;
  isMainAdmin?: boolean;
  onRequestMainAdmin?: () => void;
  onLogoutMainAdmin?: () => void;
  onMainAdminPasswordChanged?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  recentCertificates,
  onNavigate,
  onViewCertificate,
  onOpenImport,
  onOpenRestore,
  onOpenIntegrityCheck,
  onRefreshData,
  isMainAdmin = false,
  onRequestMainAdmin,
  onLogoutMainAdmin,
  onMainAdminPasswordChanged,
}) => {
  const [driveConnected, setDriveConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now');
  const [syncErrors, setSyncErrors] = useState<number>(0);
  const [missingPdfs, setMissingPdfs] = useState<number>(0);
  const [isBackingUpNow, setIsBackingUpNow] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [driveSyncStatusText, setDriveSyncStatusText] = useState<string | null>(null);
  const [driveSyncAlert, setDriveSyncAlert] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Change Main Admin Password form state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeAlert, setPasswordChangeAlert] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    setDriveConnected(isDriveConnected());
    const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
    // Fetch quick integrity numbers for dashboard stat cards
    fetch('/api/integrity-check', {
      headers: coreToken ? { 'x-main-admin-token': coreToken } : {},
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DataIntegrityReport | null) => {
        if (data) {
          setSyncErrors(data.syncErrors || 0);
          setMissingPdfs(data.missingPdf || 0);
        }
      })
      .catch(() => {});
  }, [recentCertificates]);

  const handleChangeMainAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeAlert(null);

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      setPasswordChangeAlert({
        type: 'error',
        message: 'All password fields are required.',
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordChangeAlert({
        type: 'error',
        message: 'New password and confirmation do not match.',
      });
      return;
    }

    if (newPassword.length < 12) {
      setPasswordChangeAlert({
        type: 'error',
        message: 'New password must be at least 12 characters long.',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
      const res = await fetch('/api/auth/change-main-admin-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(coreToken ? { 'x-main-admin-token': coreToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          oldPassword,
          newPassword,
          confirmNewPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Failed to change Main Core Admin password.');
      }

      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordChangeAlert({
        type: 'success',
        message:
          data.message ||
          'Main Core Admin password updated in Firestore. Previous sessions have been invalidated.',
      });

      if (onMainAdminPasswordChanged) {
        setTimeout(() => {
          onMainAdminPasswordChanged();
        }, 1800);
      }
    } catch (err: any) {
      setPasswordChangeAlert({
        type: 'error',
        message: err.message || 'Could not update Main Core Admin password.',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleBackupNowClick = async () => {
    setIsBackingUpNow(true);
    setBackupMessage(null);
    try {
      const token =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        '';
      const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
      const res = await fetch('/api/backups/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(coreToken ? { 'x-main-admin-token': coreToken } : {}),
        },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Backup failed');

      // Trigger file download
      const blob = new Blob([JSON.stringify(recentCertificates, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || 'certificate-database-backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setBackupMessage(`Backup successfully created: ${data.filename}`);
      setTimeout(() => setBackupMessage(null), 5000);
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setBackupMessage(`Backup failed: ${err.message}`);
    } finally {
      setIsBackingUpNow(false);
    }
  };

  const handleQuickDriveSync = async () => {
    setIsDriveSyncing(true);
    setDriveSyncAlert(null);
    setDriveSyncStatusText('Accessing Google Drive archive & storage vault...');
    try {
      if (!isDriveConnected()) {
        const res = await googleDriveSignIn();
        if (!res) throw new Error('Please sign in with Google to recover certificates.');
        setDriveConnected(true);
      }
      const result = await syncAllCertificatesFromGoogleDrive(recentCertificates, (status, percent) => {
        setDriveSyncStatusText(`[${percent}%] ${status}`);
      });
      if (onRefreshData) onRefreshData();
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDriveSyncAlert({
        type: 'success',
        message: `Recovery successful! Recovered ${result.recoveredDrivePdfs} PDFs from Drive, ${result.recoveredDriveJsonCerts} from Drive Backups, and ${result.recoveredStorageCerts} from local storage. Total in database: ${result.totalNowInDatabase} certificates.`,
      });
    } catch (err: any) {
      setDriveSyncAlert({
        type: 'error',
        message: err.message || 'Google Drive recovery sync failed.',
      });
    } finally {
      setIsDriveSyncing(false);
      setDriveSyncStatusText(null);
    }
  };

  const totalCerts = stats ? stats.totalCertificates : recentCertificates.length;
  const latestCertNo = stats
    ? stats.latestCertificateNumber
    : recentCertificates[0]?.certificateNumber || 'PS/26/R1000';

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="bg-gradient-to-r from-[#0d2847] to-[#1a3e68] rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Official Vehicle Scrapping Management System &bull; Immutable Database
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif">
            PARIVAHAN SCRAPPERS ADMIN CONSOLE
          </h1>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl">
            A Unit OF Scrapping Yard Ltd. • Persistent digital certificate issuance, automated
            Google Drive synchronization, and zero-loss archival.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleQuickDriveSync}
            disabled={isDriveSyncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs sm:text-sm font-extrabold shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-slate-950 ${isDriveSyncing ? 'animate-spin' : ''}`} />
            <span>{isDriveSyncing ? 'SYNCING...' : 'SYNC ALL FROM GOOGLE DRIVE'}</span>
          </button>
          <button
            id="btn-dash-create-cert"
            type="button"
            onClick={() => onNavigate('create')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            CREATE CERTIFICATE
          </button>
          <button
            id="btn-dash-verify-cert"
            type="button"
            onClick={() => onNavigate('verify')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs sm:text-sm font-bold border border-white/20 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            PUBLIC VERIFY
          </button>
          {onLogoutMainAdmin && (
            <button
              id="btn-dash-lock-core-admin"
              type="button"
              onClick={onLogoutMainAdmin}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs sm:text-sm font-bold border border-rose-400/30 transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              LOCK CORE ADMIN
            </button>
          )}
        </div>
      </div>

      {/* Cloud Recovery Progress / Feedback Notification */}
      {driveSyncStatusText && (
        <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 flex items-center gap-2.5 font-medium shadow-xs">
          <RefreshCw className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
          <span>{driveSyncStatusText}</span>
        </div>
      )}

      {driveSyncAlert && (
        <div
          className={`p-4 rounded-xl text-xs sm:text-sm flex items-center gap-3 shadow-xs ${
            driveSyncAlert.type === 'success'
              ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border border-rose-300 text-rose-900'
          }`}
        >
          {driveSyncAlert.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="font-medium">{driveSyncAlert.message}</span>
        </div>
      )}

      {/* 9 Admin Action Buttons (User Requirement 18) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Quick Administrative Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2">
          {/* 1. CREATE CERTIFICATE */}
          <button
            type="button"
            onClick={() => onNavigate('create')}
            className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
          >
            <PlusCircle className="w-4 h-4 text-emerald-700" />
            <span className="leading-tight">CREATE CERT</span>
          </button>

          {/* 2. ALL CERTIFICATES */}
          <button
            type="button"
            onClick={() => onNavigate('certificates')}
            className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-900 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
          >
            <FileText className="w-4 h-4 text-blue-700" />
            <span className="leading-tight">ALL CERTS</span>
          </button>

          {/* 3. IMPORT OLD CERTIFICATES */}
          <button
            type="button"
            onClick={onOpenImport}
            className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
          >
            <Download className="w-4 h-4 text-indigo-700 rotate-180" />
            <span className="leading-tight">IMPORT OLD</span>
          </button>

          {/* 4. GOOGLE DRIVE SYNC */}
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('drive-sync-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-2.5 rounded-xl border border-sky-200 bg-sky-50/70 hover:bg-sky-100 text-sky-900 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
          >
            <Cloud className="w-4 h-4 text-sky-700" />
            <span className="leading-tight">DRIVE SYNC</span>
          </button>

          {/* 5. BACKUP NOW */}
          <button
            type="button"
            onClick={handleBackupNowClick}
            disabled={isBackingUpNow}
            className="p-2.5 rounded-xl border border-teal-200 bg-teal-50/70 hover:bg-teal-100 text-teal-900 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
          >
            <Download className="w-4 h-4 text-teal-700" />
            <span className="leading-tight">{isBackingUpNow ? 'BACKING...' : 'BACKUP NOW'}</span>
          </button>

          {/* 6. RESTORE */}
          <button
            type="button"
            onClick={onOpenRestore}
            className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-900 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
          >
            <RotateCcw className="w-4 h-4 text-amber-700" />
            <span className="leading-tight">RESTORE</span>
          </button>

          {/* 7. DATA INTEGRITY CHECK */}
          <button
            type="button"
            onClick={onOpenIntegrityCheck}
            className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100 text-purple-900 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
          >
            <ShieldCheck className="w-4 h-4 text-purple-700" />
            <span className="leading-tight">INTEGRITY</span>
          </button>

          {/* 8. ARCHIVE */}
          <button
            type="button"
            onClick={() => onNavigate('certificates')}
            className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
          >
            <Archive className="w-4 h-4 text-slate-700" />
            <span className="leading-tight">ARCHIVE</span>
          </button>

          {/* 9. ADMIN SETTINGS */}
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
          >
            <Settings className="w-4 h-4 text-slate-700" />
            <span className="leading-tight">SETTINGS</span>
          </button>
        </div>

        {backupMessage && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{backupMessage}</span>
          </div>
        )}
      </div>

      {/* 7 Mandatory Stat Cards (User Requirement 18) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* CARD 1: TOTAL CERTIFICATES */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            TOTAL CERTIFICATES
          </p>
          <p className="text-2xl font-bold text-[#0d2847] mt-1 font-mono">
            {totalCerts}
          </p>
          <p className="text-[10px] text-emerald-700 font-semibold mt-1">
            Permanent DB Records
          </p>
        </div>

        {/* CARD 2: LAST CERTIFICATE NUMBER */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            LAST CERTIFICATE NO.
          </p>
          <p className="text-sm font-bold text-[#0d2847] mt-2 font-mono truncate">
            {latestCertNo}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Random unique allocation
          </p>
        </div>

        {/* CARD 3: LAST SYNC */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            LAST SYNC
          </p>
          <p className="text-sm font-bold text-[#0d2847] mt-2 font-mono">
            {lastSyncTime}
          </p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-1">
            Live local sync
          </p>
        </div>

        {/* CARD 4: GOOGLE DRIVE STATUS */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            DRIVE STATUS
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                driveConnected ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
            />
            <span className="text-xs font-bold text-slate-800">
              {driveConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Cloud backup layer
          </p>
        </div>

        {/* CARD 5: BACKUP STATUS */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            BACKUP STATUS
          </p>
          <p className="text-xs font-bold text-emerald-700 mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            PROTECTED
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Versioned JSON snapshots
          </p>
        </div>

        {/* CARD 6: MISSING CERTIFICATES */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            MISSING CERTS
          </p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            0
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            0 gaps in registry
          </p>
        </div>

        {/* CARD 7: SYNC ERRORS */}
        <div
          className={`rounded-xl p-4 border shadow-xs ${
            syncErrors > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            SYNC ERRORS
          </p>
          <p
            className={`text-2xl font-bold mt-1 font-mono ${
              syncErrors > 0 ? 'text-rose-700' : 'text-slate-700'
            }`}
          >
            {syncErrors}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            {syncErrors === 0 ? 'Healthy' : 'Needs attention'}
          </p>
        </div>
      </div>

      {/* FULL DATABASE SYNC & MIGRATION CENTRE (Section 6) */}
      <FullDatabaseSyncMigrationCentre onDataChanged={onRefreshData} isMainAdmin={isMainAdmin} />

      {/* Google Drive Sync Section */}
      <div id="drive-sync-section">
        <GoogleDriveSyncSection
          certificates={recentCertificates}
          onRefreshData={onRefreshData}
          onOpenImport={onOpenImport}
          onOpenRestore={onOpenRestore}
          onOpenIntegrityCheck={onOpenIntegrityCheck}
        />
      </div>

      {/* Recent Certificates Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0d2847]">
              Recently Issued Certificates
            </h2>
            <p className="text-xs text-slate-500">
              Verified digital records committed to permanent storage
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('certificates')}
            className="text-xs font-semibold text-[#0d2847] hover:text-emerald-700 flex items-center gap-1 cursor-pointer transition-colors"
          >
            View All Records
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-[11px] uppercase font-semibold border-b border-slate-200">
                <th className="py-3 px-4">Certificate No.</th>
                <th className="py-3 px-4">Scrapping Reg. No.</th>
                <th className="py-3 px-4">Owner Name</th>
                <th className="py-3 px-4">Vehicle Model</th>
                <th className="py-3 px-4">Date of Handover</th>
                <th className="py-3 px-4">Drive Backup</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {recentCertificates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No certificates recorded yet. Click "CREATE CERTIFICATE" to begin.
                  </td>
                </tr>
              ) : (
                recentCertificates.slice(0, 5).map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#0d2847]">
                      {cert.certificateNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 font-medium">
                      {cert.scrappingRegistrationNumber}
                    </td>
                    <td className="py-3 px-4 font-semibold uppercase">
                      {cert.ownerName}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <div>{cert.model}</div>
                      <div className="text-[10px] text-slate-400">{cert.make}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      {cert.dateOfHandover}
                    </td>
                    <td className="py-3 px-4">
                      {cert.driveBackupStatus === 'BACKED_UP' || cert.driveFileId ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Backed Up
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Local Only</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
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
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewCertificate(cert)}
                          className="px-2.5 py-1 text-xs font-semibold text-[#0d2847] bg-slate-100 hover:bg-slate-200 rounded flex items-center gap-1 transition-colors cursor-pointer"
                          title="View Certificate"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onViewCertificate(cert);
                            setTimeout(() => window.print(), 300);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded flex items-center gap-1 transition-colors cursor-pointer"
                          title="Print Certificate"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Change Main Admin Password Section (Main Core Admin Only) */}
      <div
        id="change-main-admin-password-section"
        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-5 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0d2847]">
                Change Main Admin Password
              </h2>
              <p className="text-xs text-slate-500">
                Update the Main Core Admin password stored as a salted cryptographic hash in Firestore. Minimum 12 characters.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            MAIN_CORE_ADMIN Protected
          </span>
        </div>

        {passwordChangeAlert && (
          <div
            className={`mb-4 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
              passwordChangeAlert.type === 'success'
                ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border border-rose-300 text-rose-900'
            }`}
          >
            {passwordChangeAlert.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{passwordChangeAlert.message}</span>
          </div>
        )}

        <form onSubmit={handleChangeMainAdminPassword} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label
              htmlFor="input-old-main-admin-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Old Password *
            </label>
            <input
              id="input-old-main-admin-password"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter current Core Admin password"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="input-new-main-admin-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              New Password (min 12 chars) *
            </label>
            <input
              id="input-new-main-admin-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
              placeholder="At least 12 characters"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="input-confirm-main-admin-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Confirm New Password *
            </label>
            <input
              id="input-confirm-main-admin-password"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
              minLength={12}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0d2847] outline-none"
            />
          </div>

          <div className="sm:col-span-3 flex items-center justify-between pt-2">
            <p className="text-[11px] text-slate-500">
              Saving a new password immediately invalidates all active Main Core Admin sessions and requires re-authentication.
            </p>
            <button
              id="btn-save-main-admin-password"
              type="submit"
              disabled={isChangingPassword}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0d2847] hover:bg-[#163a63] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-3.5 h-3.5 text-amber-300" />
              <span>{isChangingPassword ? 'Saving New Password...' : 'Save New Password'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
