export interface CompanyProfile {
  id: string;
  userId: string;
  name: string;
  industry: string;
  size: 'micro' | 'small' | 'medium';
  country: string;
  createdAt: Date;
}

export interface UploadedDocument {
  id: string;
  companyId: string;
  filename: string;
  fileType: 'pdf' | 'xlsx' | 'csv' | 'image';
  storageUrl: string;
  uploadedAt: Date;
  parseStatus: 'pending' | 'processing' | 'parsed' | 'failed';
}

export interface ExtractedField {
  id: string;
  documentId: string;
  companyId: string;
  fieldKey: string;
  value: number | boolean | string;
  unit: string | null;
  extractedQuote: string;
  pageReference: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'document_parsed' | 'self_reported';
  userConfirmed: boolean;
  flaggedDiscrepancy: boolean;
  createdAt: Date;
}

export interface ESGInputData {
  scope1Emissions: number | null;
  scope2Emissions: number | null;
  energyConsumption: number | null;
  renewableEnergyPct: number | null;
  wasteGenerated: number | null;
  waterUse: number | null;
  totalHeadcount: number;
  genderDiversityPct: number | null;
  minorityRepPct: number | null;
  safetyIncidentRate: number | null;
  trainingHoursPerEmployee: number | null;
  livingWageCompliance: boolean | null;
  boardSize: number | null;
  boardGenderDiversityPct: number | null;
  independentDirectorsPct: number | null;
  ethicsPolicyWritten: boolean;
  dataPrivacyPolicy: boolean;
  whistleblowerMechanism: boolean;
}

export interface ESGScoreResult {
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

export interface AgentRun {
  id: string;
  companyId: string;
  agentType: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  steps: { thought: string; tool: string; input: unknown; output: unknown }[];
  result: unknown;
  createdAt: Date;
  completedAt: Date | null;
}

export interface BenchmarkData {
  industry: string;
  size: string;
  scope1Emissions: { avg: number; min: number; max: number; source: string };
  scope2Emissions: { avg: number; min: number; max: number; source: string };
  energyConsumption: { avg: number; min: number; max: number; source: string };
  renewableEnergyPct: { avg: number; min: number; max: number; source: string };
  genderDiversityPct: { avg: number; min: number; max: number; source: string };
  boardGenderDiversityPct: { avg: number; min: number; max: number; source: string };
  safetyIncidentRate: { avg: number; min: number; max: number; source: string };
  trainingHoursPerEmployee: { avg: number; min: number; max: number; source: string };
}
