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
  elapsed: number;
}

function StatusBadge({ status, elapsed }: { status: UploadItem['status']; elapsed: number }) {
  const map: Record<string, string> = {
    queued: 'bg-sand text-taupe',
    uploading: 'bg-dusty-blue text-deep-blue',
    processing: 'bg-dusty-blue text-deep-blue',
    parsed: 'bg-moss-light text-forest',
    failed: 'bg-error-rust/20 text-error-rust',
  };
  const label =
    status === 'processing' ? `Extracting${elapsed > 3 ? ` (${elapsed}s)` : '…'}` :
    status === 'parsed' ? '✓ Extracted' :
    status === 'failed' ? '✗ Failed' :
    status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${map[status]} ${status === 'processing' ? 'animate-pulse' : ''}`}>
      {label}
    </span>
  );
}

export default function Upload() {
  const { company } = useApp();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [existingDocs, setExistingDocs] = useState<Document[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load existing docs
  useEffect(() => {
    if (!company) return;
    api.documents.listByCompany(company.id)
      .then((docs) => setExistingDocs(docs as Document[]))
      .catch(console.error);
  }, [company]);

  // Tick elapsed time for processing items
  useEffect(() => {
    const t = setInterval(() => {
      setItems((prev) =>
        prev.map((item) =>
          item.status === 'processing' ? { ...item, elapsed: item.elapsed + 1 } : item
        )
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const pollStatus = useCallback((documentId: string, idx: number) => {
    const start = Date.now();
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
            // Refresh existing docs list
            if (company) {
              api.documents.listByCompany(company.id)
                .then((docs) => setExistingDocs(docs as Document[]))
                .catch(console.error);
            }
          }
        }
      } catch { /* ignore transient errors */ }

      // 3 minute timeout
      if (Date.now() - start > 180000) {
        clearInterval(interval);
        setItems((prev) =>
          prev.map((item, i) =>
            i === idx && item.status === 'processing' ? { ...item, status: 'failed' } : item
          )
        );
      }
    }, 3000);
  }, [company]);

  const uploadFile = useCallback(async (file: File, idx: number) => {
    if (!company) return;
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, status: 'uploading' } : item));
    try {
      const result = await api.documents.upload(company.id, file) as { documentId: string; error?: string };
      if (result.error) throw new Error(result.error);
      setItems((prev) =>
        prev.map((item, i) =>
          i === idx ? { ...item, status: 'processing', documentId: result.documentId } : item
        )
      );
      pollStatus(result.documentId, idx);
    } catch (err) {
      console.error('Upload failed:', err);
      setItems((prev) => prev.map((item, i) => i === idx ? { ...item, status: 'failed' } : item));
    }
  }, [company, pollStatus]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const startIdx = items.length;
    const newItems: UploadItem[] = acceptedFiles.map((file) => ({ file, status: 'queued', elapsed: 0 }));
    setItems((prev) => [...prev, ...newItems]);
    acceptedFiles.forEach((file, i) => uploadFile(file, startIdx + i));
  }, [items.length, uploadFile]);

  const deleteDoc = async (docId: string) => {
    setDeletingId(docId);
    try {
      await api.documents.delete(docId);
      setExistingDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete document. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

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

  const allExtracted = existingDocs.length > 0 && existingDocs.every((d) => d.parse_status === 'parsed');

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-bark-brown mb-2">Upload documents</h1>
        <p className="text-taupe">Upload utility bills, HR exports, board minutes, or any ESG-relevant document. Tracewell will extract metrics directly from them.</p>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors mb-8 ${
          isDragActive ? 'border-forest bg-moss-light/30' : 'border-sand hover:border-sage bg-white-warm'
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-4xl mb-3">📁</div>
        <p className="text-bark-brown font-medium mb-1">
          {isDragActive ? 'Drop files here' : 'Drag & drop documents here'}
        </p>
        <p className="text-taupe text-sm">PDF, XLSX, CSV, PNG, JPG · Up to 50 MB each</p>
      </div>

      {/* Current session uploads */}
      {items.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-medium text-bark-brown mb-4">This session</h3>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-sand last:border-0 gap-3">
                <span className="text-sm text-bark-brown truncate flex-1">{item.file.name}</span>
                <StatusBadge status={item.status} elapsed={item.elapsed} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All existing docs */}
      {existingDocs.length > 0 && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-bark-brown">All uploaded documents</h3>
            {allExtracted && (
              <span className="text-xs text-forest bg-moss-light px-2 py-0.5 rounded-full">All extracted</span>
            )}
          </div>
          <div className="space-y-2">
            {existingDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between py-2 border-b border-sand last:border-0 gap-3">
                <span className="text-sm text-bark-brown truncate flex-1">{doc.filename}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge
                    status={doc.parse_status === 'parsed' ? 'parsed' : doc.parse_status === 'failed' ? 'failed' : 'processing'}
                    elapsed={0}
                  />
                  <button
                    onClick={() => deleteDoc(doc.id)}
                    disabled={deletingId === doc.id}
                    className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-error-rust/10 text-taupe hover:text-error-rust transition-colors disabled:opacity-40"
                    title="Delete document"
                  >
                    {deletingId === doc.id ? '…' : '✕'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {existingDocs.some((d) => d.parse_status === 'parsed') && (
            <p className="text-xs text-taupe mt-3 pt-3 border-t border-sand">
              💡 If Review shows 0 fields, delete the document with ✕ and re-upload it.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-between items-center">
        <Link to="/setup" className="btn-secondary">← Back</Link>
        <Link to="/review" className="btn-primary">Review extracted data →</Link>
      </div>
    </div>
  );
}
