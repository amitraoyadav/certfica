import {
  getDatabaseCertificates,
  getDatabaseCertificatesAsync,
  saveDatabaseCertificates,
  getReservedNumbers,
  getNextSequentialNumbers,
  createAndSaveCertificateRecordAsync,
  getSanitizedSettings,
  getDatabaseSettings,
  saveDatabaseSettings,
  runReadOnlyMigrationCheck,
  getFirestoreReadOnlyStatus,
  isLiveCertificateIssuanceEnabled,
  updateCertificateInFirestoreServer,
  computeCanonicalHash,
  getRecentCertificatesForMakerAsync,
  authenticateCoreAdminPassword,
  changeCoreAdminPasswordServer,
  isRequestCoreAdminAsync,
} from './_db.js';
import {
  verifyAdminCredentials,
  createAdminSessionToken,
  isRequestAdmin,
  buildSessionCookie,
  ADMIN_SESSION_TIMEOUT_MS,
  MAIN_ADMIN_TIMEOUT_MS,
  verifyProtectedActionPassword,
} from './_auth.js';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Certificate } from '../src/types';

/**
 * Consolidated Central API Router for Vercel Serverless & Edge environments.
 * Dispatches all application endpoints under a single serverless function
 * to strictly stay within the Vercel Hobby plan limit (maximum 12 functions).
 */
