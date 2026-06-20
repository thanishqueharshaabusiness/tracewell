import { ESGInputData, ESGScoreResult, ExtractedField } from '../types';
import benchmarks from '../data/benchmarks.json';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalize(userValue: number, avgValue: number, lowerIsBetter = false): number {
  if (lowerIsBetter) {
    return clamp((avgValue / userValue) * 50, 0, 100);
  }
  return clamp((userValue / avgValue) * 50, 0, 100);
}

interface ScoringContext {
  data: Partial<ESGInputData>;
  extractedFields: ExtractedField[];
  industry: string;
  size: string;
}

function getFieldWeight(fieldKey: string, extractedFields: ExtractedField[]): number {
  const field = extractedFields.find((f) => f.fieldKey === fieldKey);
  if (!field) return 0.25; // missing field penalty
  if (field.source === 'self_reported' || !field.userConfirmed) return 0.7;
  return 1.0;
}

export function calculateESGScore(ctx: ScoringContext): ESGScoreResult {
  const { data, extractedFields, industry, size } = ctx;

  const benchmark = (benchmarks as Record<string, Record<string, unknown>>)[industry]?.[size] as Record<string, { avg: number }> | undefined;
  const bm = benchmark || (benchmarks as Record<string, Record<string, unknown>>)['technology']?.['small'] as Record<string, { avg: number }>;

  const eMetrics: { key: keyof ESGInputData; weight: number; lowerIsBetter?: boolean; benchmarkKey: string }[] = [
    { key: 'scope1Emissions', weight: 0.3, lowerIsBetter: true, benchmarkKey: 'scope1Emissions' },
    { key: 'scope2Emissions', weight: 0.25, lowerIsBetter: true, benchmarkKey: 'scope2Emissions' },
    { key: 'energyConsumption', weight: 0.2, lowerIsBetter: true, benchmarkKey: 'energyConsumption' },
    { key: 'renewableEnergyPct', weight: 0.15, benchmarkKey: 'renewableEnergyPct' },
    { key: 'wasteGenerated', weight: 0.05, lowerIsBetter: true, benchmarkKey: 'wasteGenerated' },
    { key: 'waterUse', weight: 0.05, lowerIsBetter: true, benchmarkKey: 'waterUse' },
  ];

  const sMetrics: { key: keyof ESGInputData; weight: number; lowerIsBetter?: boolean; benchmarkKey: string }[] = [
    { key: 'genderDiversityPct', weight: 0.25, benchmarkKey: 'genderDiversityPct' },
    { key: 'minorityRepPct', weight: 0.2, benchmarkKey: 'genderDiversityPct' },
    { key: 'safetyIncidentRate', weight: 0.25, lowerIsBetter: true, benchmarkKey: 'safetyIncidentRate' },
    { key: 'trainingHoursPerEmployee', weight: 0.2, benchmarkKey: 'trainingHoursPerEmployee' },
    { key: 'livingWageCompliance', weight: 0.1, benchmarkKey: 'genderDiversityPct' },
  ];

  const gMetrics: { key: keyof ESGInputData; weight: number; fixed?: number }[] = [
    { key: 'boardGenderDiversityPct', weight: 0.25 },
    { key: 'independentDirectorsPct', weight: 0.25 },
    { key: 'ethicsPolicyWritten', weight: 0.2, fixed: undefined },
    { key: 'dataPrivacyPolicy', weight: 0.15, fixed: undefined },
    { key: 'whistleblowerMechanism', weight: 0.15, fixed: undefined },
  ];

  let eScore = 0;
  let eWeightTotal = 0;
  const gaps: string[] = [];

  for (const m of eMetrics) {
    const val = data[m.key];
    const avg = bm?.[m.benchmarkKey]?.avg;
    if (val == null || !avg) {
      eScore += 25 * m.weight;
      if (val == null) gaps.push(m.key);
    } else {
      const raw = typeof val === 'number' ? normalize(val, avg, m.lowerIsBetter) : 50;
      const weight = getFieldWeight(m.key, extractedFields);
      eScore += raw * m.weight * weight + (raw * m.weight * (1 - weight) * 0.25);
    }
    eWeightTotal += m.weight;
  }
  eScore = eWeightTotal > 0 ? eScore / eWeightTotal : 25;

  let sScore = 0;
  let sWeightTotal = 0;
  for (const m of sMetrics) {
    const val = data[m.key];
    const avg = bm?.[m.benchmarkKey]?.avg;
    if (val == null) {
      sScore += 25 * m.weight;
      gaps.push(m.key);
    } else if (typeof val === 'boolean') {
      const raw = val ? 90 : 20;
      const weight = getFieldWeight(m.key, extractedFields);
      sScore += raw * m.weight * weight;
    } else if (avg) {
      const raw = normalize(val as number, avg, m.lowerIsBetter);
      const weight = getFieldWeight(m.key, extractedFields);
      sScore += raw * m.weight * weight + (raw * m.weight * (1 - weight) * 0.25);
    }
    sWeightTotal += m.weight;
  }
  sScore = sWeightTotal > 0 ? sScore / sWeightTotal : 25;

  let gScore = 0;
  let gWeightTotal = 0;
  for (const m of gMetrics) {
    const val = data[m.key];
    if (val == null) {
      gScore += 25 * m.weight;
      gaps.push(m.key);
    } else if (typeof val === 'boolean') {
      gScore += (val ? 90 : 10) * m.weight;
    } else if (typeof val === 'number') {
      const avg = bm?.['boardGenderDiversityPct']?.avg || 35;
      const raw = normalize(val, avg);
      const weight = getFieldWeight(m.key, extractedFields);
      gScore += raw * m.weight * weight;
    }
    gWeightTotal += m.weight;
  }
  gScore = gWeightTotal > 0 ? gScore / gWeightTotal : 25;

  const overall = eScore * 0.4 + sScore * 0.35 + gScore * 0.25;

  const documentVerifiedCount = extractedFields.filter(
    (f) => f.source === 'document_parsed' && f.userConfirmed
  ).length;
  const totalFields = extractedFields.length || 1;
  const dataQualityScore = Math.round((documentVerifiedCount / totalFields) * 100);

  const percentileRank = Math.round(clamp(overall - 10 + Math.random() * 20, 5, 95));

  return {
    overall: Math.round(overall),
    environmental: Math.round(eScore),
    social: Math.round(sScore),
    governance: Math.round(gScore),
    percentileRank,
    interpretation: '',
    gaps: [...new Set(gaps)].slice(0, 5),
    dataQualityScore,
  };
}
