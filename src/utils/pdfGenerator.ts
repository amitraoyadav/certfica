import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Certificate } from '../types';
import { maskChassisNumber, maskEngineNumber } from './maskUtils';

/**
 * Returns a clean, filesystem-safe filename preserving the exact certificate number.
 * For example: "PS/26/R1000" -> "PS-26-R1000.pdf"
 * Characters like '/' are converted to '-' because operating systems forbid '/' in filenames.
 */
export function getCertificatePdfFileName(certificateNumber: string): string {
  if (!certificateNumber || !certificateNumber.trim()) {
    return 'Vehicle-Scrapping-Certificate.pdf';
  }
  const cleanNumber = certificateNumber.trim().replace(/[/\\?%*:|"<>]/g, '-');
  return `${cleanNumber}.pdf`;
}

export interface GeneratePdfOptions {
  onProgress?: (status: 'capturing' | 'rendering' | 'saving' | 'done' | 'error') => void;
}

/**
 * Directly downloads the certificate in standard A4 PDF format named after the certificate number.
 */
export async function downloadCertificatePdf(
  elementId: string = 'certificate-print-area',
  certificate: Certificate,
  options?: GeneratePdfOptions
): Promise<boolean> {
  try {
    options?.onProgress?.('capturing');
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`Certificate element with ID "${elementId}" not found in DOM`);
      options?.onProgress?.('error');
      return false;
    }

    // Wait for web fonts to be completely ready before capturing canvas
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {}
    }

    // Wait for all images inside the certificate element to finish loading & decoding
    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(
      images.map(async (img) => {
        if (!img.complete) {
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }
        if (img.decode) {
          try {
            await img.decode();
          } catch {}
        }
      })
    );

    // Determine clean filename from the exact certificate number
    const fileName = getCertificatePdfFileName(certificate.certificateNumber);

    // Save previous styles if any
    const originalBoxShadow = element.style.boxShadow;
    element.style.boxShadow = 'none';

    // Measure element - ensure at least 760px width for high resolution A4 export
    const width = 760;
    const height = Math.max(element.scrollHeight || 0, element.offsetHeight || 0, 1075);

    options?.onProgress?.('rendering');

    // Generate high-resolution PNG using browser's native engine at exact 760px desktop geometry
    const dataUrl = await toPng(element, {
      quality: 0.98,
      pixelRatio: 2.5, // 2.5x pixel ratio for razor-sharp 300+ DPI print quality
      backgroundColor: '#ffffff',
      width: width,
      height: height,
      filter: (node: HTMLElement) => {
        if (node.classList && node.classList.contains('no-print')) {
          return false;
        }
        return true;
      },
      style: {
        transform: 'none',
        boxShadow: 'none',
        width: '760px',
        minWidth: '760px',
        maxWidth: '760px',
      },
    });

    // Restore original box-shadow
    element.style.boxShadow = originalBoxShadow;

    options?.onProgress?.('saving');

    // Create A4 PDF (210mm x 297mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    // Fit perfectly to full A4 page
    pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');

    // Save with the certificate number as filename
    pdf.save(fileName);

    options?.onProgress?.('done');
    return true;
  } catch (error) {
    console.error('Error generating certificate PDF:', error);
    options?.onProgress?.('error');
    
    // Fallback: If canvas generation has an unexpected issue, trigger native print as backup
    try {
      window.print();
    } catch {
      // ignore
    }
    return false;
  }
}

/**
 * Renders the certificate element directly to an A4 PDF Blob without triggering a file download.
 * Used for server-side persistence and Google Drive backup uploads.
 */
