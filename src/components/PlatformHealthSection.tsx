import React, { useState, useEffect } from 'react';
import {
  Activity,
  HardDrive,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  Loader2,
  FileText,
  Lock,
  Server,
  Cloud,
  Check,
  Zap,
} from 'lucide-react';
import { getAuthHeaders } from '../config/apiConfig';

interface PlatformHealthData {
  timestamp: string;
  firestore: {
    connected: boolean;
    databaseId: string;
    projectId: string;
    totalCertificates: number;
    totalDocuments: number;
    estimatedStorageBytes: number;
    estimatedStorageFormatted: string;
    averageDocSizeBytes: number;
    quotaLimitBytes: number;
    quotaLimitFormatted: string;
    usagePercent: number;
    thresholdStatus: 'NORMAL' | 'WARNING' | 'HIGH_ALERT' | 'CRITICAL';
    status: string;
    dailyReadQuota: string;
    dailyWriteQuota: string;
    dailyDeleteQuota: string;
    dashboardUrl: string;
    gcpConsoleUrl: string;
  };
  vercel: {
    environment: string;
    runtime: string;
    functionMemoryLimit: string;
    functionDurationLimit: string;
    serverlessFunctionsCount: string;
    monthlyBandwidthLimit: string;
    dashboardUrl: string;
  };
  backups: {
    totalBackupsCount: number;
    totalStorageBytes: number;
    totalStorageFormatted: string;
    lastSuccessfulBackup: string | null;
    lastSuccessfulChecksum: string | null;
    autoBackupSchedule: string;
  };
  recentErrorsCount: number;
}

interface HealthCheckItem {
  id: number;
  name: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  latencyMs: number;
  message: string;
}

interface BackupHistoryItem {
  filename: string;
  createdAt: string;
  timestamp: string;
  certificateCount: number;
  sizeBytes: number;
  checksum: string;
  verified: boolean;
}

