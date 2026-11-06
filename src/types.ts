export type CertificateStatus = 'ISSUED' | 'VALID' | 'SUPERSEDED' | 'REVOKED' | 'CANCELLED' | 'ARCHIVED' | 'DELETED' | 'NOT_FOUND';

export interface CompanySnapshot {
  companyName: string;
  companySubtitle: string;
  address: string;
  phone: string;
  website: string;
  signatoryTitle: string;
}

export interface Certificate {
  id: string; // internal UUID or permanent database identifier
  certificateNumber: string; // e.g. "PS/26/R1000" or "CERT-000101"
  scrappingRegistrationNumber: string; // e.g. "REG-C272829"
  ownerName: string;
  address: string;
  idProofNumber?: string;
  vehicleRegistrationNumber: string; // RC Number (e.g. DL 01 AB 1234)
  chassisNumber: string;
  engineNumber: string;
  make: string;
  model: string;
  location: string; // "Delhi NCR"
  fuelType?: string;
  yearOfManufacture: string;
  dateOfHandover: string; // DD-MM-YYYY
  dateOfIssue: string; // DD-MM-YYYY
  qrToken: string; // secure random verification token
  verificationUrl: string;
  status: CertificateStatus;
  statusReason?: string;
  cancelledAt?: string; // Timestamp if cancelled/deleted
  cancellationReason?: string; // Mandatory reason if cancelled/deleted
  isArchived?: boolean;
  archivedAt?: string;
  archiveReason?: string;
  isImported?: boolean;
  importedAt?: string;
  driveFileId?: string;
  driveFileUrl?: string;
  driveBackupStatus?: 'BACKED_UP' | 'PENDING' | 'FAILED' | 'NOT_CONNECTED';
  createdBy?: string;
  showFullChassisEngine?: boolean; // When true/ticked, full chassis and engine numbers are shown; when false/unticked, numbers are masked
  isLocked?: boolean; // Permanently locked once issued to prevent accidental or unauthorized modifications
  lockedAt?: string; // Timestamp when certificate was permanently locked
  isImmutable?: boolean; // True once permanently committed to database
  dataHash?: string; // Cryptographic SHA-256 data integrity hash over canonical fields
  version?: number; // 1 for original, incremented on superseding/reissue
  issuedAt?: string; // Timestamp when certificate was issued
  supersededBy?: string; // If corrected/reissued, points to the new certificateNumber
  supersededAt?: string; // Timestamp when this certificate was superseded
  correctedFrom?: string; // If this is a corrected certificate, points to original certificateNumber
  correctionReason?: string; // Reason recorded by admin for the correction/reissue
  pdfReference?: string; // Reference or URL to generated PDF if stored
  aliases?: string[]; // Alternate/historical certificate numbers for search & verification
  companySnapshot: CompanySnapshot;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface SystemSettings {
  companyName: string;
  companySubtitle: string;
  address: string;
  phone: string;
  website: string;
  signatoryTitle: string;
  certificatePrefix: string; // "PS-2026-"
  certificateNextSeq: number; // e.g. 6
  scrappingPrefix: string; // "RS-2026-"
  scrappingNextSeq: number; // e.g. 6
  warnDuplicateVehicle: boolean;
  adminUsername?: string;
  adminPasswordHash?: string;
}

export interface DashboardStats {
  totalCertificates: number;
  todayCertificates: number;
  thisMonthCertificates: number;
  latestCertificateNumber: string;
  latestScrappingRegistrationNumber: string;
  validCount: number;
  revokedCount: number;
  cancelledCount: number;
  supersededCount: number;
  isMainAdmin?: boolean;
  recentCount?: number;
}

export interface PublicVerificationResponse {
  verified: boolean;
  status: CertificateStatus;
  message: string;
  certificateNumber?: string;
  scrappingRegistrationNumber?: string;
  vehicleRegistrationNumber?: string;
  ownerName?: string;
  idProofNumber?: string;
  dateOfHandover?: string;
  dateOfIssue?: string;
  make?: string;
  model?: string;
  location?: string;
  chassisNumberMasked?: string;
  engineNumberMasked?: string;
  showFullChassisEngine?: boolean;
  isLocked?: boolean;
  lockedAt?: string;
  isImmutable?: boolean;
  dataHash?: string;
  integrityVerified?: boolean;
  version?: number;
  supersededBy?: string;
  supersededAt?: string;
  correctedFrom?: string;
  correctionReason?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  issuedAt?: string;
  verifiedAt: string;
  companyName?: string;
  tokenMatched?: boolean;
}

export type AuditAction =
  | 'CERTIFICATE_CREATED'
  | 'CERTIFICATE_ISSUED'
  | 'CERTIFICATE_VIEWED'
  | 'CERTIFICATE_VERIFIED'
  | 'CERTIFICATE_DOWNLOADED'
  | 'REISSUE_REQUESTED'
  | 'CERTIFICATE_SUPERSEDED'
  | 'CERTIFICATE_REVOKED'
  | 'CERTIFICATE_CANCELLED'
  | 'CERTIFICATE_DELETED'
  | 'DELETE_ATTEMPT_FAILED'
  | 'DELETE_ATTEMPT_SUCCESS'
  | 'DATABASE_AUDIT_EXECUTED'
  | 'VERIFICATION_REFERENCE_REPAIRED'
  | 'VERIFICATION_FAILURE'
  | 'INTEGRITY_FAILURE'
  | 'PDF_MATCHED_DATABASE'
  | 'MAIN_ADMIN_AUTH_FAILED'
  | 'MAIN_ADMIN_AUTH_SUCCESS'
  | 'UPDATE_ATTEMPT_FAILED'
  | 'CERTIFICATE_UPDATED';

export interface AuditLogEntry {
  id: string;
  certificateId: string;
  certificateNumber: string;
  action: AuditAction;
  timestamp: string;
  actor?: string;
  ip?: string;
  userAgent?: string;
  oldStatus?: string;
  newStatus?: string;
  dataHash?: string;
  details?: string;
}

export interface CertificateAuditItem {
  id: string;
  certificateNumber: string;
  scrappingRegistrationNumber: string;
  ownerName: string;
  vehicleRegistrationNumber: string;
  status: CertificateStatus;
  hasUniqueId: boolean;
  isCertNumberUnique: boolean;
  isScrapNumberUnique: boolean;
  hasRequiredFields: boolean;
  missingFields: string[];
  hasQrReference: boolean;
  hasVerificationToken: boolean;
  hasPdfReference: boolean;
  integrityHashMatch: boolean;
  verificationSiteMatch: boolean;
  issues: string[];
  repaired?: boolean;
  repairDetails?: string;
}

export interface DatabaseAuditReport {
  timestamp: string;
  totalCertificates: number;
  validMatching: number;
  mismatched: number;
  missingVerification: number;
  duplicateCertificateNumbers: number;
  duplicateScrappingNumbers: number;
  missingQr: number;
  missingPdf: number;
  integrityErrors: number;
  orphanedRecords: number;
  allPassed: boolean;
  items: CertificateAuditItem[];
}

export interface GoogleDriveStatus {
  connected: boolean;
  userEmail?: string;
  userName?: string;
  rootFolderId?: string;
  certificatesFolderId?: string;
  importedFolderId?: string;
  backupsFolderId?: string;
  lastSyncTime?: string;
  backedUpCount: number;
  totalDrivePdfs: number;
  syncErrors: number;
}

export interface DriveSyncLog {
  id: string;
  timestamp: string;
  action: 'UPLOAD' | 'IMPORT' | 'BACKUP' | 'SYNC' | 'RESTORE' | 'FOLDER_INIT';
  certificateNumber?: string;
  driveFileId?: string;
  result: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  error?: string;
  details?: string;
}

export interface DataIntegrityReport {
  timestamp: string;
  totalCertificates: number;
  active: number;
  archived: number;
  imported: number;
  missingPdf: number;
  missingDriveFileId: number;
  missingDatabaseRecord: number;
  duplicates: number;
  syncErrors: number;
  details: string[];
}

export interface DatabaseBackupInfo {
  filename: string;
  timestamp: string;
  count: number;
  sizeBytes: number;
  driveFileId?: string;
  driveUrl?: string;
  isCurrent?: boolean;
}

export interface PdfImportReport {
  timestamp: string;
  totalScanned: number;
  importedCount: number;
  skippedDuplicates: number;
  failedCount: number;
  importedCertificates: Certificate[];
  duplicateCertificates: Array<{ certificateNumber: string; ownerName?: string; reason: string }>;
  failedFiles: Array<{ filename: string; error: string }>;
}

export interface MigrationChecksumInfo {
  size: number;
  sha256: string;
  recordCount: number;
}

export interface MigrationManifest {
  projectName: string;
  exportDate: string;
  sourceDatabase: string;
  targetDeployment: string;
  totalRecordsExported: number;
  totalUniqueCertificateIds: number;
  totalUniqueCertificateNumbers: number;
  recordCountsByStatus: {
    VALID: number;
    CANCELLED: number;
    SUPERSEDED: number;
  };
  backupVersion: string;
  checksumInformation: Record<string, MigrationChecksumInfo>;
  integrityVerificationStatus: string;
  missingRecordCount: number;
  duplicateRecordCount: number;
  exportErrors: string[];
}

export interface MigrationCenterStats {
  totalLiveCertificates: number;
  totalSuccessfullyBackedUp: number;
  totalVerifiedRecords: number;
  newRecords: number;
  updatedRecords: number;
  duplicateRecords: number;
  missingRecords: number;
  failedRecords: number;
  lastSuccessfulBackup: string;
  lastSuccessfulSync: string;
  lastSuccessfulSynchronisation?: string;
  manifest?: MigrationManifest;
  integrityReport?: any;
  exportFiles?: Array<{ name: string; size: number; sha256: string; recordCount: number }>;
}

