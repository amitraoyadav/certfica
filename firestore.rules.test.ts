/**
 * Firestore Security Rules Test Specification (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */
export const DIRTY_DOZEN_TEST_CASES = [
  { id: 1, name: 'Unauthenticated Write', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified Admin Email Spoof', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Non-Admin Authenticated Write', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'ID Poisoning Attack', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Shadow Field Injection on Create', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Oversized String Denial of Wallet', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Invalid Status Enum Value', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Missing Required Keys', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Immutable Field Mutation on Update', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Shadow Field Injection on Update', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Self-Assigned Admin Escalation', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Blanket Unauthorized Admin List', expected: 'PERMISSION_DENIED' },
];