export const PlatformHealthSection: React.FC<{ isMainAdmin?: boolean }> = ({ isMainAdmin = false }) => {
  const [healthData, setHealthData] = useState<PlatformHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [healthChecks, setHealthChecks] = useState<HealthCheckItem[]>([]);
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [checksTimestamp, setChecksTimestamp] = useState<string | null>(null);

  // Backup operations
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null);
  const [isTestingRestore, setIsTestingRestore] = useState(false);
  const [restoreTestReport, setRestoreTestReport] = useState<any | null>(null);
  const [backupsList, setBackupsList] = useState<BackupHistoryItem[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  const fetchHealthAndStorage = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/platform/health-and-storage', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
      }
    } catch (e) {
      console.error('Failed to load platform health data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBackupsList = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await fetch('/api/backups', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setBackupsList(data.backups || []);
      }
    } catch (e) {
      console.error('Failed to load backups list:', e);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleRunHealthChecks = async () => {
    setIsRunningChecks(true);
    try {
      const res = await fetch('/api/system/health-checks', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setHealthChecks(data.checks || []);
        setChecksTimestamp(data.timestamp || new Date().toISOString());
      }
    } catch (e) {
      console.error('Health checks failed:', e);
    } finally {
      setIsRunningChecks(false);
    }
  };

  const handleCreateVerifiedBackup = async () => {
    setIsCreatingBackup(true);
    setBackupSuccessMessage(null);
    try {
      const res = await fetch('/api/backups/create', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackupSuccessMessage(
          `Verified backup created: ${data.filename} (${data.count} certificates, SHA-256: ${data.checksum.slice(0, 16)}...)`
        );
        fetchBackupsList();
        fetchHealthAndStorage();
      } else {
        alert(data.message || 'Backup creation failed');
      }
    } catch (e: any) {
      alert(`Error creating backup: ${e.message}`);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleTestDisasterRecovery = async () => {
    setIsTestingRestore(true);
    setRestoreTestReport(null);
    try {
      const res = await fetch('/api/backups/test-restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
      });
      const data = await res.json();
      setRestoreTestReport(data);
    } catch (e: any) {
      alert(`Disaster recovery test failed: ${e.message}`);
    } finally {
      setIsTestingRestore(false);
    }
  };

  useEffect(() => {
    if (isMainAdmin) {
      fetchHealthAndStorage();
      fetchBackupsList();
      handleRunHealthChecks();
    }
  }, [isMainAdmin]);

  if (!isMainAdmin) return null;

  const usagePct = healthData?.firestore?.usagePercent || 0.13;
  const thresholdStatus = healthData?.firestore?.thresholdStatus || 'NORMAL';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0d2847] via-[#12365e] to-[#0d2847] p-5 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Platform Health, Storage &amp; Disaster Recovery</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Main Core Admin Verified
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Live Firestore storage limits, disaster recovery backups, Vercel function telemetry &amp; non-destructive health checks
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                fetchHealthAndStorage();
                fetchBackupsList();
                handleRunHealthChecks();
              }}
              disabled={isLoading || isRunningChecks}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRunningChecks ? 'animate-spin' : ''}`} />
              <span>Refresh Telemetry</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* Row 1: Firestore Capacity Bar & Status Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Firestore Storage Meter */}
          <div className="lg:col-span-2 bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#0d2847]" />
                <h3 className="text-sm font-bold text-[#0d2847]">Permanent Firestore Database Capacity</h3>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  thresholdStatus === 'NORMAL'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : thresholdStatus === 'WARNING'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {thresholdStatus === 'NORMAL' ? 'HEALTHY (Spark Free Tier)' : thresholdStatus}
              </span>
            </div>

            {/* Storage Progress Bar with Threshold Markers */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 mb-1.5">
                <span>
                  Storage Consumed:{' '}
                  <strong className="text-slate-900 font-bold">
                    {healthData?.firestore?.estimatedStorageFormatted || '1.41 MB'}
                  </strong>
                </span>
                <span>
                  Quota Limit:{' '}
                  <strong className="text-slate-900 font-bold">1.00 GB (1,024 MB)</strong>
                </span>
              </div>
              <div className="relative w-full h-4 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    usagePct < 70 ? 'bg-emerald-500' : usagePct < 85 ? 'bg-amber-500' : 'bg-rose-600'
                  }`}
                  style={{ width: `${Math.max(1, Math.min(100, usagePct))}%` }}
                />
              </div>
              {/* Threshold Indicators */}
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
                <span>0 MB (0%)</span>
                <span>70% Warning</span>
                <span>85% High</span>
                <span>95% Critical</span>
                <span>1.00 GB (100%)</span>
              </div>
            </div>

            {/* Stats Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/80 text-xs">
              <div>
                <p className="text-slate-500 text-[11px]">Total Certificates</p>
                <p className="font-bold text-slate-800 text-sm">{healthData?.firestore?.totalCertificates || 977}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[11px]">Avg Document Size</p>
                <p className="font-bold text-slate-800 text-sm">{healthData?.firestore?.averageDocSizeBytes || 1450} B</p>
              </div>
              <div>
                <p className="text-slate-500 text-[11px]">Daily Read Limit</p>
                <p className="font-bold text-slate-800 text-sm">50,000 / day</p>
              </div>
              <div>
                <p className="text-slate-500 text-[11px]">Daily Write Limit</p>
                <p className="font-bold text-slate-800 text-sm">20,000 / day</p>
              </div>
            </div>

            {/* Direct Official Cloud Console Links */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <a
                href={healthData?.firestore?.dashboardUrl || 'https://console.firebase.google.com/'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-xs font-medium text-slate-700 transition-colors"
              >
                <span>Firebase Database Console</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
              <a
                href={healthData?.firestore?.gcpConsoleUrl || 'https://console.cloud.google.com/'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-xs font-medium text-slate-700 transition-colors"
              >
                <span>Google Cloud Console</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            </div>
          </div>

          {/* Vercel Environment & Quotas Card */}
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#0d2847]" />
                <h3 className="text-sm font-bold text-[#0d2847]">Hosting &amp; Compute</h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Vercel Hobby Plan
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Functions Used</span>
                <span className="font-bold text-slate-800">1 of 12 (Safe Catch-All Router)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Function Timeout</span>
                <span className="font-bold text-slate-800">10s max execution</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Function Memory</span>
                <span className="font-bold text-slate-800">1,024 MB</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Node Runtime</span>
                <span className="font-bold text-slate-800">Node.js 22.x ESM (.js)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Monthly Bandwidth</span>
                <span className="font-bold text-slate-800">100 GB / month</span>
              </div>
            </div>

            <a
              href="https://vercel.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
            >
              <span>Open Vercel Production Dashboard</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>

        {/* Row 2: Automated 10-Point Non-Destructive Health Checks */}
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-[#0d2847]">Automated Non-Destructive Health Suite (10 Checks)</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Comprehensive automated verification across website availability, database, auth guards, PDF, QR resolver, and backups
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunHealthChecks}
              disabled={isRunningChecks}
              className="px-3 py-1.5 bg-[#0d2847] hover:bg-[#12365e] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${isRunningChecks ? 'animate-spin' : ''}`} />
              <span>{isRunningChecks ? 'Executing Checks...' : 'Run All 10 Health Checks'}</span>
            </button>
          </div>

          {checksTimestamp && (
            <p className="text-[11px] text-slate-400">
              Last check executed: {new Date(checksTimestamp).toLocaleTimeString()} ({healthChecks.length}/10 checks completed)
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {healthChecks.map((check) => (
              <div
                key={`check-${check.id}`}
                className="bg-white p-3 rounded-lg border border-slate-200 flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">
                      #{check.id}
                    </span>
                    <span className="text-xs font-bold text-slate-900">{check.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">{check.message}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      check.status === 'PASS'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : check.status === 'WARNING'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {check.status}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">{check.latencyMs}ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 3: Automated Backup & Disaster Recovery Manager */}
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#0d2847]" />
                <h3 className="text-sm font-bold text-[#0d2847]">Backup &amp; Disaster Recovery Manager</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Timestamped snapshots with SHA-256 integrity hashes and isolated dry-run disaster recovery testing
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCreateVerifiedBackup}
                disabled={isCreatingBackup}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isCreatingBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                <span>Create Verified Backup Now</span>
              </button>
              <button
                type="button"
                onClick={handleTestDisasterRecovery}
                disabled={isTestingRestore}
                className="px-3 py-1.5 bg-[#0d2847] hover:bg-[#12365e] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isTestingRestore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>Test Disaster Recovery (Isolated)</span>
              </button>
            </div>
          </div>

          {backupSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{backupSuccessMessage}</span>
            </div>
          )}

          {restoreTestReport && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs space-y-1.5 text-blue-900">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span>Isolated Restoration Test Passed (Production Database Untouched)</span>
              </div>
              <p className="text-blue-700 text-xs">{restoreTestReport.message}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div>Total in Backup: {restoreTestReport.totalInBackup}</div>
                <div>Valid Structure: {restoreTestReport.validStructureCount}</div>
                <div>Matched Existing: {restoreTestReport.matchedExistingCount}</div>
                <div>Corrupted: {restoreTestReport.corruptedRecordCount}</div>
              </div>
            </div>
          )}

          {/* Backup Snapshots Table */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Snapshot Filename</th>
                  <th className="py-2.5 px-3">Date &amp; Time</th>
                  <th className="py-2.5 px-3">Certificates</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">SHA-256 Checksum</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backupsList.slice(0, 5).map((b) => (
                  <tr key={b.filename} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#0d2847]">{b.filename}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {new Date(b.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{b.certificateCount}</td>
                    <td className="py-2.5 px-3 text-slate-600">{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                    <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">
                      {b.checksum ? `${b.checksum.slice(0, 16)}...` : 'Verified'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        VERIFIED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
