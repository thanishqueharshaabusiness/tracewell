import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import type { Document } from '../lib/types';

interface UploadItem {
  file: File;
  documentId?: string;
  status: 'queued' | 'uploading' | 'processing' | 'parsed' | 'failed';
  fieldCount?: number;
}

function StatusBadge({ status }: { status: UploadItem['status'] }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== 'processing') { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const map = {
    queued: 'bg-sand text-taupe',
    uploading: 'bg-dusty-blue text-deep-blue',
    processing: 'bg-dusty-blue text-deep-blue animate-pulse',
    parsed: 'bg-moss-light text-forest',
    failed: 'bg-error-rust/20 text-error-rust',
  };

  const label = status === 'processing'
    ? `Extracting… ${elapsed > 5 ? `(${elapsed}s)` : ''}`
    : status === 'parsed' ? '✓ Extracted'
    : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status]}`}>
      {label}
    </span>
  );
}

export default function Upload() {
  const { company } = useApp();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [existingDocs, setExistingDocs] = useState<Document[]>([]);

  useEffect(() => {
    if (!company) return;
    api.documents.listByCompany(company.id).then((docs) => setExistingDocs(docs as Document[]));
  }, [company]);

  const pollStatus = useCallback((documentId: string, idx: number) => {
    const interval = setInterval(async () => {
      try {
        const data = await api.documents.status(documentId) as { parse_status: string };
        if (data.parse_status === 'parsed' || data.parse_status === 'failed') {
          clearInterval(interval);
          setItems((prev) =>
            prev.map((item, i) =>
              i === idx ? { ...item, status: data.parse_status as UploadItem['status'] } : item
            )
          );
          if (data.parse_status === 'parsed') {
            setExistingDocs((prev) => [...prev]);
          }
        }
      } catch {
        // ignore transient poll errors, keep trying
      }
    }, 3000);

    // 3 minute timeout — Claude can take 30-60s for large PDFs
    setTimeout(() => {
      clearInterval(interval);
      setItems((prev) =>
        prev.map((item, i) =>
          i === idx && item.status === 'processing'
            ? { ...item, status: 'failed' }
            : item
        )
      );
    }, 180000);
  }, []);

  const uploadFile = useCallback(async (file: File, idx: number) => {
    if (!company) return;
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, status: 'uploading' } : item));
    try {
      const result = await api.documents.upload(company.id, file) as { documentId: string };
      setItems((prev) =>
        prev.map((item, i) =>
          i === idx ? { ...item, status: 'processing', documentId: result.documentId } : item
        )
      );
      pollStatus(result.documentId, idx);
    } catch {
      setItems((prev) => prev.map((item, i) => i === idx ? { ...item, status: 'failed' } : item));
    }
  }, [company, pollStatus]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newItems = acceptedFiles.map((file) => ({ file, status: 'queued' as const }));
    const startIdx = items.length;
    setItems((prev) => [...prev, ...newItems]);
    newItems.forEach((_, i) => uploadFile(acceptedFiles[i], startIdx + i));
  }, [items.length, uploadFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    maxSize: 50 * 1024 * 1024,
  });

  if (!company) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <p className="text-taupe mb-4">No company selected.</p>
        <Link to="/setup" className="btn-primary">Set up company</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-bark-brown mb-2">Upload documents</h1>
        <p className="text-taupe">Upload utility bills, HR exports, board minutes, or any ESG-relevant document. Tracewell will extract metrics directly from them.</p>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors mb-8 ${
          isDragActive ? 'border-forest bg-moss-light/30' : 'border-sand hover:border-sage'
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-4xl mb-3">📁</div>
        <p className="text-bark-brown font-medium mb-1">
          {isDragActive ? 'Drop files here' : 'Drag & drop documents here'}
        </p>
        <p className="text-taupe text-sm">PDF, XLSX, CSV, PNG, JPG · Up to 50 MB each</p>
      </div>

      {items.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-medium text-bark-brown mb-4">This session</h3>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-sand last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-taupe text-sm">📄</span>
                  <span className="text-sm text-bark-brown">{item.file.name}</span>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {existingDocs.length > 0 && (
        <div className="card mb-8">
          <h3 className="font-medium text-bark-brown mb-4">All uploaded documents</h3>
          <div className="space-y-2">
            {existingDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between py-2 border-b border-sand last:border-0">
                <span className="text-sm text-bark-brown">{doc.filename}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.parse_status as UploadItem['status']} />
                  <button
                    onClick={async () => {
                      await api.documents.delete(doc.id);
                      setExistingDocs((prev) => prev.filter((d) => d.id !== doc.id));
                    }}
                    className="text-xs text-error-rust hover:underline ml-2"
                    title="Delete document"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-taupe mt-3">
            If a document shows ✓ Extracted but Review shows 0 fields, delete it and re-upload to reprocess.
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <Link to="/setup" className="btn-secondary">← Back</Link>
        <Link to="/review" className="btn-primary">Review extracted data →</Link>
      </div>
    </div>
  );
}
