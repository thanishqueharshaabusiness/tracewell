import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { FIELD_LABELS, FIELD_UNITS } from '../lib/types';
import type { ExtractedField } from '../lib/types';

const ALL_FIELDS = [
  'scope1Emissions', 'scope2Emissions', 'energyConsumption', 'renewableEnergyPct',
  'wasteGenerated', 'waterUse', 'totalHeadcount', 'genderDiversityPct', 'minorityRepPct',
  'safetyIncidentRate', 'trainingHoursPerEmployee', 'livingWageCompliance', 'boardSize',
  'boardGenderDiversityPct', 'independentDirectorsPct', 'ethicsPolicyWritten',
  'dataPrivacyPolicy', 'whistleblowerMechanism',
];

const BOOLEAN_FIELDS = new Set(['livingWageCompliance', 'ethicsPolicyWritten', 'dataPrivacyPolicy', 'whistleblowerMechanism']);

export default function Wizard() {
  const { company } = useApp();
  const [coveredFields, setCoveredFields] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!company) return;
    api.fields.listByCompany(company.id).then((data) => {
      const covered = new Set((data as ExtractedField[]).map((f) => f.field_key));
      setCoveredFields(covered);
    });
  }, [company]);

  const missingFields = ALL_FIELDS.filter((k) => !coveredFields.has(k));

  const save = async (fieldKey: string) => {
    if (!company || !values[fieldKey]) return;
    setSaving((s) => ({ ...s, [fieldKey]: true }));
    const val = BOOLEAN_FIELDS.has(fieldKey)
      ? values[fieldKey] === 'yes'
      : Number(values[fieldKey]);
    await api.fields.addManual({ companyId: company.id, fieldKey, value: val, unit: FIELD_UNITS[fieldKey] });
    setCoveredFields((s) => new Set([...s, fieldKey]));
    setSaving((s) => ({ ...s, [fieldKey]: false }));
  };

  if (!company) return <div className="max-w-xl mx-auto px-6 py-16 text-center"><Link to="/setup" className="btn-primary">Set up company</Link></div>;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-bark-brown mb-2">Manual data entry</h1>
        <p className="text-taupe">These fields have no document coverage. Entries here are marked as self-reported and carry lower confidence in your score.</p>
      </div>

      {missingFields.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-forest font-medium mb-2">All fields have document coverage!</p>
          <p className="text-taupe text-sm mb-6">No manual entry needed.</p>
          <Link to="/score" className="btn-primary">Calculate score →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {missingFields.map((fieldKey) => (
            <div key={fieldKey} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-bark-brown">{FIELD_LABELS[fieldKey]}</span>
                    <span className="badge-self-reported">Self-reported</span>
                  </div>
                  {FIELD_UNITS[fieldKey] && (
                    <p className="text-xs text-taupe">Unit: {FIELD_UNITS[fieldKey]}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {BOOLEAN_FIELDS.has(fieldKey) ? (
                    <select
                      className="input w-24 text-sm py-1"
                      value={values[fieldKey] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [fieldKey]: e.target.value }))}
                    >
                      <option value="">—</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      className="input w-32 text-sm py-1"
                      placeholder="Value"
                      value={values[fieldKey] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [fieldKey]: e.target.value }))}
                    />
                  )}
                  <button
                    onClick={() => save(fieldKey)}
                    disabled={!values[fieldKey] || saving[fieldKey]}
                    className="btn-secondary text-sm py-1 px-3"
                  >
                    {saving[fieldKey] ? '…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <Link to="/review" className="btn-secondary">← Back to review</Link>
        <Link to="/score" className="btn-primary">Calculate score →</Link>
      </div>
    </div>
  );
}
