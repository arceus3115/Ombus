import config from '../../../../config/intake.json' with { type: 'json' };
import type { CaseInput, Office } from '../../api.ts';

export type Answers = Record<string, string | undefined>;
export type OfficeChoice = Office | 'triage';
export type Option = { value: string; label: string; description?: string };
export type Field = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'date' | 'datetime-local' | 'tel' | 'email' | 'county';
  required?: boolean;
  additional?: boolean;
  options?: Option[];
  max?: number;
  rows?: number;
  help?: string;
  when?: Record<string, string[]>;
};

export type IntakeDraft = {
  concern: Answers;
  contact: Answers;
  routing: Answers;
  officeAnswers: Record<string, Answers>;
};

export const offices: Option[] = config.offices;
export const routingHints = config.routingHints as (Option & { office: OfficeChoice; topic?: string })[];
export const concernFields = config.concernFields as Field[];
export const contactFields = config.contactFields as Field[];
export const officeFields = config.officeFields as Record<OfficeChoice, Field[]>;
export const minnesotaCounties = concernFields.find((field) => field.key === 'county')?.options ?? [];

export function suggestRoute(value: string | undefined) {
  return routingHints.find((hint) => hint.value === value);
}

export function readFields(fields: readonly Field[], values: Answers) {
  const answers: Answers = {};
  const visible: Field[] = [];
  for (const field of fields) {
    if (field.when && !Object.entries(field.when).every(([key, options]) => options.includes(answers[key] ?? ''))) {
      continue;
    }
    visible.push(field);
    const value = values[field.key]?.trim();
    if (value && (!field.options || field.options.some((option) => option.value === value))) {
      answers[field.key] = value;
    }
  }
  return { answers, visible };
}

export function prepareIntake(draft: IntakeDraft, id: string): CaseInput {
  const { county: countyCode, ...concern } = readFields(concernFields, draft.concern).answers;
  if (countyCode) {
    concern.county = minnesotaCounties.find((county) => county.value === countyCode)?.label;
    concern.countyCode = countyCode;
  }
  const contactAndReceipt = readFields(contactFields, draft.contact).answers;
  const { receivedVia, receivedAtCentral, ...contact } = contactAndReceipt;
  const details = readFields(officeFields[draft.routing.office as OfficeChoice] ?? [], draft.officeAnswers[draft.routing.office] ?? {}).answers;
  const hint = suggestRoute(draft.routing.routingHint);
  return {
    schemaVersion: config.version,
    id,
    requestedOffice: draft.routing.office === 'triage' || !draft.routing.office ? null : draft.routing.office as Office,
    ...(hint && { routingHint: hint.value }),
    receipt: { receivedVia, receivedAtCentral, timeZone: receivedAtCentral ? 'America/Chicago' : undefined },
    concern,
    contact,
    officeDetails: details,
  };
}
