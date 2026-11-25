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
  destination: string;
};
export type RoutingOutcome = {
  kind: 'office' | 'program_directory' | 'staff_review' | 'staff_review_with_resource';
  destination: string;
  message: string;
  contact?: {
    name: string;
    url: string;
    linkLabel: string;
    sourceUrl: string;
    publisher?: string;
    reviewedOn?: string;
  };
};
export type RoutingPreview = { routing: RoutingOutcome; reviewFlags: string[] };
export type CaseDetails = {
  record: CaseRecord;
  routing: RoutingOutcome;
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
      draft?: { subject: string; body: string };
    };
  };
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'The request could not be completed.');
  return payload as T;
}

function postIntake<T>(path: string, input: CaseInput) {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
export const previewRouting = (input: CaseInput) =>
  postIntake<RoutingPreview>('/api/routing/preview', input);
export const saveCase = (input: CaseInput) => postIntake<CaseDetails>('/api/cases', input);
export const listCases = () => request<CaseSummary[]>('/api/cases');
export const getCase = (id: string) => request<CaseDetails>(`/api/cases/${encodeURIComponent(id)}`);

export function downloadCase(record: CaseRecord): void {
  downloadJSON(`ombus-intake-${record.id}.json`, record);
}

export function downloadJSON(name: string, value: unknown): void {
  downloadFile(name, JSON.stringify(value, null, 2) + '\n', 'application/json');
}

export function downloadFile(name: string, value: string, type = 'text/plain'): void {
  const file = new Blob([value], { type });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
