const BASE_URL = 'http://localhost:3000';

async function verifyRbacGates() {
  console.log('======================================================================');
  console.log('   STRICT RBAC & PRIVILEGE ESCALATION PREVENTION AUDIT (POINT 9)      ');
  console.log('======================================================================');

  // 1. Obtain Certificate Maker token
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'pscrappers', password: 'Scrap123' }),
  });
  const loginData = await loginRes.json();
  const makerToken = loginData.token;
  console.log(`[AUTH] Certificate Maker token obtained (Role: ${loginData.role})`);

  const endpointsToTest = [
    { method: 'GET', path: '/api/certificates', name: 'Complete Certificate Registry' },
    { method: 'GET', path: '/api/stats', name: 'Database Statistics & Total Counts' },
    { method: 'GET', path: '/api/backups', name: 'Database Backup Snapshots List' },
    { method: 'POST', path: '/api/backups/create', name: 'Create Verified Backup' },
    { method: 'POST', path: '/api/backups/test-restore', name: 'Test Disaster Recovery' },
    { method: 'GET', path: '/api/platform/health-and-storage', name: 'Platform Health & Quota Telemetry' },
    { method: 'GET', path: '/api/system/errors', name: 'System Diagnostic Error Logs' },
    { method: 'GET', path: '/api/system/health-checks', name: 'Automated 10-Point Health Checks' },
    { method: 'POST', path: '/api/auth/change-main-admin-password', name: 'Change Main Core Admin Password', body: { oldPassword: 'foo', newPassword: 'bar' } },
    { method: 'PUT', path: '/api/settings', name: 'System & Company Settings Modification', body: { companyName: 'Hacked' } },
    { method: 'GET', path: '/api/migration/status', name: 'Migration & Sync Center Status' },
  ];

  let passedGates = 0;
  let totalGates = 0;

  for (const ep of endpointsToTest) {
    // A. Anonymous / Unauthenticated Test
    totalGates++;
    const anonRes = await fetch(`${BASE_URL}${ep.path}`, {
      method: ep.method,
      headers: ep.body ? { 'Content-Type': 'application/json' } : {},
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    });
    const anonBlocked = anonRes.status === 401 || anonRes.status === 403;
    console.log(`[ANON] ${anonBlocked ? '✅ BLOCKED' : '❌ LEAK'} (${anonRes.status}) - ${ep.method} ${ep.path} [${ep.name}]`);
    if (anonBlocked) passedGates++;

    // B. Certificate Maker (Normal User) Test
    totalGates++;
    const makerRes = await fetch(`${BASE_URL}${ep.path}`, {
      method: ep.method,
      headers: {
        'x-admin-token': makerToken,
        Authorization: `Bearer ${makerToken}`,
        ...(ep.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    });
    const makerBlocked = makerRes.status === 401 || makerRes.status === 403;
    console.log(`[MAKER] ${makerBlocked ? '✅ BLOCKED' : '❌ LEAK'} (${makerRes.status}) - ${ep.method} ${ep.path} [${ep.name}]`);
    if (makerBlocked) passedGates++;
  }

  console.log('======================================================================');
  console.log(`RBAC GATE RESULTS: ${passedGates} OF ${totalGates} GATES STRICTLY ENFORCED`);
  console.log('======================================================================');

  if (passedGates !== totalGates) {
    process.exit(1);
  }
}

verifyRbacGates().catch(e => {
  console.error('RBAC Verification failure:', e);
  process.exit(1);
});
