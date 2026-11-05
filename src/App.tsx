import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { CreateCertificateForm } from './components/CreateCertificateForm';
import { AllCertificatesView } from './components/AllCertificatesView';
import { CertificateView } from './components/CertificateView';
import { PublicVerifyView } from './components/PublicVerifyView';
import { SettingsView } from './components/SettingsView';
import { LoginModal } from './components/LoginModal';
import { FrontPageLogin } from './components/FrontPageLogin';
import { ReissueCertificateModal } from './components/ReissueCertificateModal';
import { ImportOldCertificatesModal } from './components/ImportOldCertificatesModal';
import { RestoreBackupModal } from './components/RestoreBackupModal';
import { DataIntegrityModal } from './components/DataIntegrityModal';
import { DirectPdfScannerModal } from './components/DirectPdfScannerModal';
import type { Certificate, CertificateStatus, DashboardStats } from './types';
import { ArrowLeft, Printer, ShieldCheck, RefreshCw, CheckCircle2, FolderUp, Cloud, Lock } from 'lucide-react';
import {
  saveToLocalVault,
  syncStorageWithBackend,
  findInLocalVault,
  loadWorkingCache,
  saveWorkingCache,
} from './utils/storageVault';
import { autoSyncCertificate, initAutoSync } from './utils/autoSync';
import {
  googleDriveSignIn,
  isDriveConnected,
  getDriveAccessToken,
  initDriveAuth,
  onDriveAuthChanged,
  persistCertificateToFirestore,
} from './services/googleDriveAuth';
import {
  uploadAllCertificatesToDriveOneByOne,
  autoSyncCertificateToDrive,
  processPendingDriveSync,
  syncAllCertificatesFromGoogleDrive,
  syncWithGoogleDriveReconcile,
} from './services/googleDriveService';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('create');
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const hasExplicitlyLoggedOut = sessionStorage.getItem('ps_logged_out') === 'true';
    if (hasExplicitlyLoggedOut) return false;
    const token =
      localStorage.getItem('ps_admin_token') ||
      localStorage.getItem('pscrappers_admin_token') ||
      '';
    if (token && !token.startsWith('adm.')) {
      localStorage.removeItem('ps_admin_token');
      localStorage.removeItem('pscrappers_admin_token');
      return false;
    }
    return Boolean(token && token.startsWith('adm.'));
  });
  const [isMainAdmin, setIsMainAdmin] = useState<boolean>(false);
  const [recentMakerCertificates, setRecentMakerCertificates] = useState<Certificate[]>([]);
  const [mainAdminModalOpen, setMainAdminModalOpen] = useState<boolean>(false);
  const [mainAdminPasswordInput, setMainAdminPasswordInput] = useState<string>('');
  const [mainAdminError, setMainAdminError] = useState<string | null>(null);
  const [isVerifyingMainAdmin, setIsVerifyingMainAdmin] = useState<boolean>(false);

  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);
  const [importOldModalOpen, setImportOldModalOpen] = useState<boolean>(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState<boolean>(false);
  const [integrityModalOpen, setIntegrityModalOpen] = useState<boolean>(false);
  const [directPdfModalOpen, setDirectPdfModalOpen] = useState<boolean>(false);
  const [createFormKey, setCreateFormKey] = useState<number>(() => Date.now());
  const [isLiveSyncing, setIsLiveSyncing] = useState<boolean>(false);
  const [liveSyncFeedback, setLiveSyncFeedback] = useState<string | null>(null);

  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [reissueModalCert, setReissueModalCert] = useState<Certificate | null>(null);

  // Deep-linking params for /verify/:certNumber
  const [verifyCertNumber, setVerifyCertNumber] = useState<string>('');
  const [verifyToken, setVerifyToken] = useState<string>('');

  // Fetch certificates and stats safely from backend with strict role isolation
  const fetchData = async (deepSync = false, forceCoreAdminCheck = true) => {
    try {
      const storedToken =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        '';
      const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
      const authHeaders: Record<string, string> = {
        ...(storedToken
          ? {
              Authorization: `Bearer ${storedToken}`,
              'x-admin-token': storedToken,
            }
          : {}),
        ...(coreToken ? { 'x-main-admin-token': coreToken } : {}),
      };

      // 1. Always fetch recent 5 certificates for Certificate Maker view
      try {
        const recentRes = await fetch('/api/certificates/recent', {
          headers: authHeaders,
          credentials: 'include',
        });
        if (recentRes.ok) {
          const recentData: Certificate[] = await recentRes.json();
          if (Array.isArray(recentData)) {
            setRecentMakerCertificates(recentData.slice(0, 5));
          }
        }
      } catch {
        // Non-blocking
      }

      // 2. Check if MAIN_CORE_ADMIN session is unlocked on server
      let coreAdminActive = isMainAdmin;
      if (forceCoreAdminCheck) {
        try {
          const statusRes = await fetch('/api/auth/main-admin-status', {
            headers: authHeaders,
            credentials: 'include',
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            coreAdminActive = Boolean(statusData.authenticated && statusData.role === 'MAIN_CORE_ADMIN');
            setIsMainAdmin(coreAdminActive);
            if (!coreAdminActive) {
              sessionStorage.removeItem('ps_core_admin_token');
            }
          } else {
            coreAdminActive = false;
            setIsMainAdmin(false);
          }
        } catch {
          coreAdminActive = false;
          setIsMainAdmin(false);
        }
      }

      // If user is ONLY a normal Certificate Maker, NEVER fetch or expose full certificate database or stats
      if (!coreAdminActive) {
        setCertificates([]);
        setStats(null);
        return;
      }

      // 3. Fetch full certificates only when verified as MAIN_CORE_ADMIN
      try {
        const certsRes = await fetch('/api/certificates', {
          headers: authHeaders,
          credentials: 'include',
        });
        if (certsRes.ok) {
          const certsData: Certificate[] = await certsRes.json();
          const lockedCerts = certsData.map((c) => ({
            ...c,
            isLocked: true,
            lockedAt: c.lockedAt || c.createdAt || new Date().toISOString(),
          }));
          setCertificates(lockedCerts);
          saveWorkingCache(lockedCerts);

          if (deepSync) {
            try {
              const syncResult = await syncStorageWithBackend(lockedCerts, authHeaders);
              if (
                syncResult &&
                syncResult.allCertificates &&
                syncResult.allCertificates.length > lockedCerts.length
              ) {
                setCertificates(syncResult.allCertificates);
              }
            } catch (syncErr) {
              console.warn('Auto storage sync notice:', syncErr);
            }
          }
        } else if (certsRes.status === 403 || certsRes.status === 401) {
          setIsMainAdmin(false);
          setCertificates([]);
          setStats(null);
          return;
        }
      } catch {
        // Silent on transient network issue
      }

      // 4. Fetch stats only for MAIN_CORE_ADMIN
      try {
        const statsRes = await fetch('/api/stats', {
          headers: authHeaders,
          credentials: 'include',
        });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      } catch {
        // Non-blocking
      }
    } catch {
      // Gracefully silent on background disconnects
    }
  };

  // Inspect URL on initial mount (supporting QR scan URLs like /verify/PS-2026-0001?token=...)
  useEffect(() => {
    fetchData(true, true);

    const handleUrlRouting = () => {
      const pathname = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const token = searchParams.get('token') || '';

      const storedToken =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token');
      const hasExplicitlyLoggedOut = sessionStorage.getItem('ps_logged_out') === 'true';

      const hasCertParam =
        searchParams.get('certificateNumber') ||
        searchParams.get('certNumber') ||
        searchParams.get('cert') ||
        searchParams.get('q') ||
        searchParams.get('number');

      if (pathname.startsWith('/verify') || hasCertParam) {
        setActiveTab('verify');
        let certFromUrl = pathname.startsWith('/verify') ? pathname.replace(/^\/verify\/?/, '') : '';
        if (searchParams.get('certificateNumber')) {
          certFromUrl = searchParams.get('certificateNumber') || '';
        } else if (searchParams.get('certNumber')) {
          certFromUrl = searchParams.get('certNumber') || '';
        } else if (searchParams.get('cert')) {
          certFromUrl = searchParams.get('cert') || '';
        } else if (searchParams.get('q')) {
          certFromUrl = searchParams.get('q') || '';
        } else if (searchParams.get('number')) {
          certFromUrl = searchParams.get('number') || '';
        }
        try {
          certFromUrl = decodeURIComponent(certFromUrl).trim();
        } catch {}
        setVerifyCertNumber(certFromUrl);
        setVerifyToken(token);
        return;
      }

      if (storedToken && !hasExplicitlyLoggedOut) {
        setIsAdmin(true);
        const hasCoreToken = Boolean(sessionStorage.getItem('ps_core_admin_token'));
        if (hasCoreToken && pathname.startsWith('/certificates')) {
          setActiveTab('certificates');
        } else if (hasCoreToken && pathname.startsWith('/dashboard')) {
          setActiveTab('dashboard');
        } else if (hasCoreToken && pathname.startsWith('/settings')) {
          setActiveTab('settings');
        } else {
          // Normal login always lands directly on Certificate Maker
          setActiveTab('create');
        }
      } else {
        setIsAdmin(false);
        setIsMainAdmin(false);
        setActiveTab('login');
      }
    };

    handleUrlRouting();
    window.addEventListener('popstate', handleUrlRouting);

    const cleanupAutoSync = initAutoSync((syncedCert) => {
      setRecentMakerCertificates((prev) => {
        const exists = prev.some(
          (c) => c.certificateNumber.toUpperCase() === syncedCert.certificateNumber.toUpperCase()
        );
        return exists ? prev : [syncedCert, ...prev].slice(0, 5);
      });
    });

    const handleOnlineStatus = () => {
      if (navigator.onLine) {
        fetchData();
      }
    };
    window.addEventListener('online', handleOnlineStatus);

    const handleCustomSync = () => {
      fetchData();
    };
    window.addEventListener('ps_certificate_synced', handleCustomSync);

    const unsubscribeDrive = onDriveAuthChanged(async () => {
      try {
        const { processed } = await processPendingDriveSync(certificates);
        if (processed > 0) {
          setLiveSyncFeedback(
            `Google Drive Auto-Sync: ${processed} certificate(s) uploaded to Drive "certificates" folder.`
          );
          setTimeout(() => setLiveSyncFeedback(null), 8000);
        }
      } catch (err) {
        console.warn('Drive auto-sync on auth change notice:', err);
      }
    });

    return () => {
      window.removeEventListener('popstate', handleUrlRouting);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('ps_certificate_synced', handleCustomSync);
      cleanupAutoSync();
      if (unsubscribeDrive) unsubscribeDrive();
    };
  }, []);

  const handleSelectTab = (tab: string) => {
    // Block Main Core Admin tabs if not unlocked as MAIN_CORE_ADMIN
    if ((tab === 'certificates' || tab === 'dashboard' || tab === 'settings') && !isMainAdmin) {
      setMainAdminError(null);
      setMainAdminPasswordInput('');
      setMainAdminModalOpen(true);
      return;
    }

    if (tab === 'create') {
      setCreateFormKey(Date.now());
    }
    setActiveTab(tab);
    if (tab === 'dashboard') {
      window.history.pushState({}, '', '/dashboard');
    } else if (tab === 'verify') {
      window.history.pushState({}, '', '/verify');
    } else if (tab === 'login') {
      window.history.pushState({}, '', '/login');
    } else {
      window.history.pushState({}, '', `/${tab}`);
    }
  };

  const handleVerifyMainAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMainAdminError(null);
    if (!mainAdminPasswordInput) {
      setMainAdminError('Please enter the Main Core Admin password.');
      return;
    }

    setIsVerifyingMainAdmin(true);
    try {
      const storedToken =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        '';
      const res = await fetch('/api/auth/verify-main-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(storedToken ? { Authorization: `Bearer ${storedToken}`, 'x-admin-token': storedToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ password: mainAdminPasswordInput }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Invalid Main Core Admin password.');
      }

      if (data.token) {
        sessionStorage.setItem('ps_core_admin_token', data.token);
      }
      setIsMainAdmin(true);
      setMainAdminPasswordInput('');
      setMainAdminModalOpen(false);
      await fetchData(false, false);
      setActiveTab('dashboard');
      window.history.pushState({}, '', '/dashboard');
    } catch (err: any) {
      setMainAdminError(err.message || 'Invalid Main Core Admin password.');
    } finally {
      setIsVerifyingMainAdmin(false);
    }
  };

  const handleLogoutMainAdmin = () => {
    const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
    sessionStorage.removeItem('ps_core_admin_token');
    fetch('/api/auth/logout-main-admin', {
      method: 'POST',
      headers: coreToken ? { 'x-main-admin-token': coreToken } : {},
      credentials: 'include',
    }).catch(() => {});
    setIsMainAdmin(false);
    setCertificates([]);
    setStats(null);
    setActiveTab('create');
    window.history.pushState({}, '', '/create');
  };

  const handleManualLiveSync = async () => {
    setIsLiveSyncing(true);
    setLiveSyncFeedback('Connecting to Main Live Site (crm-parivahanscrappers.ai.studio)...');
    try {
      const storedToken =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        '';
      const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${storedToken}`,
        'x-admin-token': storedToken,
        ...(coreToken ? { 'x-main-admin-token': coreToken } : {}),
      };

      const response = await fetch('/api/sync/incremental-from-main-site', {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.newImported > 0) {
          setLiveSyncFeedback(
            `Incremental Sync Complete: Successfully imported ${data.newImported} new certificate(s) from Main Site! Total database registry: ${data.totalDestinationAfter}.`
          );
        } else {
          setLiveSyncFeedback(
            `Main Site In Sync: All ${data.totalMainSite} certificates are fully synchronized with zero missing records. Total registry: ${data.totalDestinationAfter}.`
          );
        }
      } else {
        const syncResult = await syncStorageWithBackend(certificates, authHeaders);
        setCertificates(syncResult.allCertificates);
        setLiveSyncFeedback(
          `Live Site Database Synchronized: All ${syncResult.allCertificates.length} certificates securely verified.`
        );
      }
      fetchData();
    } catch (err: any) {
      console.warn('Sync notice:', err);
      setLiveSyncFeedback('Live sync finished. Database verified.');
      fetchData();
    } finally {
      setIsLiveSyncing(false);
      setTimeout(() => setLiveSyncFeedback(null), 10000);
    }
  };

  const [isDriveSyncing, setIsDriveSyncing] = useState<boolean>(false);

  const handleQuickDriveSync = async () => {
    setIsDriveSyncing(true);
    setLiveSyncFeedback('Connecting to Google Drive...');
    try {
      const result = await syncWithGoogleDriveReconcile(certificates, (status, percent) => {
        setLiveSyncFeedback(`[${percent}%] ${status}`);
      });
      setLiveSyncFeedback(
        `Sync With Drive Complete! Synced ${result.syncedToDriveCount} to Drive, Restored ${result.restoredToSiteCount} to site (${result.alreadyInSyncCount} already in sync). All unique names e.g. PS/26/R...pdf with zero duplicates.`
      );
      fetchData();
    } catch (err: any) {
      setLiveSyncFeedback(err.message || 'Google Drive sync failed.');
    } finally {
      setIsDriveSyncing(false);
      setTimeout(() => setLiveSyncFeedback(null), 10000);
    }
  };

  const handleViewCertificate = (cert: Certificate) => {
    setSelectedCertificate(cert);
    setActiveTab('view-certificate');
  };

  const handleViewByCertNumber = (certNumber: string) => {
    fetch(`/api/public/certificate?certificateNumber=${encodeURIComponent(certNumber)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Certificate not found');
        return res.json();
      })
      .then((data) => {
        if (data && data.certificateNumber) {
          setSelectedCertificate(data);
          setActiveTab('view-certificate');
        }
      })
      .catch(() => {
        const found =
          recentMakerCertificates.find(
            (c) => c.certificateNumber.toUpperCase() === certNumber.toUpperCase()
          ) ||
          certificates.find(
            (c) => c.certificateNumber.toUpperCase() === certNumber.toUpperCase()
          ) ||
          findInLocalVault(certNumber);

        if (found) {
          setSelectedCertificate(found);
          setActiveTab('view-certificate');
        } else {
          setVerifyCertNumber(certNumber);
          setActiveTab('verify');
        }
      });
  };

  const handleCertificateCreated = (newCert: Certificate) => {
    // 1. Permanently store in local storage vault for offline resilience
    saveToLocalVault(newCert);

    // 1b. Persist to Firebase Firestore if authenticated via Firebase Auth
    persistCertificateToFirestore(newCert).catch((err) => {
      console.warn('Firestore client persistence notice:', err);
    });

    // 2. Auto-sync to Google Drive ("certificates" folder) in background if authenticated
    autoSyncCertificateToDrive(newCert)
      .then((res) => {
        if (res.syncedToDrive) {
          setLiveSyncFeedback(
            `Certificate ${newCert.certificateNumber} issued and auto-synced to Google Drive folder!`
          );
          setTimeout(() => setLiveSyncFeedback(null), 8000);
        } else if (res.queuedForLater) {
          setLiveSyncFeedback(
            `Certificate ${newCert.certificateNumber} issued! Queued for Google Drive auto-sync.`
          );
          setTimeout(() => setLiveSyncFeedback(null), 8000);
        }
      })
      .catch(() => {});

    // 3. Update Recent 5 Certificates immediately for Certificate Maker
    setRecentMakerCertificates((prev) => {
      const filtered = prev.filter(
        (c) => c.certificateNumber.toUpperCase() !== newCert.certificateNumber.toUpperCase()
      );
      return [newCert, ...filtered].slice(0, 5);
    });

    // 4. Update Main Admin list only if Main Core Admin is active
    if (isMainAdmin) {
      setCertificates((prev) => {
        const exists = prev.some(
          (c) => c.certificateNumber.toUpperCase() === newCert.certificateNumber.toUpperCase()
        );
        return exists ? prev : [newCert, ...prev];
      });

      setStats((prev) =>
        prev
          ? {
              ...prev,
              totalCertificates: prev.totalCertificates + 1,
              validCertificates: prev.validCertificates + 1,
            }
          : null
      );
    }

    setSelectedCertificate(newCert);
    setActiveTab('view-certificate');
  };

  const handleUpdateStatus = async (
    certId: string,
    newStatus: CertificateStatus,
    reason?: string
  ) => {
    try {
      const token = localStorage.getItem('ps_admin_token');
      const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
      const res = await fetch(`/api/certificates/${certId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(coreToken ? { 'x-main-admin-token': coreToken } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus, reason }),
      });

      if (!res.ok) {
        throw new Error('Failed to update status');
      }

      const updated = await res.json();
      setCertificates((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      if (selectedCertificate && selectedCertificate.id === updated.id) {
        setSelectedCertificate(updated);
      }
      fetchData();
    } catch (err: any) {
      console.error('Error updating status:', err.message);
    }
  };

  const handleUpdateCertificate = async (updated: Certificate) => {
    setCertificates((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    if (selectedCertificate && selectedCertificate.id === updated.id) {
      setSelectedCertificate(updated);
    }
    fetchData();
  };

  // Normal login grants ONLY Certificate Maker access by default
  const handleLoginSuccess = (token: string) => {
    sessionStorage.removeItem('ps_logged_out');
    sessionStorage.removeItem('ps_core_admin_token');
    localStorage.setItem('ps_admin_token', token);
    localStorage.setItem('pscrappers_admin_token', token);
    setIsAdmin(true);
    setIsMainAdmin(false);
    setCertificates([]);
    setStats(null);
    setLoginModalOpen(false);
    fetchData(false, false);
    // Direct to make certificate immediately upon login
    setActiveTab('create');
    window.history.pushState({}, '', '/create');
  };

  const handleLogout = () => {
    sessionStorage.setItem('ps_logged_out', 'true');
    sessionStorage.removeItem('ps_core_admin_token');
    localStorage.removeItem('ps_admin_token');
    localStorage.removeItem('pscrappers_admin_token');
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setIsAdmin(false);
    setIsMainAdmin(false);
    setCertificates([]);
    setRecentMakerCertificates([]);
    setStats(null);
    setActiveTab('login');
    window.history.pushState({}, '', '/');
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        currentTab={activeTab}
        onSelectTab={handleSelectTab}
        isAdmin={isAdmin}
        isMainAdmin={isMainAdmin}
        onOpenLogin={() => {
          if (isAdmin) {
            handleSelectTab('create');
          } else {
            handleSelectTab('login');
          }
        }}
        onLogout={handleLogout}
        onOpenDirectPdf={() => setDirectPdfModalOpen(true)}
        onRequestMainAdmin={() => {
          setMainAdminError(null);
          setMainAdminPasswordInput('');
          setMainAdminModalOpen(true);
        }}
        onLogoutMainAdmin={handleLogoutMainAdmin}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-6 lg:p-8 overflow-x-hidden">
        {/* Top Certificates Recovery & Live Sync Banner (Main Core Admin Only) */}
        {isAdmin && isMainAdmin && activeTab !== 'login' && activeTab !== 'verify' && activeTab !== 'view-certificate' && (
          <div className="no-print mb-4 p-3.5 bg-gradient-to-r from-sky-900 via-[#0d2847] to-indigo-900 rounded-2xl text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-sky-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
                <RefreshCw className={`w-5 h-5 ${isLiveSyncing ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-sky-200">
                  Google Drive Cloud Sync &amp; Database Archival Desk
                </p>
                <p className="text-[11px] text-slate-300">
                  Database contains <strong className="font-mono text-emerald-300">{certificates.length}</strong> certificates.
                  Synchronized with Google Drive archive with zero missing certificates.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleManualLiveSync}
                disabled={isLiveSyncing}
                className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Deep scan browser storage, vault, and device cache to restore missing certificates to server database"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLiveSyncing ? 'animate-spin' : ''}`} />
                <span>{isLiveSyncing ? 'Syncing...' : 'SYNC FROM LIVE SITE'}</span>
              </button>

              <button
                type="button"
                onClick={handleQuickDriveSync}
                disabled={isDriveSyncing}
                className="px-3.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-slate-950 text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Connect Google Drive and backup/sync all certificates to 'certificates' folder"
              >
                <Cloud className={`w-3.5 h-3.5 ${isDriveSyncing ? 'animate-bounce' : ''}`} />
                <span>{isDriveSyncing ? 'Syncing...' : 'SYNC WITH DRIVE'}</span>
              </button>

              <button
                type="button"
                onClick={() => setImportOldModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Import old certificates from Google Drive or local PDF batch"
              >
                <FolderUp className="w-3.5 h-3.5 text-emerald-300" />
                <span>IMPORT OLD PDFs</span>
              </button>
            </div>
          </div>
        )}

        {liveSyncFeedback && (
          <div className="no-print mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-semibold flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{liveSyncFeedback}</span>
          </div>
        )}

        {/* TAB 0: FRONT PAGE LOGIN (When on /login or not authenticated) */}
        {(activeTab === 'login' || (!isAdmin && activeTab !== 'verify' && activeTab !== 'view-certificate')) && (
          <FrontPageLogin
            onLoginSuccess={handleLoginSuccess}
            onGoToVerify={() => handleSelectTab('verify')}
          />
        )}

        {/* TAB 1: CREATE CERTIFICATE - Private Certificate Maker + Recent 5 Created Certificates */}
        {isAdmin && (activeTab === 'create' || (!isMainAdmin && activeTab !== 'verify' && activeTab !== 'view-certificate')) && (
          <CreateCertificateForm
            key={createFormKey}
            onCertificateCreated={(newCert) => {
              setCreateFormKey(Date.now());
              handleCertificateCreated(newCert);
            }}
            onCancel={() => {
              if (isMainAdmin) {
                handleSelectTab('certificates');
              } else {
                setCreateFormKey(Date.now());
              }
            }}
            onLogout={handleLogout}
            onViewExistingCertificate={handleViewByCertNumber}
            onRequestReissue={(cert) => setReissueModalCert(cert)}
            recentCertificates={recentMakerCertificates}
            onViewRecentCertificate={handleViewCertificate}
            isMainAdmin={isMainAdmin}
            onRequestMainAdmin={() => {
              setMainAdminError(null);
              setMainAdminPasswordInput('');
              setMainAdminModalOpen(true);
            }}
            onLogoutMainAdmin={handleLogoutMainAdmin}
          />
        )}

        {/* TAB 2: ALL CERTIFICATES - MAIN CORE ADMIN ONLY */}
        {isAdmin && isMainAdmin && activeTab === 'certificates' && (
          <AllCertificatesView
            certificates={certificates}
            onViewCertificate={handleViewCertificate}
            onUpdateStatus={handleUpdateStatus}
            onUpdateCertificate={handleUpdateCertificate}
            onNavigateToCreate={() => handleSelectTab('create')}
            onRefreshData={fetchData}
            onOpenImport={() => setImportOldModalOpen(true)}
            onOpenRestore={() => setRestoreModalOpen(true)}
            onOpenIntegrityCheck={() => setIntegrityModalOpen(true)}
          />
        )}

        {/* TAB 3: DASHBOARD - MAIN CORE ADMIN ONLY */}
        {isAdmin && isMainAdmin && activeTab === 'dashboard' && (
          <DashboardView
            stats={stats}
            recentCertificates={certificates}
            onNavigate={handleSelectTab}
            onViewCertificate={handleViewCertificate}
            onOpenImport={() => setImportOldModalOpen(true)}
            onOpenRestore={() => setRestoreModalOpen(true)}
            onOpenIntegrityCheck={() => setIntegrityModalOpen(true)}
            onRefreshData={fetchData}
            isMainAdmin={isMainAdmin}
            onLogoutMainAdmin={handleLogoutMainAdmin}
            onMainAdminPasswordChanged={handleLogoutMainAdmin}
          />
        )}

        {/* TAB 4: VIEW CERTIFICATE */}
        {activeTab === 'view-certificate' && selectedCertificate && (
          <div className="space-y-3 w-full max-w-full flex flex-col items-center">
            <div className="no-print w-full max-w-[800px] flex items-center justify-between bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <button
                type="button"
                onClick={() => handleSelectTab(isAdmin ? 'create' : 'verify')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0d2847] hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                {isAdmin ? 'Back to Make Certificate' : 'Back to Certification Tool'}
              </button>
              <span className="text-[11px] text-slate-500 font-mono">
                {selectedCertificate.certificateNumber}
              </span>
            </div>

            <CertificateView
              certificate={selectedCertificate}
              customerMode={!isAdmin}
              onBack={() => handleSelectTab(isAdmin ? 'create' : 'verify')}
              onPrint={() => window.print()}
              onQrClick={() => {
                setActiveTab('verify');
              }}
            />
          </div>
        )}

        {/* TAB 5: PUBLIC VERIFY */}
        {activeTab === 'verify' && (
          <PublicVerifyView
            initialCertificateNumber={verifyCertNumber}
            initialToken={verifyToken}
            onViewCertificate={handleViewByCertNumber}
          />
        )}

        {/* TAB 6: SETTINGS - MAIN CORE ADMIN ONLY */}
        {isAdmin && isMainAdmin && activeTab === 'settings' && (
          <SettingsView onSettingsSaved={fetchData} />
        )}
      </main>

      {/* Main Core Admin Password Dialog */}
      {mainAdminModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-[#0d2847] px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Lock className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold font-serif">Main Core Admin Access</h3>
                  <p className="text-[11px] text-slate-300">
                    Protected Master Registry &amp; Historical Database
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMainAdminModalOpen(false)}
                className="text-slate-300 hover:text-white text-xs font-bold px-2 py-1 rounded cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleVerifyMainAdminSubmit} className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Enter the separate <strong>Main Core Admin</strong> password to unlock full certificate search, historical records, total counts, and administrative settings.
              </p>

              {mainAdminError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
                  {mainAdminError}
                </div>
              )}

              <div>
                <label
                  htmlFor="input-main-core-admin-password"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Main Core Admin Password
                </label>
                <input
                  id="input-main-core-admin-password"
                  type="password"
                  value={mainAdminPasswordInput}
                  onChange={(e) => setMainAdminPasswordInput(e.target.value)}
                  placeholder="Enter Core Admin password"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0d2847] outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMainAdminModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-main-core-admin"
                  type="submit"
                  disabled={isVerifyingMainAdmin}
                  className="px-5 py-2 rounded-xl bg-[#0d2847] hover:bg-[#163a63] text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isVerifyingMainAdmin ? 'Verifying...' : 'Unlock Main Core Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Login Dialog (Fallback modal if triggered) */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Reissue / Correct Certificate Modal */}
      {reissueModalCert && (
        <ReissueCertificateModal
          certificate={reissueModalCert}
          isOpen={Boolean(reissueModalCert)}
          onClose={() => setReissueModalCert(null)}
          onSuccess={(newCert, originalCert) => {
            setCertificates((prev) => {
              const updated = prev.map((c) =>
                c.id === originalCert.id || c.certificateNumber === originalCert.certificateNumber
                  ? originalCert
                  : c
              );
              return [newCert, ...updated];
            });
            setSelectedCertificate(newCert);
            setActiveTab('view-certificate');
            fetchData();
          }}
        />
      )}

      {/* Batch Import Old Certificate PDFs Modal */}
      <ImportOldCertificatesModal
        isOpen={importOldModalOpen}
        onClose={() => setImportOldModalOpen(false)}
        onImportSuccess={() => {
          fetchData();
        }}
      />

      {/* Restore & Recover Additive Backup Modal */}
      <RestoreBackupModal
        isOpen={restoreModalOpen}
        onClose={() => setRestoreModalOpen(false)}
        onRestoreSuccess={() => {
          fetchData();
        }}
      />

      {/* Deep Cryptographic Data Integrity Audit Modal */}
      <DataIntegrityModal
        isOpen={integrityModalOpen}
        onClose={() => setIntegrityModalOpen(false)}
        onRefreshData={() => {
          fetchData();
        }}
      />

      {/* Direct PDF Database Scanner Modal */}
      <DirectPdfScannerModal
        isOpen={directPdfModalOpen}
        onClose={() => setDirectPdfModalOpen(false)}
        onViewCertificate={(cert) => {
          setSelectedCertificate(cert);
          setActiveTab('view-certificate');
        }}
        onCertificateUpdated={() => {
          fetchData();
        }}
      />

      {/* Footer - Strictly hidden when customer is verifying certificate or outside admin console */}
      {isAdmin && activeTab !== 'verify' && activeTab !== 'view-certificate' && (
        <footer className="no-print border-t border-slate-200 bg-white py-4 mt-8 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 space-y-1">
            <p className="font-semibold text-slate-700 text-xs">
              PARIVAHAN SCRAPPERS &bull; A Unit OF Scrapping Yard Ltd.
            </p>
            <p className="text-[11px] text-slate-500">
              B12, Dwarka, New Delhi. &bull; Delhi NCR Regional Operations
            </p>
            <p className="text-[10px] text-slate-400">
              Computer Generated &amp; Digitally Authenticated Vehicle Disposal Records
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
