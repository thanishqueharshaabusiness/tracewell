import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';

interface CDPResponse {
  id?: string;
  question_code: string;
  question_text: string;
  questionCode?: string;
  questionText?: string;
  status: 'answered' | 'partial' | 'gap';
  answer: string | null;
  source_label?: string | null;
  sourceLabel?: string | null;
  confidence?: string | null;
  gap_explanation?: string | null;
  gapExplanation?: string | null;
  user_edited?: boolean;
}

interface CDPResult {
  responses: CDPResponse[];
  fromCache: boolean;
}

const CDP_MODULES = [
  { code: 'C0', name: 'Introduction' },
  { code: 'C4', name: 'Emissions targets' },
  { code: 'C5', name: 'Emissions methodology' },
  { code: 'C6', name: 'Emissions data' },
  { code: 'C7', name: 'Emissions breakdown' },
  { code: 'C8', name: 'Energy' },
  { code: 'C10', name: 'Verification' },
  { code: 'C12', name: 'Value chain engagement' },
  { code: 'C16', name: 'Sign off' },
  { code: 'SC0', name: 'Supply chain introduction' },
  { code: 'SC1', name: 'Allocating emissions to customers' },
  { code: 'SC2', name: 'Collaborative opportunities' },
];

function normalize(r: CDPResponse) {
  return {
    code: r.question_code || r.questionCode || '',
    text: r.question_text || r.questionText || '',
    status: r.status,
    answer: r.answer,
    sourceLabel: r.source_label || r.sourceLabel || null,
    confidence: r.confidence || null,
    gapExplanation: r.gap_explanation || r.gapExplanation || null,
    userEdited: r.user_edited || false,
  };
}

const STATUS_STYLES = {
  answered: { bg: 'bg-moss-light', text: 'text-forest', border: 'border-l-forest', label: '✓ Answered' },
  partial: { bg: 'bg-dusty-blue', text: 'text-deep-blue', border: 'border-l-slate-blue', label: '◐ Partial' },
  gap: { bg: 'bg-warning-clay/20', text: 'text-warning-clay', border: 'border-l-warning-clay', label: '⚠ Needs input' },
};

