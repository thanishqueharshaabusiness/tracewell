export interface Company {
  id: string;
  user_id: string;
  name: string;
  industry: string;
  size: 'micro' | 'small' | 'medium';
  country: string;
  created_at: string;
}

export interface Document {
  id: string;
  company_id: string;
  filename: string;
  file_type: string;
  storage_url: string;
  parse_status: 'pending' | 'processing' | 'parsed' | 'failed';
  uploaded_at: string;
}

export interface ExtractedField {
  id: string;
  document_id: string;
  company_id: string;
  field_key: string;
  value: { v: number | boolean | string } | number | boolean | string;
  unit: string | null;
  extracted_quote: string;
  page_reference: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'document_parsed' | 'self_reported';
  user_confirmed: boolean;
  flagged_discrepancy: boolean;
  created_at: string;
  documents?: { filename: string };
}

export interface ESGScore {
  overall: number;
  environmental: number;
  social: number;
  governance: number;
  percentileRank: number;
  interpretation: string;
  gaps: string[];
  dataQualityScore: number;
}

export interface Recommendation {
  id: string;
  pillar: 'E' | 'S' | 'G';
  title: string;
  description: string;
  estimatedScoreImpact: number;
  difficulty: 'low' | 'medium' | 'high';
  firstStep: string;
  status: 'pending' | 'in_progress' | 'done';
}

export const FIELD_LABELS: Record<string, string> = {
  scope1Emissions: 'Scope 1 Emissions',
  scope2Emissions: 'Scope 2 Emissions',
  energyConsumption: 'Energy Consumption',
  renewableEnergyPct: 'Renewable Energy %',
  wasteGenerated: 'Waste Generated',
  waterUse: 'Water Use',
  totalHeadcount: 'Total Headcount',
  genderDiversityPct: 'Gender Diversity %',
  minorityRepPct: 'Minority Representation %',
  safetyIncidentRate: 'Safety Incident Rate',
  trainingHoursPerEmployee: 'Training Hours / Employee',
  livingWageCompliance: 'Living Wage Compliance',
  boardSize: 'Board Size',
  boardGenderDiversityPct: 'Board Gender Diversity %',
  independentDirectorsPct: 'Independent Directors %',
  ethicsPolicyWritten: 'Ethics Policy (Written)',
  dataPrivacyPolicy: 'Data Privacy Policy',
  whistleblowerMechanism: 'Whistleblower Mechanism',
};

export const FIELD_UNITS: Record<string, string> = {
  scope1Emissions: 'tCO2e',
  scope2Emissions: 'tCO2e',
  energyConsumption: 'MWh',
  renewableEnergyPct: '%',
  wasteGenerated: 'tonnes',
  waterUse: 'm³',
  genderDiversityPct: '%',
  minorityRepPct: '%',
  safetyIncidentRate: 'per 100 workers',
  trainingHoursPerEmployee: 'hours',
  boardGenderDiversityPct: '%',
  independentDirectorsPct: '%',
};

export const FIELD_PILLAR: Record<string, 'E' | 'S' | 'G'> = {
  scope1Emissions: 'E',
  scope2Emissions: 'E',
  energyConsumption: 'E',
  renewableEnergyPct: 'E',
  wasteGenerated: 'E',
  waterUse: 'E',
  totalHeadcount: 'S',
  genderDiversityPct: 'S',
  minorityRepPct: 'S',
  safetyIncidentRate: 'S',
  trainingHoursPerEmployee: 'S',
  livingWageCompliance: 'S',
  boardSize: 'G',
  boardGenderDiversityPct: 'G',
  independentDirectorsPct: 'G',
  ethicsPolicyWritten: 'G',
  dataPrivacyPolicy: 'G',
  whistleblowerMechanism: 'G',
};

export function getFieldValue(field: ExtractedField): number | boolean | string {
  if (typeof field.value === 'object' && field.value !== null && 'v' in field.value) {
    return field.value.v;
  }
  return field.value as number | boolean | string;
}
