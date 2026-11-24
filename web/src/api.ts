export type Office = string;
export type Values = Record<string, string | undefined>;
export type CaseInput = {
  id: string;
  schemaVersion: number;
  stateCode?: string;
  requestedOffice: Office | null;
  routingHint?: string;
  routingAnswer?: string;
  receipt: Values;
  concern: Values;
  contact: Values;
  officeDetails: Values;
};
export type CaseRecord = CaseInput & {
  createdAt: string;
  status: 'pending_staff_review';
  reviewFlags: string[];
  outputContract?: { id: string; version: number };
};
export type CaseSummary = Pick<
  CaseRecord,
  'id' | 'createdAt' | 'requestedOffice' | 'status' | 'reviewFlags'
> & {
  topic?: string;
  county?: string;
  stateCode: string;
};
export type CaseDetails = {
  record: CaseRecord;
  handoff: {
    title: string;
    channel: string;
    instruction: string;
    sourceUrl?: string;
    fields: { label: string; value: string }[];
    output?: {
      id: string;
      version: number;
      format: string;
      schema: { properties: Record<string, unknown> };
      requiredAny?: { label: string; fields: string[] }[];
      values: Values;
      missing: string[];
      documents?: string[];
    };
  };
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'The request could not be completed.');
  return payload as T;
}

export const saveCase = (input: CaseInput) =>
  request<CaseDetails>('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
export const listCases = () => request<CaseSummary[]>('/api/cases');
export const getCase = (id: string) => request<CaseDetails>(`/api/cases/${encodeURIComponent(id)}`);

export function downloadCase(record: CaseRecord): void {
  downloadJSON(`ombus-intake-${record.id}.json`, record);
}

export function downloadJSON(name: string, value: unknown): void {
  const file = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
