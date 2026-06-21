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

interface Session {
  sessionId: string;
  uploadedAt: string;
  fileCount: number;
  firstFile: string;
}

function getSessionKey(companyId: string) {
  return `tracewell_session_${companyId}`;
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
    status === 'failed' ? '✗ Failed — retry' :
    status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${map[status]} ${status === 'processing' ? 'animate-pulse' : ''}`}>
      {label}
    </span>
  );
}

export default function Upload() {
  const { company } = useApp();
  const [sessionId, setSessionId] = useState<string>('');
  const [items, setItems] = useState<UploadItem[]>([]);
  const [existingDocs, setExistingDocs] = useState<Document[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Load session from localStorage or generate new one
  useEffect(() => {
    if (!company) return;
    const stored = localStorage.getItem(getSessionKey(company.id));
    if (stored) {
      setSessionId(stored);
    } else {
      api.documents.newSession().then((r) => {
        const id = (r as { sessionId: string }).sessionId;
        setSessionId(id);
        localStorage.setItem(getSessionKey(company.id), id);
      });
    }
  }, [company]);

  const loadDocs = useCallback(() => {
    if (!company) return;
    Promise.all([
      api.documents.listByCompany(company.id),
      api.documents.sessions(company.id),
    ]).then(([docs, sess]) => {
      setExistingDocs(docs as Document[]);
      setSessions(sess as Session[]);
    }).catch(console.error);
  }, [company]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Tick elapsed for processing items
  useEffect(() => {
    const t = setInterval(() => {
      setItems((prev) => prev.map((item) =>
        item.status === 'processing' ? { ...item, elapsed: item.elapsed + 1 } : item
      ));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const startNewBatch = async () => {
    if (!company) return;
    const r = await api.documents.newSession() as { sessionId: string };
    setSessionId(r.sessionId);
    localStorage.setItem(getSessionKey(company.id), r.sessionId);
    setItems([]);
  };

  const resetAll = async () => {
    if (!company) return;
    setResetting(true);
    await api.documents.reset(company.id);
    const r = await api.documents.newSession() as { sessionId: string };
    setSessionId(r.sessionId);
    localStorage.setItem(getSessionKey(company.id), r.sessionId);
    setItems([]);
    setExistingDocs([]);
    setSessions([]);
    setShowResetConfirm(false);
    setResetting(false);
  };

  const pollStatus = useCallback((documentId: string, idx: number) => {
    const start = Date.now();
    const interval = setInterval(async () => {
      try {
        const data = await api.documents.status(documentId) as { parse_status: string };
        if (data.parse_status === 'parsed' || data.parse_status === 'failed') {
          clearInterval(interval);
          setItems((prev) => prev.map((item, i) =>
            i === idx ? { ...item, status: data.parse_status as UploadItem['status'] } : item
          ));
          if (data.parse_status === 'parsed') loadDocs();
        }
      } catch { /* ignore */ }
      if (Date.now() - start > 180000) {
        clearInterval(interval);
        setItems((prev) => prev.map((item, i) =>
          i === idx && item.status === 'processing' ? { ...item, status: 'failed' } : item
        ));
      }
    }, 3000);
  }, [loadDocs]);

  const uploadFile = useCallback(async (file: File, idx: number) => {
    if (!company || !sessionId) return;
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, status: 'uploading' } : item));
    try {
      const result = await api.documents.upload(company.id, file, sessionId) as { documentId: string; error?: string };
      if (result.error) throw new Error(result.error);
      setItems((prev) => prev.map((item, i) =>
        i === idx ? { ...item, status: 'processing', documentId: result.documentId } : item
      ));
      pollStatus(result.documentId, idx);
    } catch (err) {
      console.error('Upload failed:', err);
      setItems((prev) => prev.map((item, i) => i === idx ? { ...item, status: 'failed' } : item));
    }
  }, [company, sessionId, pollStatus]);

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
      alert('Failed to delete. Please try again.');
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

  // Docs in current session
  const currentSessionDocs = sessions.length > 0
    ? existingDocs.filter((d) => (d as Document & { test_session_id?: string }).test_session_id === sessions[0]?.sessionId)
    : existingDocs;

  const olderDocs = existingDocs.filter((d) => !currentSessionDocs.includes(d));
  const latestSession = sessions[0];

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-bark-brown mb-2">Upload documents</h1>
          <p className="text-taupe text-sm">Upload utility bills, HR exports, or board minutes. Tracewell extracts ESG metrics directly from them.</p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <button onClick={startNewBatch} className="btn-secondary text-sm py-1.5">
            + New upload batch
          </button>
          <button onClick={() => setShowResetConfirm(true)} className="text-xs text-error-rust hover:underline">
            Reset all company data
          </button>
        </div>
      </div>

      {/* Active session indicator */}
      <div className="card mb-6 bg-forest/5 border-forest/20 py-3 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-forest rounded-full" />
          <span className="text-sm font-medium text-forest">Active session</span>
          <span className="text-xs text-taupe font-mono">{sessionId.slice(0, 8)}…</span>
        </div>
        {latestSession && (
          <span className="text-xs text-taupe">
            {latestSession.fileCount} file{latestSession.fileCount !== 1 ? 's' : ''} · started {new Date(latestSession.uploadedAt).toLocaleString()}
          </span>
        )}
        {!latestSession && <span className="text-xs text-taupe">No uploads yet in this session</span>}
      </div>

      {/* Reset confirm dialog */}
      {showResetConfirm && (
        <div className="card mb-6 border-error-rust/30 bg-error-rust/5">
          <p className="font-medium text-bark-brown mb-1">Reset all data for {company.name}?</p>
          <p className="text-sm text-taupe mb-4">This deletes all documents, extracted fields, scores, recommendations, and CDP responses for this company. Cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={resetAll} disabled={resetting} className="bg-error-rust text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {resetting ? 'Resetting…' : 'Yes, reset everything'}
            </button>
            <button onClick={() => setShowResetConfirm(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Drop zone */}
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
          <h3 className="font-medium text-bark-brown mb-4 flex items-center gap-2">
            <span className="text-xs bg-forest text-white px-2 py-0.5 rounded-full">Current session</span>
            This batch
          </h3>
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

      {/* Current session docs from DB */}
      {currentSessionDocs.length > 0 && (
        <div className="card mb-4">
          <h3 className="font-medium text-bark-brown mb-4 flex items-center gap-2">
            <span className="text-xs bg-forest text-white px-2 py-0.5 rounded-full">Current session</span>
            Uploaded documents
          </h3>
          <div className="space-y-2">
            {currentSessionDocs.map((doc) => (
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
          {currentSessionDocs.some((d) => d.parse_status === 'parsed') && (
            <p className="text-xs text-taupe mt-3 pt-3 border-t border-sand">
              💡 If Review shows 0 fields, delete the document and re-upload it.
            </p>
          )}
        </div>
      )}

      {/* Older sessions (collapsed) */}
      {olderDocs.length > 0 && (
        <div className="card mb-6 opacity-60">
          <h3 className="font-medium text-taupe mb-2 text-sm flex items-center gap-2">
            <span className="text-xs bg-sand text-taupe px-2 py-0.5 rounded-full">Previous sessions</span>
            {olderDocs.length} older file{olderDocs.length !== 1 ? 's' : ''} — not used in current scoring
          </h3>
          <p className="text-xs text-taupe">These are from older upload batches. Click "New upload batch" to use fresh documents, or "Reset all company data" to clear everything.</p>
        </div>
      )}

      <div className="flex justify-between items-center mt-8">
        <Link to="/setup" className="btn-secondary">← Back</Link>
        <Link to="/review" className="btn-primary">Review extracted data →</Link>
      </div>
    </div>
  );
}
