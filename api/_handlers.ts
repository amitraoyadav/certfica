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
} from './_db';
import {
  verifyAdminCredentials,
  createAdminSessionToken,
  isRequestAdmin,
  buildSessionCookie,
  ADMIN_SESSION_TIMEOUT_MS,
  verifyMainAdminPassword,
  createMainAdminToken,
  isMainAdminTokenValid,
  MAIN_ADMIN_TIMEOUT_MS,
  verifyProtectedActionPassword,
} from './_auth';
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

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
      req.body = body;
    } catch {}
  }

  let rawUrl = req.url || '';
  if (Array.isArray(req.query?.path)) {
    rawUrl = `/api/${req.query.path.join('/')}`;
  } else if (typeof req.query?.path === 'string') {
    rawUrl = `/api/${req.query.path}`;
  }

  const [pathOnly, searchStr] = rawUrl.split('?');
  let pathname = pathOnly || '';
  if (!pathname.startsWith('/api') && !pathname.startsWith('/?')) {
    pathname = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  }

  const query = req.query || {};
  if (searchStr && !req.query) {
    const params = new URLSearchParams(searchStr);
    params.forEach((v, k) => {
      query[k] = v;
    });
  }

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
      user: {
        username: cleanUser,
        role: 'administrator',
      },
      message: 'Welcome back! Administrator login successful.',
    });
  }

  // ----------------------------------------------------
  // 3. Auth: /api/auth/me
  // ----------------------------------------------------
  if (pathname === '/api/auth/me' && method === 'GET') {
    if (!isRequestAdmin(req)) {
      return res.status(401).json({ authenticated: false });
    }
    const settings = getSanitizedSettings();
    return res.status(200).json({
      authenticated: true,
      user: { username: settings.adminUsername || 'pscrappers', role: 'administrator' },
    });
  }

  // ----------------------------------------------------
  // 4. Auth: /api/auth/main-admin-status
  // ----------------------------------------------------
  if (pathname === '/api/auth/main-admin-status' && method === 'GET') {
    const token =
      req.headers?.['x-main-admin-token'] ||
      (typeof query.mainAdminToken === 'string' ? query.mainAdminToken : '');
    const valid = isMainAdminTokenValid(token) || isRequestAdmin(req);
    return res.status(200).json({ isMainAdmin: valid });
  }

  // ----------------------------------------------------
  // 5. Auth: /api/auth/verify-main-admin
  // ----------------------------------------------------
  if (pathname === '/api/auth/verify-main-admin' && method === 'POST') {
    const providedPassword = String(body?.password ?? '').trim();
    if (!verifyMainAdminPassword(providedPassword)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Main Admin password. Access denied.',
      });
    }
    const token = createMainAdminToken();
    res.setHeader('Set-Cookie', buildSessionCookie('ps_main_admin_session', token, MAIN_ADMIN_TIMEOUT_MS));
    return res.status(200).json({
      success: true,
      token,
      expiresInMs: MAIN_ADMIN_TIMEOUT_MS,
      message: 'Main Admin access granted.',
    });
  }

  // ----------------------------------------------------
  // 6. Auth: /api/auth/logout-main-admin
  // ----------------------------------------------------
  if (pathname === '/api/auth/logout-main-admin' && method === 'POST') {
    res.setHeader('Set-Cookie', buildSessionCookie('ps_main_admin_session', '', 0));
    return res.status(200).json({ success: true, message: 'Logged out of Main Admin session.' });
  }

  // ----------------------------------------------------
  // 7. Settings: /api/settings (GET sanitized, PUT admin-protected)
  // ----------------------------------------------------
  if (pathname === '/api/settings') {
    if (method === 'GET') {
      return res.status(200).json(getSanitizedSettings());
    }
    if (method === 'PUT') {
      if (!isRequestAdmin(req)) {
        return res.status(401).json({ message: 'Administrator authentication required.' });
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
    if (!isRequestAdmin(req)) {
      return res.status(401).json({ message: 'Administrator authentication required.' });
    }
    const status = await getFirestoreReadOnlyStatus();
    return res.status(200).json({
      success: true,
      readOnly: true,
      ...status,
    });
  }

  if (pathname === '/api/migration/read-live' && method === 'POST') {
    if (!isRequestAdmin(req)) {
      return res.status(401).json({ message: 'Administrator authentication required for migration operations.' });
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
  // 11. Stats: /api/stats
  // ----------------------------------------------------
  if (pathname === '/api/stats' && method === 'GET') {
    const certs = await getDatabaseCertificatesAsync();
    const active = certs.filter((c) => c.status === 'VALID' || c.status === 'ISSUED').length;
    const revoked = certs.filter((c) => c.status === 'REVOKED').length;
    const cancelled = certs.filter((c) => c.status === 'CANCELLED').length;
    const superseded = certs.filter((c) => c.status === 'SUPERSEDED').length;

    const sortedBySeq = [...certs].sort((a, b) => {
      const mA = String(a.certificateNumber || '').match(/(\d+)$/);
      const mB = String(b.certificateNumber || '').match(/(\d+)$/);
      const seqA = mA ? parseInt(mA[1], 10) : 0;
      const seqB = mB ? parseInt(mB[1], 10) : 0;
      if (seqA !== seqB) return seqB - seqA;
      return (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0);
    });
    const latest = sortedBySeq.length > 0 ? sortedBySeq[0] : null;

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
  // 12. Public Verification: /api/verify
  // ----------------------------------------------------
  if (pathname === '/api/verify' && method === 'GET') {
    const certs = await getDatabaseCertificatesAsync();
    const queryParam = String(
      query.certificateNumber ||
      query.certNumber ||
      query.cert ||
      query.q ||
      query.token ||
      ''
    ).trim();

    const tokenParam = String(query.token || '').trim();

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
      verifiedAt: new Date().toISOString(),
    });
  }

  // ----------------------------------------------------
  // 13. Certificates: /api/certificates (GET list, POST create)
  // ----------------------------------------------------
  if (pathname === '/api/certificates') {
    const certs = await getDatabaseCertificatesAsync();

    if (method === 'GET') {
      const q = typeof query.q === 'string' ? query.q.toLowerCase().trim() : '';
      const statusFilter = typeof query.status === 'string' ? query.status.toUpperCase() : '';
      const sort = query.sort === 'oldest' ? 'oldest' : 'newest';

      const sortedAll = [...certs].sort((a, b) => {
        const mA = String(a.certificateNumber || '').match(/(\d+)$/);
        const mB = String(b.certificateNumber || '').match(/(\d+)$/);
        const seqA = mA ? parseInt(mA[1], 10) : 0;
        const seqB = mB ? parseInt(mB[1], 10) : 0;
        if (seqA !== seqB) return sort === 'oldest' ? seqA - seqB : seqB - seqA;
        const timeA = new Date(a.createdAt || 0).getTime() || 0;
        const timeB = new Date(b.createdAt || 0).getTime() || 0;
        return sort === 'oldest' ? timeA - timeB : timeB - timeA;
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
  // 14. Fallback to Express app for all remaining routes
  // ----------------------------------------------------
  try {
    req.url = rawUrl;
    const serverMod = await import('../server');
    if (serverMod && typeof serverMod.app === 'function') {
      return serverMod.app(req, res);
    }
    return res.status(404).json({
      success: false,
      message: `API endpoint not found: ${method} ${pathname}`,
    });
  } catch (err: any) {
    console.error('[Fallback Router Error]:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Internal server error.',
    });
  }
}