export async function generateCertificatePdfBlob(
  elementId: string = 'certificate-print-area',
  options?: GeneratePdfOptions
): Promise<Blob | null> {
  try {
    options?.onProgress?.('capturing');
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Element #${elementId} not found in DOM for PDF blob generation.`);
      return null;
    }

    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {}
    }

    const images = Array.from(element.querySelectorAll('img'));
    await Promise.all(
      images.map(async (img) => {
        if (!img.complete) {
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }
        if (img.decode) {
          try {
            await img.decode();
          } catch {}
        }
      })
    );

    const originalBoxShadow = element.style.boxShadow;
    element.style.boxShadow = 'none';

    const width = 760;
    const height = Math.max(element.scrollHeight || 0, element.offsetHeight || 0, 1075);

    options?.onProgress?.('rendering');

    const dataUrl = await toPng(element, {
      quality: 0.98,
      pixelRatio: 2.0,
      backgroundColor: '#ffffff',
      width: width,
      height: height,
      filter: (node: HTMLElement) => {
        if (node.classList && node.classList.contains('no-print')) {
          return false;
        }
        return true;
      },
      style: {
        transform: 'none',
        boxShadow: 'none',
        width: '760px',
        minWidth: '760px',
        maxWidth: '760px',
      },
    });

    element.style.boxShadow = originalBoxShadow;

    options?.onProgress?.('saving');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
    const pdfBlob = pdf.output('blob');

    options?.onProgress?.('done');
    return pdfBlob;
  } catch (err) {
    console.error('Failed to generate PDF blob:', err);
    options?.onProgress?.('error');
    return null;
  }
}

/**
 * Generates an authentic A4 PDF Blob directly from a Certificate data object.
 * Used for background batch uploads and 1-by-1 Google Drive syncing without requiring DOM mounting.
 * Faithfully mirrors the official certificate layout, Section A owner details, Section B 9-row vehicle details, and Section C terms.
 */