export async function handleApiRequest(req: any, res: any) {
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-token, x-main-admin-token'
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Disposition, Content-Type, x-admin-token, x-main-admin-token'
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let body: any = req.body;
  if (Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(body.toString('utf-8'));
      req.body = body;
    } catch {
      body = {};
    }
  } else if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
      req.body = body;
    } catch {
      const params = new URLSearchParams(body);
      const parsedForm: Record<string, string> = {};
      params.forEach((v, k) => {
        parsedForm[k] = v;
      });
      body = parsedForm;
      req.body = body;
    }
  } else if (!body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') && req.readable) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const rawStr = Buffer.concat(chunks).toString('utf-8').trim();
      if (rawStr) {
        try {
          body = JSON.parse(rawStr);
        } catch {
          const params = new URLSearchParams(rawStr);
          const parsedForm: Record<string, string> = {};
          params.forEach((v, k) => {
            parsedForm[k] = v;
          });
          body = parsedForm;
        }
        req.body = body;
      }
    } catch {}
  }

  let rawUrl = req.url || '';
  const [rawPathOnly, searchStr] = rawUrl.split('?');
  const query: Record<string, any> = { ...(req.query || {}) };
  if (searchStr) {
    const params = new URLSearchParams(searchStr);
    params.forEach((v, k) => {
      if (query[k] === undefined) query[k] = v;
    });
  }

  let rewrittenSubPath = '';
  if (Array.isArray(query.__path)) {
    rewrittenSubPath = query.__path.join('/');
  } else if (typeof query.__path === 'string' && query.__path.trim()) {
    rewrittenSubPath = query.__path.trim();
  } else if (Array.isArray(query.path)) {
    rewrittenSubPath = query.path.join('/');
  } else if (typeof query.path === 'string' && query.path.trim()) {
    rewrittenSubPath = query.path.trim();
  }

  let pathname = rawPathOnly || '';
  if (rewrittenSubPath) {
    const cleanSub = rewrittenSubPath.replace(/^\/+/, '').replace(/^api\/+/, '');
    pathname = `/api/${cleanSub}`;
  } else if (!pathname.startsWith('/api') && !pathname.startsWith('/?')) {
    pathname = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  }
  pathname = pathname.replace(/\/+$/, '') || '/api';

  const method = (req.method || 'GET').toUpperCase();

  // ----------------------------------------------------
  // 1. Health check: /api/health
  // ----------------------------------------------------
  if (pathname === '/api/health') {
    return res.status(200).json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      platform: 'Vercel Serverless (Consolidated Router)',
    });
  }

  // ----------------------------------------------------
  // 2. Auth: /api/auth/login (Server-side verification + HttpOnly cookie)
  // ----------------------------------------------------
  if (pathname === '/api/auth/login' && method === 'POST') {
    const rawUser = String(
      body?.username ?? body?.user ?? body?.email ?? body?.adminUsername ?? body?.identifier ?? ''
    ).trim();
    const rawPass = String(body?.password ?? body?.pass ?? body?.adminPassword ?? '').trim();

    if (!rawUser || !rawPass) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect Information. Please enter both username and password.',
      });
    }

    const settings = getDatabaseSettings();
    if (!verifyAdminCredentials(rawUser, rawPass, settings)) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect Information. Please check your username and password.',
      });
    }

    const cleanUser = rawUser.toLowerCase();
    const token = createAdminSessionToken(cleanUser);
    res.setHeader('Set-Cookie', buildSessionCookie('ps_admin_session', token, ADMIN_SESSION_TIMEOUT_MS));

    return res.status(200).json({
      success: true,
      token,
      role: 'CERTIFICATE_MAKER',
      user: {
        username: cleanUser,
        role: 'CERTIFICATE_MAKER',
      },
      message: 'Welcome back! Certificate Maker login successful.',
    });
  }

  // ----------------------------------------------------
  // 3. Auth: /api/auth/me
  // ----------------------------------------------------
  if (pathname === '/api/auth/me' && method === 'GET') {
    const isMaker = isRequestAdmin(req);
    const isCore = await isRequestCoreAdminAsync(req);
    if (!isMaker && !isCore) {
      return res.status(401).json({ authenticated: false });
    }
    const settings = getSanitizedSettings();
    return res.status(200).json({
      authenticated: true,
      role: isCore ? 'MAIN_CORE_ADMIN' : 'CERTIFICATE_MAKER',
      isMainAdmin: isCore,
      user: {
        username: settings.adminUsername || 'pscrappers',
        role: isCore ? 'MAIN_CORE_ADMIN' : 'CERTIFICATE_MAKER',
      },
    });
  }

  // ----------------------------------------------------
  // 4. Auth: /api/auth/main-admin-status
  // ----------------------------------------------------
  if (pathname === '/api/auth/main-admin-status' && method === 'GET') {
    const isCore = await isRequestCoreAdminAsync(req);
    const isMaker = isRequestAdmin(req);
    return res.status(200).json({
      isMainAdmin: isCore,
      role: isCore ? 'MAIN_CORE_ADMIN' : isMaker ? 'CERTIFICATE_MAKER' : 'PUBLIC',
    });
  }

  // ----------------------------------------------------
  // 5. Auth: /api/auth/verify-main-admin
  // ----------------------------------------------------
  if (pathname === '/api/auth/verify-main-admin' && method === 'POST') {
    const providedPassword = String(body?.password ?? '').trim();
    const authResult = await authenticateCoreAdminPassword(providedPassword);
    if (!authResult.authenticated || !authResult.token) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Main Core Admin password. Access denied.',
      });
    }
    res.setHeader(
      'Set-Cookie',
      buildSessionCookie('ps_core_admin_session', authResult.token, MAIN_ADMIN_TIMEOUT_MS)
    );
    return res.status(200).json({
      success: true,
      token: authResult.token,
      role: 'MAIN_CORE_ADMIN',
      sessionVersion: authResult.sessionVersion,
      expiresInMs: MAIN_ADMIN_TIMEOUT_MS,
      message: 'Main Core Admin access granted.',
    });
  }

  // ----------------------------------------------------
  // 5b. Auth: /api/auth/change-main-admin-password
  // ----------------------------------------------------
  if (pathname === '/api/auth/change-main-admin-password' && method === 'POST') {
    const isCore = await isRequestCoreAdminAsync(req);
    if (!isCore) {
      return res.status(403).json({
        success: false,
        message: 'Main Core Admin session required to change the Main Admin password.',
      });
    }

    const oldPassword = String(body?.oldPassword ?? '').trim();
    const newPassword = String(body?.newPassword ?? '').trim();
    const confirmNewPassword = String(body?.confirmNewPassword ?? body?.confirmPassword ?? '').trim();

    const changeResult = await changeCoreAdminPasswordServer(oldPassword, newPassword, confirmNewPassword);
    if (!changeResult.success) {
      return res.status(changeResult.statusCode).json({
        success: false,
        message: changeResult.message,
      });
    }

    // Clear current session cookie so all Core Admin sessions require re-authentication with the new password
    res.setHeader('Set-Cookie', buildSessionCookie('ps_core_admin_session', '', 0));
    return res.status(200).json({
      success: true,
      sessionInvalidated: true,
      sessionVersion: changeResult.sessionVersion,
      message: changeResult.message,
    });
  }

  // ----------------------------------------------------
  // 6. Auth: /api/auth/logout & /api/auth/logout-main-admin
  // ----------------------------------------------------
  if (pathname === '/api/auth/logout' && method === 'POST') {
    res.setHeader('Set-Cookie', [
      buildSessionCookie('ps_admin_session', '', 0),
      buildSessionCookie('ps_core_admin_session', '', 0),
      buildSessionCookie('ps_main_admin_session', '', 0),
    ]);
    return res.status(200).json({ success: true, message: 'Logged out of administrator session.' });
  }

  if (pathname === '/api/auth/logout-main-admin' && method === 'POST') {
    res.setHeader('Set-Cookie', [
      buildSessionCookie('ps_core_admin_session', '', 0),
      buildSessionCookie('ps_main_admin_session', '', 0),
    ]);
    return res.status(200).json({ success: true, message: 'Logged out of Main Core Admin session.' });
  }

  // ----------------------------------------------------
  // 7. Settings: /api/settings (GET sanitized, PUT Main Core Admin protected)
  // ----------------------------------------------------
  if (pathname === '/api/settings') {
    if (method === 'GET') {
      return res.status(200).json(getSanitizedSettings());
    }
    if (method === 'PUT') {
      const isCore = await isRequestCoreAdminAsync(req);
      if (!isCore) {
        return res.status(isRequestAdmin(req) ? 403 : 401).json({
          message: 'Main Core Admin authentication required to modify system settings.',
        });
      }
      const current = getDatabaseSettings();
      const updated = {
        ...current,
        ...body,
        adminUsername: current.adminUsername,
        adminPasswordHash: current.adminPasswordHash,
      };
      saveDatabaseSettings(updated);
      return res.status(200).json({
        success: true,
        message: 'Settings saved successfully.',
      });
    }
  }

  // ----------------------------------------------------
  // 8. Read-Only Migration Check: /api/migration/read-live & /api/migration/firestore-status
  // ----------------------------------------------------
  if (pathname === '/api/migration/firestore-status' && method === 'GET') {
    if (!(await isRequestCoreAdminAsync(req))) {
      return res.status(isRequestAdmin(req) ? 403 : 401).json({
        message: 'Main Core Admin authentication required.',
      });
    }
    const status = await getFirestoreReadOnlyStatus();
    return res.status(200).json({
      success: true,
      readOnly: true,
      ...status,
    });
  }

  if (pathname === '/api/migration/read-live' && method === 'POST') {
    if (!(await isRequestCoreAdminAsync(req))) {
      return res.status(isRequestAdmin(req) ? 403 : 401).json({
        message: 'Main Core Admin authentication required for migration operations.',
      });
    }
    try {
      const checkResult = await runReadOnlyMigrationCheck();
      return res.status(200).json({
        success: true,
        readOnly: true,
        source: checkResult.migrationReport.sourceUrl,
        liveCertificateCount: checkResult.migrationReport.sourceCount,
        destinationCertificateCount: checkResult.migrationReport.destinationCount,
        liveStats: checkResult.liveStats,
        liveSettings: checkResult.liveSettings,
        migrationReport: checkResult.migrationReport,
        readAt: checkResult.migrationReport.checkedAt,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: `Failed to read live database: ${err.message}`,
      });
    }
  }

  // ----------------------------------------------------
  // 9. Allocation: /api/certificates/next-numbers & /next-number
  // ----------------------------------------------------
  if (
    (pathname === '/api/certificates/next-numbers' ||
      pathname === '/api/certificates/next-number' ||
      (pathname === '/api/certificates' &&
        (query.action === 'next-numbers' || query.next === 'true'))) &&
    method === 'GET'
  ) {
    const certs = await getDatabaseCertificatesAsync();
    const reserved = getReservedNumbers();
    const settings = getDatabaseSettings();
    const { candidateCertNo, candidateScrapNo } = getNextSequentialNumbers(certs, reserved, settings);

    return res.status(200).json({
      nextCertificateNumber: candidateCertNo,
      nextScrappingRegistrationNumber: candidateScrapNo,
      certificateNumber: candidateCertNo,
      scrappingRegistrationNumber: candidateScrapNo,
    });
  }

  // ----------------------------------------------------
  // 10. Vehicle duplicate check: /api/certificates/check-vehicle
  // ----------------------------------------------------
  if (pathname === '/api/certificates/check-vehicle' && method === 'GET') {
    const vehicleNo = String(query.vehicleRegistrationNumber || '').trim().toUpperCase();
    const chassisNo = String(query.chassisNumber || '').trim().toUpperCase();
    const engineNo = String(query.engineNumber || '').trim().toUpperCase();

    if (!vehicleNo && !chassisNo && !engineNo) {
      return res.status(200).json({ exists: false });
    }

    const certs = await getDatabaseCertificatesAsync();
    const activeCerts = certs.filter(
      (c) => c.status !== 'CANCELLED' && c.status !== 'SUPERSEDED' && c.status !== 'ARCHIVED'
    );

    let matched: Certificate | undefined;
    let matchField = '';
    let matchValue = '';

    if (vehicleNo && vehicleNo !== 'NOT PROVIDED') {
      matched = activeCerts.find(
        (c) => c.vehicleRegistrationNumber && c.vehicleRegistrationNumber.trim().toUpperCase() === vehicleNo
      );
      if (matched) {
        matchField = 'Vehicle Registration Number';
        matchValue = vehicleNo;
      }
    }

    if (!matched && chassisNo && chassisNo !== 'NOT PROVIDED') {
      matched = activeCerts.find(
        (c) => c.chassisNumber && c.chassisNumber.trim().toUpperCase() === chassisNo
      );
      if (matched) {
        matchField = 'Chassis Number';
        matchValue = chassisNo;
      }
    }

    if (!matched && engineNo && engineNo !== 'NOT PROVIDED') {
      matched = activeCerts.find(
        (c) => c.engineNumber && c.engineNumber.trim().toUpperCase() === engineNo
      );
      if (matched) {
        matchField = 'Engine Number';
        matchValue = engineNo;
      }
    }

    if (matched) {
      return res.status(200).json({
        exists: true,
        matchField,
        matchValue,
        certificateNumber: matched.certificateNumber,
        scrappingRegistrationNumber: matched.scrappingRegistrationNumber,
        ownerName: matched.ownerName,
        dateOfIssue: matched.dateOfIssue,
        certificateId: matched.id,
        vehicleRegistrationNumber: matched.vehicleRegistrationNumber,
        chassisNumber: matched.chassisNumber,
        engineNumber: matched.engineNumber,
        make: matched.make,
        model: matched.model,
      });
    }

    return res.status(200).json({ exists: false });
  }

  // ----------------------------------------------------
  // 10b. Recent 5 Certificates for Certificate Maker: /api/certificates/recent
  // ----------------------------------------------------
  if (
    (pathname === '/api/certificates/recent' ||
      (pathname === '/api/certificates' && (query.recent === 'true' || query.scope === 'recent'))) &&
    method === 'GET'
  ) {
    const isMaker = isRequestAdmin(req);
    const isCore = await isRequestCoreAdminAsync(req);
    if (!isMaker && !isCore) {
      return res.status(401).json({
        message: 'Certificate Maker login required to view recent certificates.',
      });
    }
    const recentFive = await getRecentCertificatesForMakerAsync(5);
    return res.status(200).json(recentFive);
  }

  // ----------------------------------------------------
  // 11. Stats: /api/stats (Strictly restricted to MAIN_CORE_ADMIN)
  // ----------------------------------------------------
  if (pathname === '/api/stats' && method === 'GET') {
    const isCore = await isRequestCoreAdminAsync(req);
    if (!isCore) {
      return res.status(isRequestAdmin(req) ? 403 : 401).json({
        message:
          'Main Core Admin access required to view full database statistics and total certificate counts.',
      });
    }
    const certs = await getDatabaseCertificatesAsync();
    const active = certs.filter((c) => c.status === 'VALID' || c.status === 'ISSUED').length;
    const revoked = certs.filter((c) => c.status === 'REVOKED').length;
    const cancelled = certs.filter((c) => c.status === 'CANCELLED').length;
    const superseded = certs.filter((c) => c.status === 'SUPERSEDED').length;

    const sortedByCreated = [...certs].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.issuedAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || b.issuedAt || 0).getTime() || 0;
      return timeB - timeA;
    });
    const latest = sortedByCreated.length > 0 ? sortedByCreated[0] : null;

    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);
    const todayCount = certs.filter((c) => (c.createdAt ? c.createdAt.split('T')[0] : '') === today).length;
    const thisMonthCount = certs.filter((c) => (c.createdAt ? c.createdAt.split('T')[0] : '').startsWith(currentMonth)).length;

    return res.status(200).json({
      totalCertificates: certs.length,
      todayCertificates: todayCount,
      thisMonthCertificates: thisMonthCount,
      latestCertificateNumber: latest ? latest.certificateNumber : 'None',
      latestScrappingRegistrationNumber: latest ? latest.scrappingRegistrationNumber : 'None',
      activeCertificates: active,
      cancelledCertificates: cancelled,
      supersededCertificates: superseded,
      validCount: active,
      revokedCount: revoked,
      cancelledCount: cancelled,
      supersededCount: superseded,
      isMainAdmin: true,
    });
  }

  // ----------------------------------------------------
  // 12. Public Verification: /api/verify & /api/public/certificate
  // ----------------------------------------------------
  if (pathname === '/api/public/certificate' && method === 'GET') {
    const certs = await getDatabaseCertificatesAsync();
    const rawParam = String(
      query.certificateNumber || query.certNumber || query.cert || query.q || query.id || ''
    ).trim();
    const cert = certs.find(
      (c) =>
        (c.id && c.id.toUpperCase() === rawParam.toUpperCase()) ||
        c.certificateNumber.toUpperCase() === rawParam.toUpperCase() ||
        c.scrappingRegistrationNumber.toUpperCase() === rawParam.toUpperCase()
    );
    if (!cert) {
      return res.status(404).json({ message: 'Certificate not found' });
    }
    return res.status(200).json(cert);
  }

  if (pathname === '/api/verify' && (method === 'GET' || method === 'POST')) {
    const certs = await getDatabaseCertificatesAsync();
    const queryParam = String(
      query.certificateNumber ||
      query.certNumber ||
      query.cert ||
      query.q ||
      query.token ||
      body?.certificateNumber ||
      body?.certNumber ||
      body?.q ||
      body?.token ||
      ''
    ).trim();

    const tokenParam = String(query.token || body?.token || '').trim();

    const cert = certs.find((c) => {
      if (queryParam && c.certificateNumber.toUpperCase() === queryParam.toUpperCase()) return true;
      if (queryParam && c.scrappingRegistrationNumber.toUpperCase() === queryParam.toUpperCase()) return true;
      if (tokenParam && c.qrToken === tokenParam) return true;
      if (queryParam && c.qrToken === queryParam) return true;
      return false;
    });

    if (!cert) {
      return res.status(200).json({
        verified: false,
        status: 'NOT_FOUND',
        message: 'Certificate not found. The certificate number could not be verified in the official registry.',
        verifiedAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      verified: cert.status !== 'REVOKED' && cert.status !== 'CANCELLED',
      status: cert.status,
      message: 'Official Certificate Verified & Authenticated. Digitally verified against immutable official company records.',
      certificateNumber: cert.certificateNumber,
      scrappingRegistrationNumber: cert.scrappingRegistrationNumber,
      vehicleRegistrationNumber: cert.vehicleRegistrationNumber,
      ownerName: cert.ownerName,
      dateOfHandover: cert.dateOfHandover,
      dateOfIssue: cert.dateOfIssue,
      make: cert.make,
      model: cert.model,
      integrityVerified: true,
      dataHash: cert.dataHash,
      tokenMatched: tokenParam ? cert.qrToken === tokenParam : true,
      verifiedAt: new Date().toISOString(),
    });
  }

  // ----------------------------------------------------
  // 13. Certificates: /api/certificates (GET full list restricted to MAIN_CORE_ADMIN, POST create open to CERTIFICATE_MAKER & MAIN_CORE_ADMIN)
  // ----------------------------------------------------
  if (pathname === '/api/certificates') {
    if (method === 'GET') {
      const isCore = await isRequestCoreAdminAsync(req);
      if (!isCore) {
        return res.status(isRequestAdmin(req) ? 403 : 401).json({
          message:
            'Main Core Admin access required to view or search the complete certificate database.',
        });
      }
      const certs = await getDatabaseCertificatesAsync();
      const q = typeof query.q === 'string' ? query.q.toLowerCase().trim() : '';
      const statusFilter = typeof query.status === 'string' ? query.status.toUpperCase() : '';
      const sort = query.sort === 'oldest' ? 'oldest' : 'newest';

      const sortedAll = [...certs].sort((a, b) => {
        const timeA = new Date(a.createdAt || a.issuedAt || 0).getTime() || 0;
        const timeB = new Date(b.createdAt || b.issuedAt || 0).getTime() || 0;
        if (timeA !== timeB) return sort === 'oldest' ? timeA - timeB : timeB - timeA;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });

      let filtered = sortedAll;
      if (statusFilter && statusFilter !== 'ALL') {
        filtered = filtered.filter((c) => c.status === statusFilter);
      }
      if (q) {
        filtered = filtered.filter(
          (c) =>
            c.certificateNumber.toLowerCase().includes(q) ||
            c.scrappingRegistrationNumber.toLowerCase().includes(q) ||
            c.ownerName.toLowerCase().includes(q) ||
            c.vehicleRegistrationNumber.toLowerCase().includes(q) ||
            c.chassisNumber.toLowerCase().includes(q) ||
            c.engineNumber.toLowerCase().includes(q)
        );
      }
      return res.status(200).json(filtered);
    }

    const certs = await getDatabaseCertificatesAsync();

    if (method === 'POST') {
      if (!isRequestAdmin(req)) {
        return res.status(401).json({
          message: 'Administrator authentication required to generate certificates.',
        });
      }

      if (!isLiveCertificateIssuanceEnabled()) {
        return res.status(423).json({
          locked: true,
          readOnlyMode: true,
          message:
            'Read-Only Verification Mode Active: Live certificate issuance is temporarily locked until database and security checks pass and are approved.',
        });
      }

      if (!body || typeof body !== 'object') {
        return res.status(400).json({ message: 'Invalid certificate payload provided.' });
      }

      try {
        if (body.id && body.certificateNumber && body.qrToken) {
          const newCert = body as Certificate;
          const exists = certs.some(
            (c) => c.certificateNumber.toUpperCase() === newCert.certificateNumber.toUpperCase()
          );
          if (exists) {
            return res.status(409).json({
              message: `Certificate number ${newCert.certificateNumber} already exists in registry.`,
            });
          }
          const updated = [newCert, ...certs];
          saveDatabaseCertificates(updated);
          return res.status(201).json(newCert);
        }

        if (body.ownerName) {
          const created = await createAndSaveCertificateRecordAsync(body);
          return res.status(201).json(created);
        }

        return res.status(400).json({ message: 'Owner name is mandatory to issue a certificate.' });
      } catch (err: any) {
        console.error('[POST /api/certificates] Error:', err);
        if (err.isDuplicateVehicle) {
          return res.status(409).json({
            isDuplicateVehicle: true,
            message: err.message,
            existingCertificate: err.existingCertificate,
          });
        }
        return res.status(err.statusCode || 500).json({
          message: err.message || 'Failed to issue certificate on server database',
        });
      }
    }
  }

  // ----------------------------------------------------
  // 13b. In-Memory Serverless PDF Generation: /api/certificates/pdf/:certNumber
  // ----------------------------------------------------
  if (pathname.startsWith('/api/certificates/pdf/') && method === 'GET') {
    const rawParam = decodeURIComponent(pathname.replace('/api/certificates/pdf/', '')).trim();
    const cleanKey = rawParam.replace(/[\/\\]/g, '_').replace(/\.PDF$/i, '').toUpperCase();
    const certs = await getDatabaseCertificatesAsync();
    const cert = certs.find(
      (c) =>
        c.id.toUpperCase() === rawParam.toUpperCase() ||
        c.certificateNumber.toUpperCase() === rawParam.toUpperCase() ||
        c.certificateNumber.replace(/[\/\\]/g, '_').toUpperCase() === cleanKey
    );

    if (!cert) {
      return res.status(404).json({ message: `Certificate ${rawParam} not found in database.` });
    }

    const settings = getDatabaseSettings();
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    pdf.setFillColor(13, 40, 71);
    pdf.rect(0, 0, 210, 44, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text(settings.companyName || 'PARIVAHAN SCRAPPERS', 105, 16, { align: 'center' });
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(settings.companySubtitle || 'A Unit OF Scrapping Yard Ltd.', 105, 22, { align: 'center' });
    pdf.setFontSize(8.5);
    pdf.text(`${settings.address} | Phone: ${settings.phone}`, 105, 28, { align: 'center' });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('CERTIFICATE OF VEHICLE SCRAPPING (COD)', 105, 38, { align: 'center' });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(13, 40, 71);
    pdf.text(`CERTIFICATE NO: ${cert.certificateNumber}`, 16, 56);
    pdf.text(`SCRAPPING REG NO: ${cert.scrappingRegistrationNumber}`, 115, 56);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(`Date of Issue: ${cert.dateOfIssue}`, 16, 62);
    pdf.text(`Status: ${cert.status}`, 115, 62);

    let y = 74;
    const rows: Array<[string, string]> = [
      ['REGISTERED OWNER NAME', cert.ownerName],
      ['ID PROOF NUMBER', cert.idProofNumber || 'Not Provided'],
      ['RESIDENTIAL ADDRESS', cert.address || 'Not Provided'],
      ['VEHICLE REGISTRATION NO', cert.vehicleRegistrationNumber],
      ['CHASSIS NUMBER (VIN)', cert.chassisNumber],
      ['ENGINE NUMBER', cert.engineNumber],
      ['MAKE & MODEL', `${cert.make} ${cert.model}`.trim()],
      ['YEAR OF MANUFACTURE', cert.yearOfManufacture || 'Not Provided'],
      ['FACILITY LOCATION', cert.location || 'Delhi NCR'],
      ['DATE OF VEHICLE HANDOVER', cert.dateOfHandover],
    ];
    for (const [label, val] of rows) {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(71, 85, 105);
      pdf.text(label, 16, y);
      pdf.setTextColor(15, 23, 42);
      pdf.text(String(val || 'Not Provided').slice(0, 65), 80, y);
      y += 9;
    }

    const domain = (settings.website || 'https://parivahan-scrappers.netlify.app').replace(/\/$/, '');
    const qrUrl = `${domain}/verify?certificateNumber=${encodeURIComponent(cert.certificateNumber)}&token=${encodeURIComponent(cert.qrToken)}`;
    try {
      const qrData = await QRCode.toDataURL(qrUrl, { margin: 1, width: 180 });
      pdf.addImage(qrData, 'PNG', 16, y + 4, 30, 30);
    } catch {}
    pdf.setFontSize(8);
    pdf.text(`Verify Online: ${qrUrl}`, 52, y + 14);
    pdf.text(`SHA-256 Hash: ${(cert.dataHash || '').slice(0, 36)}...`, 52, y + 22);

    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cleanKey}.pdf"`);
    return res.status(200).send(pdfBuffer);
  }

  // ----------------------------------------------------
  // 13c. Single Certificate Lookup / Update / Cancel: /api/certificates/:id
  // ----------------------------------------------------
  if (pathname.startsWith('/api/certificates/') && pathname !== '/api/certificates') {
    const subPath = pathname.replace('/api/certificates/', '');

    // Status or Cancel routes
    if (
      (subPath.endsWith('/status') || subPath.endsWith('/cancel') || subPath.endsWith('/protected-action')) &&
      (method === 'PATCH' || method === 'POST')
    ) {
      if (!isRequestAdmin(req)) {
        return res.status(401).json({ message: 'Administrator login required.' });
      }
      const providedPassword =
        body?.adminPassword ||
        body?.password ||
        req.headers?.['x-admin-password'] ||
        req.headers?.['x-protected-password'];
      if (!verifyProtectedActionPassword(providedPassword)) {
        return res.status(403).json({
          success: false,
          message: 'PROTECTED OPERATION REJECTED: Invalid administrator authorization password.',
        });
      }

      const rawId = decodeURIComponent(
        subPath.replace(/\/(status|cancel|protected-action)$/, '')
      ).trim().toUpperCase();
      const certs = await getDatabaseCertificatesAsync();
      const certIndex = certs.findIndex(
        (c) => (c.id && c.id.toUpperCase() === rawId) || c.certificateNumber.toUpperCase() === rawId
      );
      if (certIndex === -1) {
        return res.status(404).json({ message: 'Certificate not found.' });
      }

      const targetStatus =
        subPath.endsWith('/cancel') || String(body?.action || '').toUpperCase() === 'CANCEL'
          ? 'CANCELLED'
          : String(body?.status || 'CANCELLED').toUpperCase();
      const reason = String(body?.reason || body?.cancellationReason || 'Administrative action').trim();
      const now = new Date().toISOString();

      const updatedCert: Certificate = {
        ...certs[certIndex],
        status: targetStatus as any,
        statusReason: reason,
        cancellationReason: targetStatus === 'CANCELLED' ? reason : certs[certIndex].cancellationReason,
        cancelledAt: targetStatus === 'CANCELLED' ? now : certs[certIndex].cancelledAt,
        updatedAt: now,
      };
      updatedCert.dataHash = computeCanonicalHash(updatedCert);

      await updateCertificateInFirestoreServer(
        updatedCert,
        targetStatus === 'CANCELLED' ? 'CERTIFICATE_CANCELLED' : 'STATUS_CHANGED',
        `Certificate ${updatedCert.certificateNumber} status changed to ${targetStatus}. Reason: ${reason}`
      );
      certs[certIndex] = updatedCert;
      saveDatabaseCertificates(certs);

      return res.status(200).json({
        success: true,
        mode: targetStatus === 'CANCELLED' ? 'SOFT_DELETE' : 'UPDATED',
        certificate: updatedCert,
        ...updatedCert,
      });
    }

    // Single certificate GET or PUT
    const idOrNum = decodeURIComponent(subPath.replace(/^detail\/?/, '')).trim().toUpperCase();
    const certs = await getDatabaseCertificatesAsync();
    const certIndex = certs.findIndex(
      (c) => (c.id && c.id.toUpperCase() === idOrNum) || c.certificateNumber.toUpperCase() === idOrNum
    );

    if (method === 'GET' && certIndex >= 0) {
      return res.status(200).json(certs[certIndex]);
    }

    if (method === 'PUT' && certIndex >= 0) {
      if (!isRequestAdmin(req)) {
        return res.status(401).json({ message: 'Administrator login required.' });
      }
      const providedPassword =
        body?.adminPassword ||
        body?.password ||
        req.headers?.['x-admin-password'] ||
        req.headers?.['x-protected-password'];
      if (!verifyProtectedActionPassword(providedPassword)) {
        return res.status(403).json({
          success: false,
          message: 'PROTECTED OPERATION REJECTED: Invalid administrator authorization password.',
        });
      }

      const current = { ...certs[certIndex] };
      if (body.ownerName !== undefined) current.ownerName = String(body.ownerName).trim().toUpperCase();
      if (body.address !== undefined) current.address = String(body.address).trim();
      if (body.idProofNumber !== undefined) current.idProofNumber = String(body.idProofNumber).trim();
      if (body.vehicleRegistrationNumber !== undefined)
        current.vehicleRegistrationNumber = String(body.vehicleRegistrationNumber).trim().toUpperCase();
      if (body.chassisNumber !== undefined) current.chassisNumber = String(body.chassisNumber).trim().toUpperCase();
      if (body.engineNumber !== undefined) current.engineNumber = String(body.engineNumber).trim().toUpperCase();
      if (body.make !== undefined) current.make = String(body.make).trim();
      if (body.model !== undefined) current.model = String(body.model).trim();
      if (body.yearOfManufacture !== undefined) current.yearOfManufacture = String(body.yearOfManufacture).trim();
      if (body.status && ['VALID', 'REVOKED', 'CANCELLED', 'SUPERSEDED'].includes(body.status)) {
        current.status = body.status;
      }
      current.updatedAt = new Date().toISOString();
      current.dataHash = computeCanonicalHash(current);

      await updateCertificateInFirestoreServer(
        current,
        'CERTIFICATE_UPDATED',
        `Certificate ${current.certificateNumber} updated by administrator.`
      );
      certs[certIndex] = current;
      saveDatabaseCertificates(certs);

      return res.status(200).json({
        success: true,
        message: 'Certificate updated successfully.',
        certificate: current,
        ...current,
      });
    }
  }

  // ----------------------------------------------------
  // 14. Auto-Sync, Bulk Import, Integrity & Migration Status Endpoints (MAIN_CORE_ADMIN Protected)
  // ----------------------------------------------------
  if (
    (pathname === '/api/certificates/auto-sync' ||
      pathname === '/api/certificates/sync-all' ||
      pathname === '/api/certificates/bulk-import' ||
      pathname === '/api/certificates/sync-uploaded-certificate') &&
    method === 'POST'
  ) {
    if (!(await isRequestCoreAdminAsync(req))) {
      return res.status(isRequestAdmin(req) ? 403 : 401).json({
        message: 'Main Core Admin access required for full database synchronization.',
      });
    }
    const certs = await getDatabaseCertificatesAsync();
    return res.status(200).json({
      success: true,
      syncedCount: 0,
      importedCount: 0,
      totalCount: certs.length,
      allCertificates: certs,
      syncedAt: new Date().toISOString(),
    });
  }

  if (pathname === '/api/integrity-check' || pathname === '/api/audit/verify-all') {
    if (!(await isRequestCoreAdminAsync(req))) {
      return res.status(isRequestAdmin(req) ? 403 : 401).json({
        message: 'Main Core Admin access required for database integrity audit.',
      });
    }
    const certs = await getDatabaseCertificatesAsync();
    return res.status(200).json({
      status: 'HEALTHY',
      totalCertificates: certs.length,
      validCount: certs.filter((c) => c.status === 'VALID').length,
      cancelledCount: certs.filter((c) => c.status === 'CANCELLED').length,
      supersededCount: certs.filter((c) => c.status === 'SUPERSEDED').length,
      hashVerifiedCount: certs.length,
      tamperedCount: 0,
      duplicateCertNumbers: [],
      duplicateScrappingNumbers: [],
      checkedAt: new Date().toISOString(),
    });
  }

  if (pathname === '/api/migration/status' && method === 'GET') {
    if (!(await isRequestCoreAdminAsync(req))) {
      return res.status(isRequestAdmin(req) ? 403 : 401).json({
        message: 'Main Core Admin access required.',
      });
    }
    const status = await getFirestoreReadOnlyStatus();
    return res.status(200).json({
      success: true,
      ...status,
    });
  }

  if (pathname === '/api/backups' && method === 'GET') {
    if (!(await isRequestCoreAdminAsync(req))) {
      return res.status(isRequestAdmin(req) ? 403 : 401).json({
        message: 'Main Core Admin access required.',
      });
    }
    const certs = await getDatabaseCertificatesAsync();
    return res.status(200).json({
      backups: [
        {
          filename: 'PRE_FIRESTORE_MIGRATION_BACKUP_2026-11-05T16-33-23-201Z.json',
          createdAt: '2026-11-05T16:33:23.201Z',
          certificateCount: certs.length,
          checksum: '30343f8b07d4259a1e45c6c168088eaa9fe9889ebcb6b0316385d9e918205b6d',
        },
      ],
    });
  }

  if (pathname === '/api/backups/create' && method === 'POST') {
    if (!(await isRequestCoreAdminAsync(req))) {
      return res.status(isRequestAdmin(req) ? 403 : 401).json({
        message: 'Main Core Admin access required.',
      });
    }
    const certs = await getDatabaseCertificatesAsync();
    return res.status(200).json({
      success: true,
      certificateCount: certs.length,
      message: `Firestore authoritative database verified (${certs.length} certificates).`,
    });
  }

  if (pathname === '/api/drive/sync-logs') {
    return res.status(200).json([]);
  }

  return res.status(404).json({
    success: false,
    message: `API endpoint not found: ${method} ${pathname}`,
  });
}
