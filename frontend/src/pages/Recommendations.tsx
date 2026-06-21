import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import type { Recommendation } from '../lib/types';

const PILLAR_COLORS = {
  E: { bg: 'bg-moss-light', text: 'text-forest', label: 'Environmental' },
  S: { bg: 'bg-sand', text: 'text-clay', label: 'Social' },
  G: { bg: 'bg-dusty-blue', text: 'text-deep-blue', label: 'Governance' },
};

const DIFFICULTY_COLORS = {
  low: 'text-forest',
  medium: 'text-clay',
  high: 'text-error-rust',
};

export default function Recommendations() {
  const { company } = useApp();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!company) return;
    setLoading(true);
    api.ai.recommendations(company.id).then((data) => {
      const d = data as { items: Recommendation[]; statusMap: Record<string, string> };
      setRecs(d.items || []);
      setStatusMap(d.statusMap || {});
    }).catch((err) => setError(err.message || 'Failed to load recommendations'))
      .finally(() => setLoading(false));
  }, [company]);

  const updateStatus = async (itemId: string, status: string) => {
    if (!company) return;
    const result = await api.ai.updateRecommendationStatus(company.id, itemId, status) as { statusMap: Record<string, string> };
    setStatusMap(result.statusMap);
  };

  const getStatus = (id: string) => statusMap[id] || 'pending';

  if (!company) return <div className="max-w-xl mx-auto px-6 py-16 text-center"><Link to="/setup" className="btn-primary">Set up company</Link></div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-bark-brown mb-2">Recommendations</h1>
        <p className="text-taupe">5 prioritized actions, ordered by impact-to-effort ratio.</p>
      </div>

      {error && <div className="bg-error-rust/10 text-error-rust px-4 py-3 rounded-lg mb-6">{error}</div>}

      {loading && (
        <div className="card text-center py-16">
          <div className="text-4xl mb-4 animate-pulse">💡</div>
          <p className="text-taupe">Generating recommendations based on your gaps…</p>
        </div>
      )}

      {!loading && recs.length > 0 && (
        <div className="space-y-4">
          {recs.map((rec, i) => {
            const status = getStatus(rec.id);
            const pillar = PILLAR_COLORS[rec.pillar];
            return (
              <div key={rec.id} className={`card ${status === 'done' ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sand flex items-center justify-center text-sm font-semibold text-taupe">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pillar.bg} ${pillar.text}`}>
                        {pillar.label}
                      </span>
                      <span className="text-xs text-taupe">
                        +{rec.estimatedScoreImpact} pts potential ·{' '}
                        <span className={DIFFICULTY_COLORS[rec.difficulty]}>
                          {rec.difficulty} effort
                        </span>
                      </span>
                    </div>
                    <h3 className="font-semibold text-bark-brown mb-1">{rec.title}</h3>
                    <p className="text-taupe text-sm mb-3">{rec.description}</p>
                    <div className="bg-cream rounded-lg px-3 py-2">
                      <p className="text-xs text-taupe mb-0.5">First step:</p>
                      <p className="text-sm text-bark-brown">{rec.firstStep}</p>
                    </div>
                  </div>
                  <div>
                    <select
                      className="text-xs border border-sand rounded px-2 py-1 bg-white-warm text-bark-brown"
                      value={status}
                      onChange={(e) => updateStatus(rec.id, e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In progress</option>
                      <option value="done">Done ✓</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && recs.length === 0 && !error && (
        <div className="card text-center py-12">
          <p className="text-taupe mb-4">No recommendations yet. Calculate your ESG score first.</p>
          <Link to="/score" className="btn-primary">Calculate score</Link>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <Link to="/report" className="btn-primary">Build report →</Link>
      </div>
    </div>
  );
}
