import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { getFieldValue, FIELD_LABELS } from '../lib/types';
import type { ExtractedField } from '../lib/types';

interface BenchmarkEntry {
  avg: number;
  min: number;
  max: number;
  source: string;
}

interface BenchmarkData {
  [key: string]: BenchmarkEntry;
}

const CHARTABLE_FIELDS = [
  'scope1Emissions', 'scope2Emissions', 'energyConsumption', 'renewableEnergyPct',
  'genderDiversityPct', 'boardGenderDiversityPct', 'safetyIncidentRate', 'trainingHoursPerEmployee',
];

export default function Benchmarks() {
  const { company } = useApp();
  const [benchmarks, setBenchmarks] = useState<BenchmarkData | null>(null);
  const [userFields, setUserFields] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    Promise.all([
      api.ai.benchmarks(company.industry, company.size),
      api.fields.listByCompany(company.id),
    ]).then(([bm, fields]) => {
      setBenchmarks(bm as BenchmarkData);
      const userMap: Record<string, number> = {};
      for (const f of fields as ExtractedField[]) {
        if (f.user_confirmed || f.source === 'self_reported') {
          const v = getFieldValue(f);
          if (typeof v === 'number') userMap[f.field_key] = v;
        }
      }
      setUserFields(userMap);
    }).catch(console.error).finally(() => setLoading(false));
  }, [company]);

  if (!company) return <div className="max-w-xl mx-auto px-6 py-16 text-center text-taupe">No company selected.</div>;
  if (loading) return <div className="max-w-xl mx-auto px-6 py-16 text-center text-taupe">Loading benchmarks…</div>;
  if (!benchmarks) return (
    <div className="max-w-xl mx-auto px-6 py-16 text-center">
      <p className="text-taupe mb-2">No benchmark data available for {company.industry} / {company.size}.</p>
    </div>
  );

  const chartData = CHARTABLE_FIELDS.map((key) => {
    const bm = benchmarks[key];
    if (!bm) return null;
    return {
      key,
      label: FIELD_LABELS[key] || key,
      industry_avg: bm.avg,
      your_value: userFields[key] ?? null,
      source: bm.source,
    };
  }).filter(Boolean);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-bark-brown mb-2">Industry benchmarks</h1>
        <p className="text-taupe">
          {company.industry.replace(/_/g, ' ')} · {company.size} · Comparing your verified values to sector averages
        </p>
        <p className="text-xs text-taupe mt-1 italic">
          Note: benchmarks marked "mock" use modeled ranges based on CDP sector averages, not live external data.
        </p>
      </div>

      <div className="grid gap-6">
        {chartData.map((item) => {
          if (!item) return null;
          const hasYourValue = item.your_value !== null;
          const data = [
            { name: 'Industry avg', value: item.industry_avg, fill: '#A8C0CB' },
            ...(hasYourValue ? [{ name: company.name, value: item.your_value, fill: '#3D5A40' }] : []),
          ];

          return (
            <div key={item.key} className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-bark-brown">{item.label}</h3>
                <div className="flex items-center gap-2">
                  {item.source === 'mock' && (
                    <span className="text-xs text-taupe bg-sand px-2 py-0.5 rounded-full">Estimated range</span>
                  )}
                  {!hasYourValue && (
                    <span className="text-xs text-taupe">No data uploaded</span>
                  )}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={60}>
                <BarChart data={data} layout="vertical" margin={{ left: 0, right: 40 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12, fill: '#8B7E6D' }} />
                  <Tooltip
                    formatter={(v) => [Number(v).toLocaleString(), '']}
                    contentStyle={{ background: '#FDFCFA', border: '1px solid #E8DFD0', borderRadius: 8 }}
                  />
                  <Bar dataKey="value" radius={4}>
                    {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}
