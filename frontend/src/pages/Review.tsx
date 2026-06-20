import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { FIELD_LABELS, FIELD_PILLAR, getFieldValue } from '../lib/types';
import type { ExtractedField } from '../lib/types';

function ConfidenceBadge({ confidence }: { confidence: string }) {
  return <span className={`badge-${confidence}`}>{confidence}</span>;
}

function SourceBadge({ source }: { source: string }) {
  return source === 'document_parsed'
    ? <span className="badge-verified">Document-verified</span>
    : <span className="badge-self-reported">Self-reported</span>;
}

function PillarChip({ pillar }: { pillar: 'E' | 'S' | 'G' }) {
  const map = { E: 'bg-moss-light text-forest', S: 'bg-sand text-clay', G: 'bg-dusty-blue text-deep-blue' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[pillar]}`}>{pillar}</span>;
}

export default function Review() {
  const { company } = useApp();
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (!company) return;
    api.fields.listByCompany(company.id)
      .then((data) => {
        setFields(data as ExtractedField[]);
      })
      .catch((err) => console.error('Failed to load fields:', err))
      .finally(() => setLoading(false));
  }, [company]);

  const confirm = async (field: ExtractedField, newValue?: unknown) => {
    const val = newValue !== undefined ? newValue : getFieldValue(field);
    await api.fields.confirm(field.id, val, field.unit || undefined);
    setFields((prev) =>
      prev.map((f) => f.id === field.id ? { ...f, user_confirmed: true, value: { v: val as never } } : f)
    );
    setEditingId(null);
  };

  const reject = async (field: ExtractedField) => {
    await api.fields.reject(field.id);
    setFields((prev) => prev.filter((f) => f.id !== field.id));
  };

  if (!company) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <Link to="/setup" className="btn-primary">Set up company first</Link>
      </div>
    );
  }

  if (loading) return <div className="max-w-3xl mx-auto px-6 py-12 text-taupe">Loading extracted fields…</div>;

  const confirmed = fields.filter((f) => f.user_confirmed);
  const pending = fields.filter((f) => !f.user_confirmed && !f.flagged_discrepancy);
  const discrepancies = fields.filter((f) => f.flagged_discrepancy);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-bark-brown mb-2">Review extracted data</h1>
          <p className="text-taupe">{fields.length} fields extracted · {confirmed.length} confirmed · {discrepancies.length} discrepancies</p>
        </div>
        <Link to="/score" className="btn-primary">Calculate score →</Link>
      </div>

      {discrepancies.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-warning-clay mb-3 flex items-center gap-2">
            ⚠ Discrepancies ({discrepancies.length})
          </h2>
          <div className="space-y-3">
            {discrepancies.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                expanded={expandedId === field.id}
                editing={editingId === field.id}
                editValue={editValue}
                onExpand={() => setExpandedId(expandedId === field.id ? null : field.id)}
                onStartEdit={() => { setEditingId(field.id); setEditValue(String(getFieldValue(field))); }}
                onSaveEdit={() => confirm(field, editValue)}
                onEditChange={setEditValue}
                onConfirm={() => confirm(field)}
                onReject={() => reject(field)}
              />
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-bark-brown mb-3">Awaiting review ({pending.length})</h2>
          <div className="space-y-2">
            {pending.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                expanded={expandedId === field.id}
                editing={editingId === field.id}
                editValue={editValue}
                onExpand={() => setExpandedId(expandedId === field.id ? null : field.id)}
                onStartEdit={() => { setEditingId(field.id); setEditValue(String(getFieldValue(field))); }}
                onSaveEdit={() => confirm(field, editValue)}
                onEditChange={setEditValue}
                onConfirm={() => confirm(field)}
                onReject={() => reject(field)}
              />
            ))}
          </div>
        </div>
      )}

      {confirmed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-forest mb-3">Confirmed ({confirmed.length})</h2>
          <div className="space-y-2">
            {confirmed.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                expanded={expandedId === field.id}
                editing={false}
                editValue=""
                onExpand={() => setExpandedId(expandedId === field.id ? null : field.id)}
                onStartEdit={() => {}}
                onSaveEdit={() => {}}
                onEditChange={() => {}}
                onConfirm={() => {}}
                onReject={() => reject(field)}
              />
            ))}
          </div>
        </div>
      )}

      {fields.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-taupe mb-4">No fields extracted yet. Upload some documents first.</p>
          <Link to="/upload" className="btn-primary">Upload documents</Link>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <Link to="/wizard" className="btn-secondary">Enter missing fields manually</Link>
        <Link to="/score" className="btn-primary">Calculate ESG score →</Link>
      </div>
    </div>
  );
}

function FieldRow({
  field, expanded, editing, editValue,
  onExpand, onStartEdit, onSaveEdit, onEditChange, onConfirm, onReject,
}: {
  field: ExtractedField;
  expanded: boolean;
  editing: boolean;
  editValue: string;
  onExpand: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const val = getFieldValue(field);
  const pillar = FIELD_PILLAR[field.field_key];
  const displayVal = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);

  return (
    <div className={`card py-3 px-4 ${field.flagged_discrepancy ? 'border-warning-clay' : field.user_confirmed ? 'border-moss-light' : ''}`}>
      <div className="flex items-center gap-3 flex-wrap">
        {pillar && <PillarChip pillar={pillar} />}
        <span className="font-medium text-bark-brown text-sm flex-1">
          {FIELD_LABELS[field.field_key] || field.field_key}
        </span>
        <span className="text-bark-brown font-semibold">
          {editing ? (
            <input
              className="input w-32 text-sm py-1"
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
            />
          ) : (
            <>{displayVal}{field.unit && ` ${field.unit}`}</>
          )}
        </span>
        <ConfidenceBadge confidence={field.confidence} />
        <SourceBadge source={field.source} />
        {field.flagged_discrepancy && <span className="badge-discrepancy">⚠ Discrepancy</span>}
        {field.user_confirmed && <span className="badge-high">✓ Confirmed</span>}

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={onExpand} className="text-xs text-taupe hover:text-bark-brown underline">
            {expanded ? 'Hide quote' : 'View quote'}
          </button>
          {!field.user_confirmed && (
            <>
              {editing ? (
                <button onClick={onSaveEdit} className="text-xs bg-forest text-white px-2 py-0.5 rounded">Save</button>
              ) : (
                <button onClick={onStartEdit} className="text-xs text-slate-blue underline">Edit</button>
              )}
              <button onClick={onConfirm} className="text-xs bg-moss-light text-forest px-2 py-0.5 rounded font-medium">Confirm</button>
            </>
          )}
          <button onClick={onReject} className="text-xs text-error-rust underline">Remove</button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-sand">
          <div className="bg-cream rounded-lg px-4 py-3 text-sm">
            <p className="text-taupe text-xs mb-1">
              Source: {(field.documents as { filename?: string })?.filename || 'Document'}
              {field.page_reference && ` · ${field.page_reference}`}
            </p>
            <p className="text-bark-brown italic">"{field.extracted_quote}"</p>
          </div>
        </div>
      )}
    </div>
  );
}
