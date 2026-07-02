import fs from 'fs';
import path from 'path';
import { callClaude } from './claude';
import { supabase } from './supabase';
import { ExtractedField } from '../types';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const EXTRACTION_SYSTEM_PROMPT = `You are an ESG data extraction specialist. You are given a document (utility bill, HR export, board minutes, or similar) and must extract only ESG metrics explicitly stated in the document.

Rules:
- Extract ONLY values directly present in the document. Never infer, calculate, or estimate a value that isn't explicitly stated.
- If the document states a value that requires no calculation (e.g., "326.5 tCO2e"), extract it directly.
- If the document provides raw inputs that the SAME document also resolves into a final figure, extract the stated total, not your own recalculation.
- For each value, return the exact quote/sentence it came from, and a page or sheet reference if available.
- If a field commonly required for ESG scoring is NOT present in this document, omit it entirely. Do not guess. Do not return zero or null as a stand-in for "not found" — just omit the key.
- Assign confidence: "high" if the value is explicitly labeled and unambiguous, "medium" if it requires minor interpretation (e.g., resolving units), "low" if there's any ambiguity in what the number refers to.

Valid fieldKey values (only use these exact strings):
scope1Emissions, scope2Emissions, energyConsumption, renewableEnergyPct, wasteGenerated, waterUse,
totalHeadcount, genderDiversityPct, minorityRepPct, safetyIncidentRate, trainingHoursPerEmployee,
livingWageCompliance, boardSize, boardGenderDiversityPct, independentDirectorsPct,
ethicsPolicyWritten, dataPrivacyPolicy, whistleblowerMechanism

Return JSON only, in this exact shape:
{
  "extractedFields": [
    {
      "fieldKey": "scope1Emissions",
      "value": 1945.3,
      "unit": "tCO2e",
      "extractedQuote": "Natural gas combustion (Scope 1, on-site): 1,945.3 tCO2e",
      "pageReference": "page 2",
      "confidence": "high"
    }
  ]
}`;

interface RawExtractedField {
  fieldKey: string;
  value: number | boolean | string;
  unit?: string;
  extractedQuote: string;
  pageReference?: string;
  confidence: 'high' | 'medium' | 'low';
}

function extractTextFromXLSX(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  let text = '';
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    text += `Sheet: ${sheetName}\n${csv}\n\n`;
  }
  return text;
}

function extractTextFromCSV(buffer: Buffer): string {
  const csvText = buffer.toString('utf-8');
  const parsed = Papa.parse(csvText, { header: true });
  return JSON.stringify(parsed.data, null, 2);
}

export async function parseDocument(
  filePath: string,
  fileType: string,
  documentId: string,
  companyId: string
): Promise<RawExtractedField[]> {
  const buffer = fs.readFileSync(filePath);
  let responseText: string;

  if (fileType === 'xlsx' || fileType === 'xls') {
    const text = extractTextFromXLSX(buffer);
    responseText = await callClaude(
      EXTRACTION_SYSTEM_PROMPT,
      `Extract ESG metrics from this spreadsheet data:\n\n${text}`
    );
  } else if (fileType === 'csv') {
    const text = extractTextFromCSV(buffer);
    responseText = await callClaude(
      EXTRACTION_SYSTEM_PROMPT,
      `Extract ESG metrics from this CSV data:\n\n${text}`
    );
  } else if (fileType === 'pdf') {
    const base64 = buffer.toString('base64');
    responseText = await callClaude(EXTRACTION_SYSTEM_PROMPT, [
      {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: base64,
        },
      },
      { type: 'text' as const, text: 'Extract all ESG metrics from this document.' },
    ]);
  } else {
    // Image
    const base64 = buffer.toString('base64');
    const mediaType: 'image/png' | 'image/jpeg' =
      fileType === 'jpg' || fileType === 'jpeg' ? 'image/jpeg' : 'image/png';
    responseText = await callClaude(EXTRACTION_SYSTEM_PROMPT, [
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType,
          data: base64,
        },
      },
      { type: 'text' as const, text: 'Extract all ESG metrics from this document.' },
    ]);
  }

  // Parse JSON from response (strip markdown code fences if present)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.extractedFields || [];
}

/**
 * Compares new fields against existing fields from OTHER documents in the SAME
 * upload session. On >5% variance, flags the existing field in the DB and returns
 * the set of conflicting fieldKeys so the caller can flag the new fields on insert.
 * Per PRD: both sides of a discrepancy get flagged; never silently overwrite.
 */
export async function detectDiscrepancies(
  companyId: string,
  newFields: RawExtractedField[],
  documentId: string
): Promise<Set<string>> {
  const conflicted = new Set<string>();

  // Limit comparison to documents in the same session as this document
  const { data: thisDoc } = await supabase
    .from('documents')
    .select('test_session_id')
    .eq('id', documentId)
    .single();

  let sessionDocIds: string[] = [];
  if (thisDoc?.test_session_id) {
    const { data: sessionDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('company_id', companyId)
      .eq('test_session_id', thisDoc.test_session_id)
      .neq('id', documentId);
    sessionDocIds = (sessionDocs || []).map((d) => d.id);
  }
  if (sessionDocIds.length === 0) return conflicted;

  for (const field of newFields) {
    const { data: existing } = await supabase
      .from('extracted_fields')
      .select('*')
      .eq('company_id', companyId)
      .eq('field_key', field.fieldKey)
      .in('document_id', sessionDocIds);

    if (!existing || existing.length === 0) continue;

    for (const existingField of existing) {
      const existingVal = typeof existingField.value === 'object'
        ? Number(existingField.value.v)
        : Number(existingField.value);
      const newVal = Number(field.value);

      if (isNaN(existingVal) || isNaN(newVal)) continue;

      const variance = Math.abs(existingVal - newVal) / Math.max(Math.abs(existingVal), Math.abs(newVal), 1e-9);
      if (variance > 0.05) {
        conflicted.add(field.fieldKey);
        await supabase
          .from('extracted_fields')
          .update({ flagged_discrepancy: true })
          .eq('id', existingField.id);
      }
    }
  }

  return conflicted;
}
