import config from '../../../../config/intake.json' with { type: 'json' };
import countyConfig from '../../../../config/counties.json' with { type: 'json' };
import stateConfig from '../../../../config/states.json' with { type: 'json' };
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
  stateCode?: string;
  concern: Answers;
  contact: Answers;
  routing: Answers;
  officeAnswers: Record<string, Answers>;
};

type RoutingHint = Option & { office: OfficeChoice; topic?: string };
type StateProfile = {
  code: string;
  name: string;
  timeZone: string;
  countySet?: string;
  locationFields: Field[];
  offices: Option[];
  routingHints: RoutingHint[];
  officeFields: Record<string, Field[] | undefined>;
};

export const defaultState = 'MN';
const countySets: Record<string, Option[] | undefined> = countyConfig;
export const minnesotaCounties: Option[] = countyConfig.MN;
export const states = (stateConfig as StateProfile[]).map((state) => ({
  ...state,
  locationFields: state.locationFields.map((field) =>
    field.type === 'county' ? { ...field, options: field.options ?? countySets[state.countySet ?? ''] ?? [] } : field,
  ),
}));
export function stateProfile(code = defaultState) {
  const state = states.find((profile) => profile.code === code);
  if (!state) throw new Error('This state is not configured for intake.');
  return state;
}

export function concernQuestions(code?: string): Field[] {
  const fields = config.concernFields as Field[];
  return [fields[0], ...stateProfile(code).locationFields, ...fields.slice(1)];
}

export const contactFields = config.contactFields as Field[];

export function suggestRoute(value: string | undefined, code?: string) {
  return stateProfile(code).routingHints.find((hint) => hint.value === value);
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
  const state = stateProfile(draft.stateCode);
  const { county: countyCode, ...concern } = readFields(concernQuestions(state.code), draft.concern).answers;
  if (countyCode) {
    concern.county = state.locationFields.find((field) => field.key === 'county')?.options?.find((county) => county.value === countyCode)?.label;
    concern.countyCode = countyCode;
  }
  const contactAndReceipt = readFields(contactFields, draft.contact).answers;
  const { receivedVia, receivedAtCentral, ...contact } = contactAndReceipt;
  const details = readFields(state.officeFields[draft.routing.office ?? ''] ?? [], draft.officeAnswers[draft.routing.office ?? ''] ?? {}).answers;
  const hint = suggestRoute(draft.routing.routingHint, state.code);
  return {
    schemaVersion: config.version,
    id,
    stateCode: state.code,
    requestedOffice: draft.routing.office === 'triage' || !draft.routing.office ? null : draft.routing.office as Office,
    ...(hint && { routingHint: hint.value }),
    receipt: { receivedVia, receivedAtCentral, timeZone: receivedAtCentral ? state.timeZone : undefined },
    concern,
    contact,
    officeDetails: details,
  };
}

type ReviewRule = {
  flag: string;
  state?: string;
  office?: string;
  concern?: Record<string, string[]>;
  details?: Record<string, string[]>;
  differentSuggestedOffice?: boolean;
};

export function reviewFlags(input: CaseInput): string[] {
  const office = input.requestedOffice ?? 'triage';
  const state = stateProfile(input.stateCode);
  const suggested = suggestRoute(input.routingHint, state.code)?.office;
  const match = (criteria: Record<string, string[]> | undefined, values: Answers) =>
    Object.entries(criteria ?? {}).every(([key, options]) => options.includes(values[key] ?? ''));
  const rules: ReviewRule[] = config.reviewRules as ReviewRule[];
  return Array.from(new Set(rules.filter((rule) =>
    (!rule.state || rule.state === state.code) &&
    (!rule.office || rule.office === office) &&
    (!rule.differentSuggestedOffice || (suggested && suggested !== office)) &&
    match(rule.concern, input.concern) && match(rule.details, input.officeDetails),
  ).map((rule) => rule.flag)));
}