export default function Report() {
  const { company } = useApp();
  const [responses, setResponses] = useState<ReturnType<typeof normalize>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [supplyChain, setSupplyChain] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(CDP_MODULES.map(m => m.code)));

  const loadCDP = async (forceRefresh = false) => {
    if (!company) return;
    if (forceRefresh) await api.cdp.clearCache(company.id);
    setLoading(true);
    setError('');
    try {
      const result = await api.cdp.map(company.id, supplyChain) as CDPResult;
      setResponses(result.responses.map(normalize));
      setFromCache(result.fromCache);
    } catch (err) {
      setError((err as Error).message || 'Failed to generate CDP report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCDP(); }, [company, supplyChain]);

  const saveEdit = async (code: string) => {
    if (!company) return;
    await api.cdp.updateAnswer(company.id, code, editValue);
    setResponses((prev) => prev.map((r) =>
      r.code === code ? { ...r, answer: editValue, status: 'answered' as const, userEdited: true } : r
    ));
    setEditingCode(null);
  };

  const toggleModule = (code: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const answered = responses.filter((r) => r.status === 'answered').length;
  const partial = responses.filter((r) => r.status === 'partial').length;
  const gaps = responses.filter((r) => r.status === 'gap').length;

  if (!company) {
    return <div className="max-w-xl mx-auto px-6 py-16 text-center text-taupe">No company selected.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-bark-brown mb-1">CDP Climate Report</h1>
          <p className="text-taupe text-sm">{company.name} · Minimum Questionnaire · Reporting Year {new Date().getFullYear() - 1}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {fromCache && (
            <button onClick={() => loadCDP(true)} className="btn-secondary text-sm py-1.5">
              ↻ Regenerate
            </button>
          )}
          <a
            href={api.cdp.pdfUrl(company.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm py-1.5"
          >
            Export PDF
          </a>
        </div>
      </div>

      {error && <div className="bg-error-rust/10 text-error-rust px-4 py-3 rounded-lg mb-6">{error}</div>}

      {/* Supply chain toggle */}
      <div className="card mb-6 flex items-center justify-between">
        <div>
          <p className="font-medium text-bark-brown text-sm">Responding to a customer's CDP Supply Chain request?</p>
          <p className="text-taupe text-xs mt-0.5">Enables SC0, SC1, SC2 modules</p>
        </div>
        <button
          onClick={() => setSupplyChain(!supplyChain)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${supplyChain ? 'bg-forest' : 'bg-sand'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${supplyChain ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {loading && (
        <div className="card text-center py-16">
          <div className="text-4xl mb-4 animate-pulse">📋</div>
          <p className="text-taupe font-medium mb-1">Mapping your ESG data to CDP questions…</p>
          <p className="text-taupe text-sm">This takes 20–40 seconds. Claude is reviewing each question against your documents.</p>
        </div>
      )}

      {!loading && responses.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="card mb-8">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold text-forest">{answered}</div>
                <div className="text-sm text-taupe mt-1">Answered from documents</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-blue">{partial}</div>
                <div className="text-sm text-taupe mt-1">Partial data</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-warning-clay">{gaps}</div>
                <div className="text-sm text-taupe mt-1">Need additional input</div>
              </div>
            </div>
            {fromCache && (
              <p className="text-xs text-taupe text-center mt-4 pt-3 border-t border-sand">
                Showing cached mapping · <button onClick={() => loadCDP(true)} className="text-forest underline">Regenerate</button> after confirming new fields
              </p>
            )}
          </div>

          {/* Module accordion */}
          {CDP_MODULES.map((module) => {
            const moduleResponses = responses.filter((r) => r.code.startsWith(module.code));
            if (moduleResponses.length === 0) return null;
            const expanded = expandedModules.has(module.code);
            const moduleAnswered = moduleResponses.filter((r) => r.status === 'answered').length;
            const moduleGaps = moduleResponses.filter((r) => r.status === 'gap').length;

            return (
              <div key={module.code} className="card mb-4 p-0 overflow-hidden">
                <button
                  onClick={() => toggleModule(module.code)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-cream/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-bark-brown">{module.code}</span>
                    <span className="text-taupe">—</span>
                    <span className="font-medium text-bark-brown">{module.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-moss-light text-forest px-2 py-0.5 rounded-full">{moduleAnswered} answered</span>
                    {moduleGaps > 0 && <span className="text-xs bg-warning-clay/20 text-warning-clay px-2 py-0.5 rounded-full">{moduleGaps} gaps</span>}
                    <span className="text-taupe">{expanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-sand divide-y divide-sand">
                    {moduleResponses.map((r) => {
                      const style = STATUS_STYLES[r.status] || STATUS_STYLES.gap;
                      const isEditing = editingCode === r.code;

                      return (
                        <div key={r.code} className={`px-6 py-4 border-l-4 ${r.status === 'answered' ? 'border-l-forest' : r.status === 'partial' ? 'border-l-slate-blue' : 'border-l-warning-clay'}`}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-umber">{r.code}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
                                {style.label}
                              </span>
                              {r.userEdited && <span className="text-xs text-taupe italic">edited</span>}
                            </div>
                            <button
                              onClick={() => {
                                setEditingCode(r.code);
                                setEditValue(r.answer || '');
                              }}
                              className="text-xs text-slate-blue underline flex-shrink-0"
                            >
                              {r.status === 'gap' ? 'Add answer' : 'Edit'}
                            </button>
                          </div>

                          <p className="text-sm font-medium text-bark-brown mb-2">{r.text}</p>

                          {isEditing ? (
                            <div className="mt-2">
                              <textarea
                                className="input text-sm min-h-[80px] w-full"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                placeholder="Enter your answer…"
                              />
                              <div className="flex gap-2 mt-2">
                                <button onClick={() => saveEdit(r.code)} className="btn-primary text-sm py-1.5">Save</button>
                                <button onClick={() => setEditingCode(null)} className="btn-secondary text-sm py-1.5">Cancel</button>
                              </div>
                            </div>
                          ) : r.status === 'gap' ? (
                            <div className="bg-cream rounded-lg px-3 py-2 mt-1">
                              <p className="text-xs text-warning-clay font-medium mb-0.5">What's needed:</p>
                              <p className="text-sm text-bark-brown">{r.gapExplanation || 'No data available for this question.'}</p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm text-bark-brown leading-relaxed">{r.answer}</p>
                              {r.sourceLabel && (
                                <p className="text-xs text-taupe mt-1 italic">
                                  Source: {r.sourceLabel}
                                  {r.confidence && ` · ${r.confidence} confidence`}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {!loading && responses.length === 0 && !error && (
        <div className="card text-center py-12">
          <p className="text-taupe mb-4">Calculate your ESG score first, then generate your CDP report.</p>
          <a href="/score" className="btn-primary">Calculate score →</a>
        </div>
      )}
    </div>
  );
}
