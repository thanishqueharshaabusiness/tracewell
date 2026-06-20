import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RadialBarChart, RadialBar, ResponsiveContainer, Cell } from 'recharts';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import type { ESGScore } from '../lib/types';

function ScoreDial({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="text-center">
      <div className="relative w-32 h-32 mx-auto">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="70%" outerRadius="100%"
            data={[{ value, fill: color }]}
            startAngle={180} endAngle={-180}
          >
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#E8DFD0' }}>
              <Cell fill={color} />
            </RadialBar>
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-bark-brown">{value}</span>
          <span className="text-xs text-taupe">/100</span>
        </div>
      </div>
      <p className="mt-2 font-medium text-bark-brown">{label}</p>
    </div>
  );
}

export default function Score() {
  const { company } = useApp();
  const [score, setScore] = useState<ESGScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const calculate = async () => {
    if (!company) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.ai.score(company.id) as ESGScore;
      setScore(result);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => { calculate(); }, [company]);

  if (!company) return (
    <div className="max-w-xl mx-auto px-6 py-16 text-center">
      <Link to="/setup" className="btn-primary">Set up company first</Link>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-bark-brown mb-2">ESG Score</h1>
          <p className="text-taupe">{company.name} · {company.industry} · {company.size}</p>
        </div>
        <button onClick={calculate} disabled={loading} className="btn-secondary">
          {loading ? 'Calculating…' : 'Recalculate'}
        </button>
      </div>

      {error && <div className="bg-error-rust/10 text-error-rust px-4 py-3 rounded-lg mb-6">{error}</div>}

      {loading && (
        <div className="card text-center py-16">
          <div className="text-4xl mb-4 animate-pulse">🌿</div>
          <p className="text-taupe">Calculating your ESG score and generating interpretation…</p>
        </div>
      )}

      {score && !loading && (
        <div className="space-y-6">
          {/* Main score */}
          <div className="card text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-6xl font-bold text-forest">{score.overall}</span>
              <span className="text-2xl text-taupe">/100</span>
            </div>
            <p className="text-taupe mb-3">~{score.percentileRank}th percentile for your industry</p>
            <div className="flex items-center justify-center gap-3">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                score.dataQualityScore >= 80 ? 'bg-moss-light text-forest' :
                score.dataQualityScore >= 60 ? 'bg-dusty-blue text-deep-blue' :
                'bg-sand text-taupe'
              }`}>
                {score.dataQualityScore}% document-verified
              </div>
              {score.dataQualityScore < 60 && (
                <span className="text-xs text-warning-clay">Score reliability is provisional</span>
              )}
            </div>
          </div>

          {/* Pillar breakdown */}
          <div className="card">
            <h2 className="font-semibold text-bark-brown mb-6">Pillar breakdown</h2>
            <div className="grid grid-cols-3 gap-6">
              <ScoreDial value={score.environmental} color="#7A8B6F" label="Environmental" />
              <ScoreDial value={score.social} color="#A67B5B" label="Social" />
              <ScoreDial value={score.governance} color="#5B7C8D" label="Governance" />
            </div>
          </div>

          {/* Interpretation */}
          {score.interpretation && (
            <div className="card">
              <h2 className="font-semibold text-bark-brown mb-4">Interpretation</h2>
              <div className="prose prose-sm text-bark-brown max-w-none leading-relaxed space-y-3">
                {score.interpretation.split('\n\n').map((para, i) => (
                  <p key={i} dangerouslySetInnerHTML={{
                    __html: para.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {score.gaps.length > 0 && (
            <div className="card border-warning-clay/30">
              <h2 className="font-semibold text-bark-brown mb-3">Data gaps</h2>
              <p className="text-taupe text-sm mb-3">These fields have no data — providing them would improve score accuracy.</p>
              <div className="flex flex-wrap gap-2">
                {score.gaps.map((gap) => (
                  <span key={gap} className="badge-low">{gap}</span>
                ))}
              </div>
              <Link to="/wizard" className="text-sm text-forest underline mt-3 inline-block">
                Enter missing data manually →
              </Link>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Link to="/benchmarks" className="btn-secondary">View benchmarks →</Link>
            <Link to="/recommendations" className="btn-primary">Get recommendations →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
