import config from '../../../../config/intake.json' with { type: 'json' };
import countyConfig from '../../../../config/counties.json' with { type: 'json' };
import routingConfig from '../../../../config/routing.json' with { type: 'json' };
import stateConfig from '../../../../config/states.json' with { type: 'json' };
import type { CaseInput } from '../../api.ts';

export type Answers = Record<string, string | undefined>;
export type Option = { value: string; label: string; description?: string };
export type Field = {
  key: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'select'
    | 'radio'
    | 'date'
    | 'datetime-local'
    | 'tel'
    | 'email'
    | 'county';
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
  routingHint?: string;
  officeAnswers: Record<string, Answers>;
};

type RoutingHint = Option & { office: string; topic?: string };
type Referral = {
  state: string;
  office: string;
  label: string;
  topics: (Option & { topic?: string })[];
  fields?: Field[];
};
type StateProfile = {
  code: string;
  name: string;
  timeZone?: string;
  countySet?: string;
  locationFields: Field[];
  offices: Option[];
  routingHints: RoutingHint[];
  officeFields: Record<string, Field[] | undefined>;
};

export const defaultState = 'MN';
const countySets: Record<string, Option[] | undefined> = countyConfig;
export const minnesotaCounties: Option[] = countyConfig.MN;
const longTermCareOffice = 'long_term_care';
const profiles = new Map((stateConfig as StateProfile[]).map((state) => [state.code, state]));
const sharedTopics: Option[] = routingConfig.topics;
const referrals: Referral[] = routingConfig.referrals;
const countyDirectories: Record<
  string,
  { countySet: string; codes: Record<string, string> } | undefined
> = routingConfig.longTermCareByCounty;

export const states: StateProfile[] = routingConfig.jurisdictions.map(({ code, name }) => {
  const state = profiles.get(code);
  const directory = countyDirectories[code];
  const offices = state?.offices.slice() ?? [
    { value: longTermCareOffice, label: `${name} Long-Term Care Ombudsman` },
    { value: 'triage', label: 'Staff routing review' },
  ];
  const officeFields: StateProfile['officeFields'] = state
    ? { ...state.officeFields }
    : {
        [longTermCareOffice]: routingConfig.longTermCareFields as Field[],
        triage: routingConfig.triageFields as Field[],
      };
  const hints = new Map(
    (
      state?.routingHints ?? [
        { value: 'resident_rights', label: '', office: longTermCareOffice },
        { value: 'facility_notice', label: '', office: longTermCareOffice },
      ]
    ).map((hint) => [hint.value, hint]),
  );
  for (const referral of referrals.filter((entry) => entry.state === code)) {
    offices.push({ value: referral.office, label: referral.label });
    officeFields[referral.office] = referral.fields;
    for (const topic of referral.topics)
      hints.set(topic.value, { ...topic, office: referral.office });
  }
  const routingHints = sharedTopics.map((topic) => {
    const hint = hints.get(topic.value);
    hints.delete(topic.value);
    return { ...topic, office: 'triage', ...hint, label: hint?.label || topic.label };
  });
  routingHints.push(...hints.values());
  return {
    ...state,
    code,
    name,
    offices,
    officeFields,
    routingHints: routingHints.sort(
      (a, b) => Number(a.value === 'unsure') - Number(b.value === 'unsure'),
    ),
    locationFields: (
      state?.locationFields ??
      ((directory ? [routingConfig.countyField] : routingConfig.locationFields) as Field[])
    ).map((field) =>
      field.type === 'county'
        ? {
            ...field,
            options:
              field.options ?? countySets[state?.countySet ?? directory?.countySet ?? ''] ?? [],
          }
        : field,
    ),
  };
});
export function stateProfile(code = defaultState) {
  const state = states.find((profile) => profile.code === code);
  if (!state) throw new Error('This state is not configured for intake.');
  return state;
}

export function concernQuestions(code: string | null = defaultState): Field[] {
  const fields = config.concernFields as Field[];
  return code ? [fields[0], ...stateProfile(code).locationFields, ...fields.slice(1)] : fields;
}

export const contactFields = config.contactFields as Field[];

export function suggestRoute(value: string | undefined, code?: string) {
  return value ? stateProfile(code).routingHints.find((hint) => hint.value === value) : undefined;
}

export function readFields(fields: readonly Field[], values: Answers) {
  const answers: Answers = {};
  const visible: Field[] = [];
  for (const field of fields) {
    if (
      field.when &&
      !Object.entries(field.when).every(([key, options]) => options.includes(answers[key] ?? ''))
    ) {
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
  if (!draft.stateCode) throw new Error('Choose the state where the issue happened.');
  const state = stateProfile(draft.stateCode);
  const hint = suggestRoute(draft.routingHint, state.code);
  if (!hint) throw new Error('Choose what your concern is about.');
  const { county: countyCode, ...concern } = readFields(
    concernQuestions(state.code),
    draft.concern,
  ).answers;
  if (countyCode) {
    concern.county = state.locationFields
      .find((field) => field.key === 'county')
      ?.options?.find((county) => county.value === countyCode)?.label;
    concern.countyCode = countyCode;
  }
  const contactAndReceipt = readFields(contactFields, draft.contact).answers;
  const { receivedVia, receivedAtCentral, ...contact } = contactAndReceipt;
  const details = readFields(state.officeFields[hint.office] ?? [], {
    ...draft.officeAnswers[hint.value],
    topic: hint.topic,
  }).answers;
  return {
    schemaVersion: routingConfig.schemaVersion,
    id,
    stateCode: state.code,
    requestedOffice: hint.office === 'triage' ? null : hint.office,
    routingHint: hint.value,
    receipt: {
      receivedVia,
      receivedAtCentral,
      timeZone: receivedAtCentral ? state.timeZone : undefined,
    },
    concern,
    contact,
    officeDetails: details,
  };
}

export function destinationName(
  input: Pick<CaseInput, 'stateCode' | 'requestedOffice'> & { concern?: Answers },
  flags: string[],
) {
  if (flags.includes('routing_review')) return 'Staff routing review';
  const county = input.concern?.county;
  const countyCode = input.concern?.countyCode;
  if (
    input.requestedOffice === longTermCareOffice &&
    input.stateCode &&
    county &&
    countyCode &&
    countyDirectories[input.stateCode]?.codes[countyCode]
  ) {
    return `${county} County Long-Term Care Ombudsman`;
  }
  return (
    stateProfile(input.stateCode).offices.find((office) => office.value === input.requestedOffice)
      ?.label ?? 'Staff routing review'
  );
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
  return Array.from(
    new Set(
      rules
        .filter(
          (rule) =>
            (!rule.state || rule.state === state.code) &&
            (!rule.office || rule.office === office) &&
            (!rule.differentSuggestedOffice || (suggested && suggested !== office)) &&
            match(rule.concern, input.concern) &&
            match(rule.details, input.officeDetails),
        )
        .map((rule) => rule.flag),
    ),
  );
}
