import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileJson,
  Upload,
  ShieldCheck,
  Calendar,
  Database,
  ArrowRight,
} from 'lucide-react';
import type { DatabaseBackupInfo } from '../types';
import { getDriveAccessToken, isDriveConnected } from '../services/googleDriveAuth';
import { getOrCreateDriveFolderHierarchy } from '../services/googleDriveService';
import { getAuthHeaders } from '../config/apiConfig';

interface RestoreBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess?: () => void;
}

interface RestoreReport {
  totalInBackup: number;
  addedCount: number;
  skippedExisting: number;
  totalInDatabase: number;
}

export const RestoreBackupModal: React.FC<RestoreBackupModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [backups, setBackups] = useState<DatabaseBackupInfo[]>([]);
  const [selectedBackupFilename, setSelectedBackupFilename] = useState<string>('');
  const [uploadedJsonContent, setUploadedJsonContent] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreReport, setRestoreReport] = useState<RestoreReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchBackups = async () => {
    setIsLoadingBackups(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/backups', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
        if (data.backups && data.backups.length > 0) {
          setSelectedBackupFilename(data.backups[0].filename);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load backup snapshots.');
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBackups();
    }
  }, [isOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          if (!Array.isArray(parsed)) {
            throw new Error('Backup file must contain a JSON array of certificates.');
          }
          setUploadedJsonContent(content);
          setErrorMessage(null);
        } catch (err: any) {
          setErrorMessage('Invalid JSON backup file: ' + err.message);
          setUploadedJsonContent(null);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleStartRestore = async () => {
    if (!uploadedJsonContent && !selectedBackupFilename) {
      setErrorMessage('Please select a versioned backup snapshot or upload a JSON backup file.');
      return;
    }

    setIsRestoring(true);
    setErrorMessage(null);
    setRestoreReport(null);

    try {
      const bodyPayload = uploadedJsonContent
        ? { jsonContent: uploadedJsonContent }
        : { filename: selectedBackupFilename };

      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to restore backup.');
      }

      setRestoreReport({
        totalInBackup: data.totalInBackup,
        addedCount: data.addedCount,
        skippedExisting: data.skippedExisting,
        totalInDatabase: data.totalInDatabase,
      });

      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Restore process failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0d2847] to-[#1e4a7a] p-4 sm:p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">
                Restore &amp; Recover Certificates
              </h3>
              <p className="text-xs text-slate-300">
                Additive recovery from versioned database backups (Zero data loss guarantee)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Additive Guarantee Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900 leading-relaxed">
              <span className="font-bold">Additive Protection:</span> Restoring from a backup will{' '}
              <strong>NEVER overwrite or delete</strong> any existing certificates. Only certificates missing
              from the active registry will be added back. Existing certificates remain 100% untouched.
            </div>
          </div>

          {/* Success Report */}
          {restoreReport && (
            <div className="p-4 bg-emerald-500/10 border-2 border-emerald-500 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Restore Operation Completed Successfully!
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">In Backup</p>
                  <p className="text-lg font-bold text-slate-800">{restoreReport.totalInBackup}</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                  <p className="text-[10px] text-emerald-700 uppercase font-semibold">Added New</p>
                  <p className="text-lg font-bold text-emerald-600">+{restoreReport.addedCount}</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Skipped Existing</p>
                  <p className="text-lg font-bold text-slate-600">{restoreReport.skippedExisting}</p>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-blue-200">
                  <p className="text-[10px] text-blue-700 uppercase font-semibold">Total Database</p>
                  <p className="text-lg font-bold text-blue-800">{restoreReport.totalInDatabase}</p>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Option 1: Select Server Versioned Backup */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Database className="w-4 h-4 text-[#0d2847]" />
                Select Server-Stored Backup Snapshot
              </label>
              <button
                type="button"
                onClick={fetchBackups}
                disabled={isLoadingBackups}
                className="text-[11px] text-sky-700 hover:underline font-semibold cursor-pointer"
              >
                {isLoadingBackups ? 'Refreshing...' : 'Refresh list'}
              </button>
            </div>

            {isLoadingBackups ? (
              <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                Scanning versioned backups...
              </div>
            ) : backups.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">
                No versioned backups found on server. You can upload a JSON backup below.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {backups.map((b) => (
                  <label
                    key={b.filename}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      selectedBackupFilename === b.filename && !uploadedJsonContent
                        ? 'bg-blue-50/80 border-[#0d2847] text-[#0d2847] font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="backupSnapshot"
                        checked={selectedBackupFilename === b.filename && !uploadedJsonContent}
                        onChange={() => {
                          setSelectedBackupFilename(b.filename);
                          setUploadedJsonContent(null);
                          setUploadedFileName(null);
                        }}
                        className="text-[#0d2847] focus:ring-[#0d2847]"
                      />
                      <FileJson className="w-4 h-4 text-slate-500" />
                      <div>
                        <p className="font-mono text-xs">{b.filename}</p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(b.timestamp).toLocaleString()} &bull;{' '}
                          {(b.sizeBytes / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {b.count} certs
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Option 2: Upload External JSON Backup */}
          <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-white text-center space-y-2">
            <p className="text-xs font-semibold text-slate-700">Or Upload a Backup File (.json)</p>
            <p className="text-[11px] text-slate-500">
              Recover from any previously downloaded certificates_backup.json file
            </p>
            <input
              type="file"
              id="restore-file-input"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <label
              htmlFor="restore-file-input"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 cursor-pointer transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadedFileName ? `Selected: ${uploadedFileName}` : 'Choose JSON Backup File'}
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
          >
            {restoreReport ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleStartRestore}
            disabled={isRestoring || (!selectedBackupFilename && !uploadedJsonContent)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
          >
            {isRestoring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Restoring Additive Data...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                Start Additive Restore
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
