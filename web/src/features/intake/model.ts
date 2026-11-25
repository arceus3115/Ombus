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
  routingAnswer?: string;
  officeAnswers: Record<string, Answers>;
};

type RoutingHint = Option & { office: string; topic?: string; followUpOnly?: boolean };
type Referral = {
  state: string;
  office: string;
  label: string;
  topics: Omit<RoutingHint, 'office'>[];
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

type CountyDirectory = { countySet: string; label: string; codes: Record<string, string> };
type Directory = {
  office: string;
  label: string;
  topics: string[];
  fields?: Field[];
  jurisdictions?: string[];
  counties?: Record<string, CountyDirectory | undefined>;
};
type Clarification = {
  state: string;
  topic: string;
  topicLabel: string;
  label: string;
  options: (Option & { route: string })[];
};

export const defaultState = 'MN';
const countySets: Record<string, Option[] | undefined> = countyConfig;
export const minnesotaCounties: Option[] = countyConfig.MN;
const profiles = new Map((stateConfig as StateProfile[]).map((state) => [state.code, state]));
const sharedTopics: Option[] = routingConfig.topics;
const referrals: Referral[] = routingConfig.referrals;
const directories = routingConfig.directories as Directory[];
const clarifications: Clarification[] = routingConfig.clarifications;

export const states: StateProfile[] = routingConfig.jurisdictions.map(({ code, name }) => {
  const state = profiles.get(code);
  const offices = state?.offices.slice() ?? [{ value: 'triage', label: 'Staff routing review' }];
  const officeFields: StateProfile['officeFields'] = state
    ? { ...state.officeFields }
    : { triage: routingConfig.triageFields as Field[] };
  const hints = new Map(state?.routingHints.map((hint) => [hint.value, hint]));
  for (const referral of referrals.filter((entry) => entry.state === code)) {
    offices.push({ value: referral.office, label: referral.label });
    officeFields[referral.office] = referral.fields;
    for (const topic of referral.topics)
      hints.set(topic.value, { ...topic, office: referral.office });
  }

  let countySet = state?.countySet;
  let locationFields = state?.locationFields.slice();
  for (const directory of directories) {
    if (directory.jurisdictions?.length && !directory.jurisdictions.includes(code)) continue;
    const topics = directory.topics.filter((topic) => !hints.has(topic));
    if (!topics.length) continue;
    offices.push({
      value: directory.office,
      label: directory.label.replaceAll('{state}', name).replaceAll('{stateCode}', code),
    });
    officeFields[directory.office] = directory.fields;
    for (const topic of topics)
      hints.set(topic, { value: topic, label: '', office: directory.office });
    const countyDirectory = directory.counties?.[code];
    if (countyDirectory && !locationFields?.some((field) => field.type === 'county')) {
      countySet = countyDirectory.countySet;
      locationFields = [...(locationFields ?? []), routingConfig.countyField as Field];
    }
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
    locationFields: (locationFields ?? (routingConfig.locationFields as Field[])).map((field) =>
      field.type === 'county'
        ? { ...field, options: field.options ?? countySets[countySet ?? ''] ?? [] }
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

export function routingQuestion(topic?: string, code?: string) {
  return clarifications.find((question) => question.state === code && question.topic === topic);
}

export function routingTopics(code: string): Option[] {
  return stateProfile(code)
    .routingHints.filter((hint) => !hint.followUpOnly)
    .map(({ value, label }) => ({
      value,
      label: routingQuestion(value, code)?.topicLabel ?? label,
    }));
}

export function suggestRoute(value: string | undefined, code?: string) {
  return value ? stateProfile(code).routingHints.find((hint) => hint.value === value) : undefined;
}

export function resolveRoute(topic?: string, code?: string, answer?: string) {
  const question = routingQuestion(topic, code);
  if (question) {
    const route = question.options.find((option) => option.value === answer)?.route;
    return suggestRoute(route, code);
  }
  const hint = suggestRoute(topic, code);
  return answer || hint?.followUpOnly ? undefined : hint;
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
  const hint = resolveRoute(draft.routingHint, state.code, draft.routingAnswer);
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
    routingHint: draft.routingHint,
    ...(draft.routingAnswer && { routingAnswer: draft.routingAnswer }),
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
