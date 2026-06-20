import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { FIELD_LABELS, FIELD_UNITS, getFieldValue } from '../lib/types';
import type { ExtractedField, ESGScore } from '../lib/types';

interface Narrative {
  strategy: string;
  targets: string;
  governance: string;
}

export default function Report() {
  const { company } = useApp();
  const [narrative, setNarrative] = useState<Narrative | null>(null);
  const [editedNarrative, setEditedNarrative] = useState<Narrative | null>(null);
  const [score, setScore] = useState<ESGScore | null>(null);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!company) return;
    setLoading(true);
    Promise.all([
      api.ai.reportNarrative(company.id),
      api.ai.score(company.id),
      api.fields.listByCompany(company.id),
    ]).then(([narr, sc, flds]) => {
      const n = narr as Narrative;
      setNarrative(n);
      setEditedNarrative(n);
      setScore(sc as ESGScore);
      setFields((flds as ExtractedField[]).filter((f) => f.user_confirmed));
      setLoading(false);
    }).catch((err) => { setError(err.message); setLoading(false); });
  }, [company]);

  const handleExport = () => {
    if (!company || !score || !editedNarrative) return;
    const content = buildReportText(company.name, score, fields, editedNarrative);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${company.name.replace(/\s+/g, '-')}-ESG-Report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!company) return <div className="max-w-xl mx-auto px-6 py-16 text-center text-taupe">No company selected.</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-bark-brown mb-2">ESG Report</h1>
          <p className="text-taupe">{company.name} · {new Date().getFullYear()}</p>
        </div>
        <button onClick={handleExport} disabled={!narrative} className="btn-primary">
          Export report
        </button>
      </div>

      {error && <div className="bg-error-rust/10 text-error-rust px-4 py-3 rounded-lg mb-6">{error}</div>}

      {loading && (
        <div className="card text-center py-16">
          <div className="text-4xl mb-4 animate-pulse">📊</div>
          <p className="text-taupe">Generating your ESG report narrative…</p>
        </div>
      )}

      {!loading && score && (
        <div className="space-y-6">
          {/* Score summary */}
          <div className="card">
            <h2 className="font-semibold text-bark-brown mb-4">Score Summary</h2>
            <div className="grid grid-cols-4 gap-4 text-center">
              {[
                { label: 'Overall', value: score.overall, color: 'text-forest' },
                { label: 'Environmental', value: score.environmental, color: 'text-sage' },
                { label: 'Social', value: score.social, color: 'text-clay' },
                { label: 'Governance', value: score.governance, color: 'text-slate-blue' },
              ].map((s) => (
                <div key={s.label}>
                  <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-taupe mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-sand flex items-center justify-between">
              <span className="text-sm text-taupe">Data quality</span>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                score.dataQualityScore >= 80 ? 'bg-moss-light text-forest' : 'bg-sand text-taupe'
              }`}>
                {score.dataQualityScore}% document-verified
              </div>
            </div>
          </div>

          {/* Verified data with provenance */}
          <div className="card">
            <h2 className="font-semibold text-bark-brown mb-4">Verified Data</h2>
            <p className="text-xs text-taupe mb-4">Every value below is traceable to a source document.</p>
            <div className="space-y-2">
              {fields.map((field) => (
                <div key={field.id} className="flex items-start justify-between py-2 border-b border-sand last:border-0 gap-4">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-bark-brown">{FIELD_LABELS[field.field_key] || field.field_key}</span>
                    {field.extracted_quote && field.extracted_quote !== 'Manually entered' && (
                      <p className="text-xs text-taupe mt-0.5 italic">"{field.extracted_quote}"</p>
                    )}
                    {field.page_reference && (
                      <p className="text-xs text-taupe">{field.page_reference}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-semibold text-bark-brown">
                      {String(getFieldValue(field))} {field.unit || FIELD_UNITS[field.field_key] || ''}
                    </span>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      {field.source === 'document_parsed'
                        ? <span className="badge-verified">Document-verified</span>
                        : <span className="badge-self-reported">Self-reported</span>}
                      <span className={`badge-${field.confidence}`}>{field.confidence}</span>
                    </div>
                  </div>
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-taupe text-sm">No confirmed fields yet.</p>
              )}
            </div>
          </div>

          {/* Editable narrative */}
          {editedNarrative && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-bark-brown">Narrative</h2>
                <span className="text-xs text-taupe italic">AI-generated · editable before export</span>
              </div>
              <div className="space-y-4">
                {(['strategy', 'targets', 'governance'] as const).map((section) => (
                  <div key={section}>
                    <label className="label capitalize">{section}</label>
                    <textarea
                      className="input min-h-[100px] text-sm"
                      value={editedNarrative[section]}
                      onChange={(e) => setEditedNarrative((n) => n ? { ...n, [section]: e.target.value } : n)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildReportText(companyName: string, score: ESGScore, fields: ExtractedField[], narrative: Narrative): string {
  const lines = [
    `ESG REPORT — ${companyName}`,
    `Generated: ${new Date().toLocaleDateString()}`,
    '',
    '=== SCORES ===',
    `Overall: ${score.overall}/100`,
    `Environmental: ${score.environmental}/100`,
    `Social: ${score.social}/100`,
    `Governance: ${score.governance}/100`,
    `Percentile rank: ~${score.percentileRank}th`,
    `Data quality: ${score.dataQualityScore}% document-verified`,
    '',
    '=== VERIFIED DATA ===',
    ...fields.map((f) => {
      const val = getFieldValue(f);
      const unit = f.unit || FIELD_UNITS[f.field_key] || '';
      const src = f.source === 'document_parsed' ? 'Document-verified' : 'Self-reported';
      const quote = f.extracted_quote && f.extracted_quote !== 'Manually entered'
        ? `\n   Quote: "${f.extracted_quote}"` : '';
      const page = f.page_reference ? `\n   ${f.page_reference}` : '';
      return `${FIELD_LABELS[f.field_key] || f.field_key}: ${val} ${unit} [${src}, ${f.confidence} confidence]${quote}${page}`;
    }),
    '',
    '=== STRATEGY ===',
    narrative.strategy,
    '',
    '=== TARGETS ===',
    narrative.targets,
    '',
    '=== GOVERNANCE ===',
    narrative.governance,
  ];
  return lines.join('\n');
}
