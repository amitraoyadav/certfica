import type { Certificate } from '../types';
import { maskChassisNumber, maskEngineNumber } from './maskUtils';

export const OFFICIAL_SENDER_EMAIL = 'certificates@parivahanscrappers.com';
export const OFFICIAL_SENDER_NAME = 'PARIVAHAN SCRAPPERS Official Registry';
export const OFFICIAL_RECORDS_EMAIL = 'records@parivahanscrappers.com';

/**
 * Generates an official email subject line for the certificate.
 */
export function generateCertificateEmailSubject(certificate: Certificate): string {
  return `[OFFICIAL DISPATCH] Vehicle Scrapping Certificate ${certificate.certificateNumber} - ${certificate.vehicleRegistrationNumber} | PARIVAHAN SCRAPPERS`;
}

/**
 * Formats a comprehensive, professional email body containing all official certificate particulars.
 */
export function generateCertificateEmailBody(
  certificate: Certificate,
  verificationUrl: string
): string {
  const comp = certificate.companySnapshot || {
    companyName: 'PARIVAHAN SCRAPPERS',
    companySubtitle: 'A Unit OF Scrapping Yard Ltd.',
    address: 'B12, Dwarka, New Delhi.',
    phone: '8506925495',
    website: 'https://parivahan-scrappers.netlify.app',
    signatoryTitle: 'Authorized Signatory',
  };

  return `================================================================================
OFFICIAL DISPATCH: PARIVAHAN SCRAPPERS CERTIFICATE REGISTRY
From: ${OFFICIAL_SENDER_NAME} <${OFFICIAL_SENDER_EMAIL}>
Issuing Unit: ${comp.companyName} (${comp.companySubtitle})
Central Verification Desk: ${comp.address}
Helpline: ${comp.phone} | Official Records: ${OFFICIAL_RECORDS_EMAIL}
================================================================================

Dear Vehicle Owner / Concerned Authority,

This is an official transmission of the Vehicle Scrapping Certificate issued under the Registered Vehicle Scrapping Facility (RVSF) guidelines. 

The vehicle identified below has been duly received, verified, and officially processed for environmental-friendly recycling and scrapping.

--------------------------------------------------------------------------------
1. CERTIFICATE PARTICULARS
--------------------------------------------------------------------------------
Certificate Number          : ${certificate.certificateNumber}
Scrapping Registration No   : ${certificate.scrappingRegistrationNumber}
Digital Certificate Status  : ${certificate.status} (Verified Authentic)
Date of Vehicle Handover    : ${certificate.dateOfHandover}
Date of Certificate Issue   : ${certificate.dateOfIssue}
Facility / Yard Location    : ${certificate.location || 'Delhi NCR'}

--------------------------------------------------------------------------------
2. VEHICLE SPECIFICATIONS
--------------------------------------------------------------------------------
Vehicle Registration (RC)   : ${certificate.vehicleRegistrationNumber}
Registered Owner Name       : ${certificate.ownerName}
Owner / Handover Address    : ${certificate.address}
${certificate.idProofNumber ? `ID Proof Reference          : ${certificate.idProofNumber}\n` : ''}Make & Model                : ${certificate.make} ${certificate.model}
Chassis Number              : ${maskChassisNumber(certificate.chassisNumber, certificate.showFullChassisEngine)}
Engine Number               : ${maskEngineNumber(certificate.engineNumber, certificate.showFullChassisEngine)}
Fuel Type                   : ${certificate.fuelType || 'N/A'}
Year of Manufacture         : ${certificate.yearOfManufacture}

--------------------------------------------------------------------------------
3. ONLINE VERIFICATION & A4 PDF DOWNLOAD
--------------------------------------------------------------------------------
To view the digitally signed certificate with official green seal, QR verification code, and directly download the official A4 PDF, click the secure link below:
${verificationUrl}

--------------------------------------------------------------------------------
4. ISSUING AUTHORITY & NODAL CONTACT
--------------------------------------------------------------------------------
${comp.companyName}
${comp.companySubtitle}
Operational Yard : ${comp.address}
Helpline Number  : ${comp.phone}
Official Support : ${OFFICIAL_SENDER_EMAIL}
Website Registry : ${comp.website}
Signatory Office : ${comp.signatoryTitle}

--------------------------------------------------------------------------------
Legal Notice: This is a computer-generated official document dispatch from PARIVAHAN SCRAPPERS Central Registry. Retain this certificate for RTO RC surrender, tax concessions, and scrap incentive rebate.
================================================================================`;
}

/**
 * Builds a cross-client safe mailto URI using standard RFC 6068 percent-encoding.
 */
export function buildMailtoUrl(params: {
  to?: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}): string {
  const parts: string[] = [];
  if (params.cc) {
    parts.push(`cc=${encodeURIComponent(params.cc)}`);
  }
  if (params.bcc) {
    parts.push(`bcc=${encodeURIComponent(params.bcc)}`);
  }
  parts.push(`subject=${encodeURIComponent(params.subject)}`);
  parts.push(`body=${encodeURIComponent(params.body)}`);

  const recipient = params.to ? encodeURIComponent(params.to.trim()) : '';
  return `mailto:${recipient}?${parts.join('&')}`;
}