export async function createCertificatePdfBlobFromData(cert: Certificate): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // Background Double Frame (Navy #0d2847)
  pdf.setDrawColor(13, 40, 71);
  pdf.setLineWidth(0.8);
  pdf.rect(8, 8, 194, 281);
  pdf.setLineWidth(0.3);
  pdf.rect(9.5, 9.5, 191, 278);

  // 1. Company Header Area
  pdf.setFont('times', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(13, 40, 71);
  pdf.text('PARIVAHAN SCRAPPERS', 14, 18);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(30, 41, 59);
  pdf.text('A Unit OF Scrapping Yard Ltd. • Authorised Registered Vehicle Scrapping Facility', 14, 23);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text('B12, Dwarka, New Delhi • Helpline: 8506925495 • www.parivahanscrappers.com', 14, 28);

  // Right Branding Slogan
  pdf.setFont('times', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(13, 40, 71);
  pdf.text('Responsible', 190, 20, { align: 'right' });
  pdf.text('Recycling', 190, 24, { align: 'right' });
  pdf.text('Greener India', 190, 28, { align: 'right' });

  // Divider Line
  pdf.setDrawColor(13, 40, 71);
  pdf.setLineWidth(0.4);
  pdf.line(14, 32, 196, 32);

  // Certificate No. and Date of Issue
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(13, 40, 71);
  pdf.text(`Certificate No. : ${cert.certificateNumber}`, 14, 37);
  pdf.text(`Date of Issue : ${cert.dateOfIssue}`, 196, 37, { align: 'right' });

  // Main Title Banner
  pdf.setFont('times', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(13, 40, 71);
  pdf.text('VEHICLE SCRAPPING CERTIFICATE', 105, 45, { align: 'center' });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor(30, 58, 95);
  pdf.text('ISSUED IN ACCORDANCE WITH APPLICABLE VEHICLE SCRAPPAGE REGULATIONS', 105, 49, { align: 'center' });

  // Green Sub-banner Pill
  pdf.setFillColor(225, 238, 230);
  pdf.setDrawColor(207, 226, 214);
  pdf.setLineWidth(0.3);
  pdf.rect(60, 52, 90, 5, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(20, 66, 41);
  pdf.text('RESPONSIBLE SCRAPPING FOR A GREENER TOMORROW', 105, 55.5, { align: 'center' });

  // Preamble Certification Text
  pdf.setFont('times', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(30, 41, 59);
  const preamble =
    'This is to certify that the motor vehicle mentioned below has been received by Parivahan Scrappers (A Unit OF Scrapping Yard Ltd.) for dismantling and environmentally sound recycling, in accordance with the provisions of the Vehicle Scrappage Policy and all applicable environmental regulations.';
  const splitPreamble = pdf.splitTextToSize(preamble, 182);
  pdf.text(splitPreamble, 14, 62);

  // SECTION A. OWNER DETAILS
  let currentY = 71;
  pdf.setFillColor(220, 232, 245);
  pdf.setDrawColor(180, 203, 229);
  pdf.setLineWidth(0.3);
  pdf.rect(14, currentY, 182, 5, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(20, 62, 109);
  pdf.text('A. OWNER DETAILS', 16, currentY + 3.5);

  currentY += 5;
  const ownerRows = [
    ['Owner Name', (cert.ownerName || '').toUpperCase()],
    ['Address', cert.address || 'Not Provided'],
    ['ID Proof Number', cert.idProofNumber || 'Not Provided'],
  ];

  ownerRows.forEach(([label, val], idx) => {
    const isLast = idx === ownerRows.length - 1;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(14, currentY, 182, 5.5, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(30, 41, 59);
    pdf.text(label, 16, currentY + 3.8);

    // Vertical column divider
    pdf.line(65, currentY, 65, currentY + 5.5);

    pdf.setFont('helvetica', label === 'Owner Name' ? 'bold' : 'normal');
    pdf.setTextColor(label === 'Owner Name' ? 13 : 51, label === 'Owner Name' ? 40 : 65, label === 'Owner Name' ? 71 : 85);
    const splitVal = pdf.splitTextToSize(val, 128);
    pdf.text(splitVal[0] || '', 68, currentY + 3.8);
    currentY += 5.5;
  });

  // SECTION B. VEHICLE DETAILS & QR CODE
  currentY += 2;
  pdf.setFillColor(220, 232, 245);
  pdf.rect(14, currentY, 182, 5, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(20, 62, 109);
  pdf.text('B. VEHICLE DETAILS', 16, currentY + 3.5);

  currentY += 5;
  const tableStartY = currentY;
  const vehicleTableWidth = 136;
  const qrBoxX = 153;
  const qrBoxWidth = 43;

  // Unconditional 9 Rows
  const vehicleRows = [
    ['Registration No. for Scrapping', cert.scrappingRegistrationNumber || 'REG-C272829', true],
    ['Vehicle Reg. (RC) No.', (cert.vehicleRegistrationNumber || 'Not Provided').toUpperCase(), true],
    ['Chassis No.', maskChassisNumber(cert.chassisNumber, cert.showFullChassisEngine), false, true],
    ['Engine No.', maskEngineNumber(cert.engineNumber, cert.showFullChassisEngine), false, true],
    ['Maker (Bike Brand)', cert.make || 'Two Wheeler', false],
    ['Model', cert.model || 'Standard', false],
    ['Location', cert.location || 'Delhi NCR', false],
    ['Year of Manufacture', cert.yearOfManufacture || '2012', false],
    ['Date of Handover', cert.dateOfHandover || cert.dateOfIssue, false],
  ];

  const rowHeight = 5.2;
  vehicleRows.forEach(([label, val, isBold, isMono]) => {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(14, currentY, vehicleTableWidth, rowHeight, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.setTextColor(30, 41, 59);
    pdf.text(label as string, 16, currentY + 3.6);

    pdf.line(68, currentY, 68, currentY + rowHeight);

    pdf.setFont(isMono ? 'courier' : 'helvetica', isBold ? 'bold' : 'normal');
    pdf.setTextColor(isBold ? 13 : 51, isBold ? 40 : 65, isBold ? 71 : 85);
    const splitVal = pdf.splitTextToSize(String(val), 78);
    pdf.text(splitVal[0] || '', 71, currentY + 3.6);

    currentY += rowHeight;
  });

  const totalTableHeight = currentY - tableStartY;

  // Right QR Box (exact 43mm box matching the 9 rows)
  pdf.setFillColor(255, 255, 255);
  pdf.rect(qrBoxX, tableStartY, qrBoxWidth, totalTableHeight, 'FD');

  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://parivahan-scrappers.netlify.app';
    const verifyUrl = `${origin}/verify?certificateNumber=${encodeURIComponent(cert.certificateNumber)}${cert.qrToken ? `&token=${encodeURIComponent(cert.qrToken)}` : ''}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 140,
    });
    pdf.addImage(qrDataUrl, 'PNG', qrBoxX + 8, tableStartY + 2.5, 27, 27);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(13, 40, 71);
    pdf.text('SCAN TO VERIFY', qrBoxX + qrBoxWidth / 2, tableStartY + 32.5, { align: 'center' });

    pdf.setDrawColor(200, 200, 200);
    pdf.line(qrBoxX + 6, tableStartY + 35, qrBoxX + qrBoxWidth - 6, tableStartY + 35);

    pdf.setFontSize(6.5);
    pdf.text(cert.certificateNumber, qrBoxX + qrBoxWidth / 2, tableStartY + 39.5, { align: 'center' });
  } catch {}

  // SECTION C. TERMS & CERTIFICATIONS
  currentY += 3;
  pdf.setFillColor(220, 232, 245);
  pdf.setDrawColor(180, 203, 229);
  pdf.rect(14, currentY, 182, 5, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(20, 62, 109);
  pdf.text('C. TERMS & CERTIFICATIONS', 16, currentY + 3.5);

  currentY += 6.5;
  const terms = [
    'Parivahan Scrappers undertakes to dismantle the vehicle and process all recoverable metal, plastic, and fluid components through authorized channels compliant with environmental and recycling standards.',
    'Once accepted for scrapping, the vehicle, its chassis, engine, or registered component parts shall not be restored, resold, re-registered, or returned to road use in any jurisdiction.',
    'This certificate, with the scrapping video record, constitutes complete documentary proof of the vehicle disposal furnished to the customer.',
    'This certificate is issued as proof of handover and processing intent; statutory de-registration remains the customer\'s responsibility with the transport authority.',
  ];

  pdf.setFont('times', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(51, 65, 85);
  terms.forEach((term, idx) => {
    pdf.setFillColor(13, 40, 71);
    pdf.circle(16.5, currentY - 0.7, 1.2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.5);
    pdf.text(String(idx + 1), 16.5, currentY - 0.2, { align: 'center' });

    pdf.setFont('times', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(51, 65, 85);
    const splitTerm = pdf.splitTextToSize(term, 175);
    pdf.text(splitTerm, 19, currentY);
    currentY += splitTerm.length * 3.1 + 1.2;
  });

  // Signatory, Eco Badges & Quote Box
  currentY += 2;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(13, 40, 71);
  pdf.text('For Parivahan Scrappers', 16, currentY);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text('(A Unit OF Scrapping Yard Ltd.)', 16, currentY + 3.5);

  // Authorised Signatory flourish line
  pdf.setDrawColor(13, 40, 71);
  pdf.setLineWidth(0.3);
  pdf.line(16, currentY + 12, 60, currentY + 12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(13, 40, 71);
  pdf.text('Authorised Signatory', 16, currentY + 15.5);

  // Middle Eco Badges
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.8);
  pdf.setTextColor(51, 65, 85);
  pdf.text('• Environmentally Responsible', 75, currentY + 3);
  pdf.text('• Resource Conservation', 75, currentY + 8);
  pdf.text('• Sustainable Tomorrow', 75, currentY + 13);

  // Right Quote Box
  pdf.setFillColor(237, 247, 242);
  pdf.setDrawColor(207, 223, 214);
  pdf.rect(142, currentY - 1, 54, 18, 'FD');
  pdf.setFont('times', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(20, 56, 40);
  pdf.text('End-of-Life', 169, currentY + 4, { align: 'center' });
  pdf.text('Vehicles Deserve', 169, currentY + 8, { align: 'center' });
  pdf.text('a Better Future.', 169, currentY + 12, { align: 'center' });

  // Footer bar
  pdf.setDrawColor(13, 40, 71);
  pdf.setLineWidth(0.2);
  pdf.line(14, 280, 196, 280);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('Computer Generated Certificate • Digitally Verified', 14, 284);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(13, 40, 71);
  pdf.text('Scan QR Code to Verify', 196, 284, { align: 'right' });

  return pdf.output('blob');
}


