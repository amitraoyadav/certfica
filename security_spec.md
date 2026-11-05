# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Strict Admin Governance**: Only verified administrators (`raoamityadavak123@gmail.com` with `email_verified == true` or UIDs registered in `/admins/{uid}`) may create, update, or list sensitive certificate records directly in Firestore.
2. **Valid Document IDs**: Every document ID (`certificateId`, `adminId`) must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
3. **Strict Schema Enforcement**: Certificate creations and updates must strictly match allowed keys and size limits defined in `firebase-blueprint.json`.
4. **Immutable Core Identifiers**: Once a certificate is issued, `id`, `certificateNumber`, `scrappingRegistrationNumber`, `qrToken`, and `createdAt` cannot be modified.
5. **Terminal State Protection**: Cancelled or Superseded certificates cannot be mutated by non-admins.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null`, attempting `create` on `/certificates/cert-1`.
2. **Unverified Admin Email Spoof**: `auth = { uid: 'u1', token: { email: 'raoamityadavak123@gmail.com', email_verified: false } }`, attempting `create` on `/certificates/cert-1`.
3. **Non-Admin Authenticated Write**: `auth = { uid: 'user2', token: { email: 'attacker@example.com', email_verified: true } }`, attempting `create` on `/certificates/cert-1`.
4. **ID Poisoning Attack**: `certificateId` with 300 characters or special characters `cert/../../hack`.
5. **Shadow Field Injection on Create**: Certificate payload containing unauthorized field `"isSuperAdmin": true`.
6. **Oversized String ("Denial of Wallet")**: `ownerName` with 5,000 characters (exceeds max 200).
7. **Invalid Enum Value**: `status` set to `"HACKED"` instead of `["VALID", "CANCELLED", "SUPERSEDED", "REVOKED"]`.
8. **Missing Required Keys**: Certificate payload missing `certificateNumber` or `qrToken`.
9. **Immutable Field Mutation on Update**: Updating `certificateNumber` or `createdAt` on an existing certificate.
10. **Shadow Field Injection on Update**: Updating an existing certificate with an unlisted key `secretFlag`.
11. **Self-Assigned Admin Escalation**: Non-admin user attempting to create `/admins/user2`.
12. **Blanket Unauthenticated List**: Unauthenticated client attempting to `list` `/admins` or `/certificates` without authorization.
