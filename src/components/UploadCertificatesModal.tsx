import React, { useState, useRef } from 'react';
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Database,
  RefreshCw,
  HelpCircle,
  FileSpreadsheet,
} from 'lucide-react';
import type { Certificate } from '../types';
import { autoSyncCertificatesBulk } from '../utils/autoSync';

interface UploadCertificatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (imported: Certificate[], totalCount: number) => void;
}

export const UploadCertificatesModal: React.FC<UploadCertificatesModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [pasteData, setPasteData] = useState('');
  const [parsedPreview, setParsedPreview] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const parseFileContent = (content: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const trimmed = content.trim();

    if (!trimmed) {
      setParsedPreview([]);
      return;
    }

    // Try parsing as JSON first
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const json = JSON.parse(trimmed);
        const list = Array.isArray(json)
          ? json
          : Array.isArray(json.certificates)
          ? json.certificates
          : [json];

        if (list.length === 0) {
          setErrorMsg('JSON data is empty.');
          setParsedPreview([]);
          return;
        }

        setParsedPreview(list);
        setSuccessMsg(`Parsed ${list.length} certificate(s) from JSON. Ready to upload!`);
        return;
      } catch (err: any) {
        // Not JSON, continue to CSV/TSV
      }
    }

    // Parse CSV or TSV
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      setErrorMsg('No data rows detected.');
      return;
    }

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const rawHeaders = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));

    // Check if first line is headers
    const hasHeader = rawHeaders.some((h) =>
      ['owner', 'name', 'certificate', 'rc', 'model', 'vehicle'].some((k) =>
        h.toLowerCase().includes(k)
      )
    );

    const startIndex = hasHeader ? 1 : 0;
    const headers = hasHeader
      ? rawHeaders
      : ['certificateNumber', 'ownerName', 'vehicleRegistrationNumber', 'make', 'model', 'chassisNumber', 'engineNumber'];

    const items: any[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length === 0 || cols.every((c) => !c)) continue;

      const obj: any = {};
      headers.forEach((h, idx) => {
        if (cols[idx] !== undefined) {
          obj[h] = cols[idx];
        }
      });

      // Normalize common keys
      if (!obj.ownerName && obj['Owner Name']) obj.ownerName = obj['Owner Name'];
      if (!obj.ownerName && obj.owner) obj.ownerName = obj.owner;
      if (!obj.ownerName && obj.name) obj.ownerName = obj.name;

      if (!obj.certificateNumber && obj['Certificate Number']) obj.certificateNumber = obj['Certificate Number'];
      if (!obj.certificateNumber && obj.certNo) obj.certificateNumber = obj.certNo;

      if (!obj.vehicleRegistrationNumber && obj['Vehicle Registration Number']) obj.vehicleRegistrationNumber = obj['Vehicle Registration Number'];
      if (!obj.vehicleRegistrationNumber && obj['Vehicle Number']) obj.vehicleRegistrationNumber = obj['Vehicle Number'];
      if (!obj.vehicleRegistrationNumber && obj.rcNumber) obj.vehicleRegistrationNumber = obj.rcNumber;

      if (!obj.make && obj.brand) obj.make = obj.brand;

      if (!obj.idProofNumber && obj['ID Proof Number']) obj.idProofNumber = obj['ID Proof Number'];
      if (!obj.idProofNumber && obj['ID Proof']) obj.idProofNumber = obj['ID Proof'];
      if (!obj.idProofNumber && obj.idProof) obj.idProofNumber = obj.idProof;
      if (!obj.idProofNumber && obj.aadhaar) obj.idProofNumber = obj.aadhaar;

      if (obj.ownerName || obj.vehicleRegistrationNumber || obj.certificateNumber) {
        items.push(obj);
      }
    }

    if (items.length === 0) {
      setErrorMsg('Could not extract valid certificate records. Check format or use JSON.');
      setParsedPreview([]);
    } else {
      setParsedPreview(items);
      setSuccessMsg(`Parsed ${items.length} certificate(s) from table/CSV. Ready to upload!`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      setPasteData(text);
      parseFileContent(text);
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    if (parsedPreview.length === 0) {
      setErrorMsg('No certificates to import. Please select a file or paste data.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const adminToken =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        'ps_admin_session_token_secure_2026';

      const res = await fetch('/api/certificates/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          certificates: parsedPreview,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Import failed. Please verify format.');
      }

      setSuccessMsg(data.message || 'Certificates successfully saved in database!');
      if (data.certificates && Array.isArray(data.certificates)) {
        autoSyncCertificatesBulk(data.certificates).catch(() => {});
        onImportSuccess(data.certificates, data.totalCount);
      }

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload certificates to database.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSampleTemplate = () => {
    const sample = [
      {
        certificateNumber: "PS/26/R1011",
        ownerName: "SAMPLE OWNER",
        vehicleRegistrationNumber: "DL 01 AB 9999",
        make: "Hero Honda",
        model: "Splendor Plus",
        chassisNumber: "MBBL12345ABCD",
        engineNumber: "EN98765432",
        yearOfManufacture: "2018",
        dateOfIssue: "18-09-2026",
        dateOfHandover: "18-09-2026",
        address: "Delhi NCR"
      }
    ];
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'certificate_upload_sample.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0d2847] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-serif">Upload & Import Certificates</h3>
              <p className="text-xs text-slate-300">
                Bulk upload new or existing certificates directly into the registry database
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* File Upload Zone */}
          <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 text-center bg-slate-50/70 hover:bg-emerald-50/30 transition-colors">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".json,.csv,.txt"
              className="hidden"
            />
            <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              Drop JSON or CSV file here, or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-emerald-700 hover:text-emerald-800 font-bold underline cursor-pointer"
              >
                browse file
              </button>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports .JSON database backups, exported certificate lists, or CSV spreadsheets
            </p>
          </div>

          {/* Quick template actions */}
          <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-100 p-3 rounded-lg border border-slate-200">
            <span className="flex items-center gap-1.5 font-medium">
              <HelpCircle className="w-4 h-4 text-slate-500" />
              Need a formatting template?
            </span>
            <button
              type="button"
              onClick={downloadSampleTemplate}
              className="flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Sample JSON Template
            </button>
          </div>

          {/* Direct Paste Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Or Paste Certificates JSON / CSV Data
            </label>
            <textarea
              rows={4}
              value={pasteData}
              onChange={(e) => {
                setPasteData(e.target.value);
                parseFileContent(e.target.value);
              }}
              placeholder='[{"certificateNumber": "PS/26/R1011", "ownerName": "RAM KUMAR", "vehicleRegistrationNumber": "DL 01 AB 1234", "make": "Hero", "model": "Splendor"}]'
              className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
            />
          </div>

          {/* Status Messages */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Preview Table if certificates parsed */}
          {parsedPreview.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 flex justify-between items-center border-b border-slate-200">
                <span>Preview Ready for Upload ({parsedPreview.length} items)</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  Duplicates by cert number will be updated safely
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-1.5">Cert #</th>
                      <th className="px-3 py-1.5">Owner Name</th>
                      <th className="px-3 py-1.5">Vehicle RC</th>
                      <th className="px-3 py-1.5">Make / Model</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-1 font-mono font-bold text-slate-800">
                          {item.certificateNumber || item['Certificate Number'] || '(Auto Sequence)'}
                        </td>
                        <td className="px-3 py-1 font-semibold text-slate-700">
                          {item.ownerName || item['Owner Name'] || 'Unknown'}
                        </td>
                        <td className="px-3 py-1 text-slate-600">
                          {item.vehicleRegistrationNumber || item['Vehicle Number'] || 'Not Provided'}
                        </td>
                        <td className="px-3 py-1 text-slate-500">
                          {item.make || ''} {item.model || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={parsedPreview.length === 0 || isProcessing}
            onClick={handleImportSubmit}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving to Database...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                Save {parsedPreview.length} Certificates to Database
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
