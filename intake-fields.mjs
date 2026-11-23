import { minnesotaCounties } from './counties.mjs';

const choice = (value, label, description) => ({ value, label, description });
const yesNoUnknown = [choice('yes', 'Yes'), choice('no', 'No'), choice('unknown', 'Not sure')];

export const offices = [
  choice('ooltc', 'Long-Term Care', 'Care, rights, discharge, or transfer in a nursing home, assisted living, or home care setting.'),
  choice('omhdd', 'Mental Health and Developmental Disabilities', 'Service or rights concerns, guardianship, civil commitment, or reportable incidents.'),
  choice('managed_care', 'Public Managed Health Care', 'Access, billing, grievances, or benefit decisions for a Medical Assistance or MinnesotaCare managed care plan.'),
  choice('triage', 'Staff review', 'Use when the right office is unclear or more than one office may be involved.'),
];

export const routingHints = [
  { value: 'facility_notice', label: 'Long-term care discharge, transfer, or termination notice', office: 'ooltc', topic: 'notice' },
  { value: 'resident_rights', label: 'Long-term care services or resident rights', office: 'ooltc', topic: 'complaint' },
  { value: 'monitoring', label: 'Electronic monitoring in a long-term care facility', office: 'ooltc', topic: 'monitoring' },
  { value: 'client_services', label: 'Mental health or disability services or client rights', office: 'omhdd', topic: 'client_services' },
  { value: 'guardian', label: 'Guardian actions involving a mental health or disability services client', office: 'omhdd', topic: 'guardian' },
  { value: 'incident', label: 'Death, serious injury, or emergency restraint involving a mental health or disability services client', office: 'omhdd', topic: 'incident' },
  { value: 'civil_commitment', label: 'Civil commitment', office: 'omhdd', topic: 'civil_commitment' },
  { value: 'access_or_billing', label: 'Public managed care coverage, access, or billing', office: 'managed_care', topic: 'access_or_billing' },
  { value: 'grievance', label: 'Public managed care quality or rights grievance', office: 'managed_care', topic: 'grievance' },
  { value: 'benefit_decision', label: 'Public managed care benefit denial, reduction, termination, or appeal', office: 'managed_care', topic: 'benefit_decision' },
  { value: 'unsure', label: 'Multiple concerns or not sure', office: 'triage' },
];

export function suggestRoute(value) {
  return routingHints.find((hint) => hint.value === value);
}

export const concernFields = [
  { key: 'relationship', label: 'Who is the concern about?', type: 'select', required: true, options: [
    choice('self', 'Me'), choice('family_or_friend', 'A family member or someone I support'),
    choice('representative', 'Someone I formally represent'), choice('provider', 'Someone my organization serves'),
    choice('systemic', 'Multiple people or a broader issue'), choice('other', 'Someone else'),
  ] },
  { key: 'county', label: 'Minnesota county', type: 'county', options: minnesotaCounties,
    help: 'Search and select the county where the person receives services, if known.' },
  { key: 'subjectName', label: 'Name of the person affected', type: 'text', max: 120,
    when: { relationship: ['family_or_friend', 'representative', 'provider', 'other'] } },
  { key: 'summary', label: 'What happened?', type: 'textarea', max: 3000, required: true,
    help: 'Describe the concern and include any important dates you know.' },
  { key: 'desiredOutcome', label: 'What would help resolve the concern?', type: 'textarea', max: 1500, rows: 2 },
  { key: 'urgency', label: 'Is there a safety concern or a deadline?', type: 'radio', required: true, options: [
    choice('immediate_danger', 'Someone is in immediate danger'), choice('time_sensitive', 'There is a deadline or urgent concern'),
    choice('routine', 'No known deadline or urgent concern'), choice('unknown', 'Not sure'),
  ] },
  { key: 'urgentDetails', label: 'What needs attention soon?', type: 'textarea', max: 1000, rows: 2,
    help: 'Include a known deadline or planned event, if applicable.', when: { urgency: ['time_sensitive'] } },
];

export const contactFields = [
  { key: 'contactMethod', label: 'Safe way to follow up', type: 'radio', required: true, options: [
    choice('phone', 'Phone'), choice('email', 'Email'), choice('none', 'No follow-up requested'),
    choice('unknown', 'Safe contact method unknown'),
  ] },
  { key: 'phone', label: 'Phone number', type: 'tel', max: 45, required: true, when: { contactMethod: ['phone'] } },
  { key: 'voicemail', label: 'Is it safe to leave a voicemail?', type: 'radio',
    options: [choice('yes', 'Yes'), choice('no', 'No')], when: { contactMethod: ['phone'] } },
  { key: 'email', label: 'Email address', type: 'email', max: 254, required: true, when: { contactMethod: ['email'] } },
  { key: 'receivedVia', label: 'How the concern came in', type: 'select', options: [
    choice('phone', 'Phone'), choice('email', 'Email'), choice('fax', 'Fax'), choice('mail', 'Mail'),
    choice('web', 'Online form'), choice('partner', 'Partner referral'), choice('in_person', 'In person'), choice('other', 'Other'),
  ] },
  { key: 'contactName', label: 'Reporter’s name', type: 'text', max: 120, additional: true },
  { key: 'contactNotes', label: 'Safe times or contact instructions', type: 'text', max: 240, additional: true,
    when: { contactMethod: ['phone', 'email'] } },
  { key: 'accessNeeds', label: 'Language or accessibility needs', type: 'text', max: 240, additional: true,
    help: 'For example, an interpreter, relay service, or accessible documents.' },
  { key: 'receivedAtCentral', label: 'When the concern came in', type: 'datetime-local', additional: true,
    help: 'Enter the date and time in Minnesota local time.' },
];

export const officeFields = {
  ooltc: [
    { key: 'topic', label: 'Long-term care issue', type: 'select', required: true, options: [
      choice('complaint', 'Care or resident rights complaint'), choice('notice', 'Discharge, transfer, relocation, or termination notice'),
      choice('monitoring', 'Electronic monitoring question or exception'), choice('information', 'Information or consultation'),
      choice('unknown', 'Not sure'),
    ] },
    { key: 'setting', label: 'Care setting', type: 'select', additional: true, options: [
      choice('nursing', 'Nursing facility'), choice('assisted_living', 'Assisted living'), choice('home_care', 'Home care'),
      choice('boarding', 'Boarding care home'), choice('other', 'Other long-term care setting'), choice('unknown', 'Not sure'),
    ] },
    { key: 'provider', label: 'Facility or provider name', type: 'text', max: 160 },
    { key: 'noticeType', label: 'Notice type', type: 'select', required: true, when: { topic: ['notice'] }, options: [
      choice('assisted_living_termination', 'Assisted living contract termination'), choice('emergency_relocation', 'Assisted living emergency relocation'),
      choice('nursing_discharge_transfer', 'Nursing facility discharge or transfer'), choice('closure', 'Facility closure'),
      choice('other', 'Other notice'), choice('unknown', 'Not sure'),
    ] },
    { key: 'terminationReason', label: 'Reason stated on the assisted living notice', type: 'radio',
      when: { noticeType: ['assisted_living_termination'] }, options: [
        choice('nonpayment', 'Nonpayment'), choice('contract_violation', 'Contract violation'),
        choice('expedited', 'Expedited termination for health or safety'), choice('other', 'Other reason'), choice('unknown', 'Not sure'),
      ] },
    { key: 'residentReceiptDate', label: 'Date the resident received the notice', type: 'date', when: { topic: ['notice'] } },
    { key: 'noticeEffectiveDate', label: 'Planned move or termination date', type: 'date', when: { topic: ['notice'] } },
    { key: 'residentWishes', label: 'What has the resident said they want?', type: 'textarea', max: 1500, rows: 2, additional: true,
      help: 'Record their reported wishes if known. Staff verify consent separately.', when: { topic: ['complaint', 'notice'] } },
    { key: 'monitoringException', label: 'Does this concern the 14-day exception for notifying the facility?', type: 'radio',
      options: yesNoUnknown, when: { topic: ['monitoring'] } },
  ],
  omhdd: [
    { key: 'topic', label: 'Mental health or disability issue', type: 'select', required: true, options: [
      choice('client_services', 'Service access, quality, or client rights'), choice('guardian', 'Guardian actions'),
      choice('incident', 'Death, serious injury, or emergency manual restraint'), choice('civil_commitment', 'Civil commitment information, advocacy, or training'),
      choice('systemic', 'Program-wide concern'), choice('unknown', 'Not sure'),
    ] },
    { key: 'serviceType', label: 'Service type', type: 'select', additional: true, options: [
      choice('mental_health', 'Mental health'), choice('developmental_disabilities', 'Developmental disabilities'),
      choice('substance_use', 'Substance use services'), choice('emotional_disturbance', 'Emotional disturbance services'),
      choice('other', 'Other'), choice('unknown', 'Not sure'),
    ] },
    { key: 'provider', label: 'Agency, facility, or program name', type: 'text', max: 160 },
    { key: 'incidentType', label: 'Incident type', type: 'radio', required: true, when: { topic: ['incident'] }, options: [
      choice('death', 'Death'), choice('serious_injury', 'Serious injury'), choice('manual_restraint', 'Emergency manual restraint'), choice('unknown', 'Not sure'),
    ] },
    { key: 'incidentAtCentral', label: 'When the incident occurred', type: 'datetime-local', help: 'Enter the date and time in Minnesota local time.', when: { topic: ['incident'] } },
    { key: 'supportTeamReviewDate', label: 'Date of expanded support team review', type: 'date', when: { incidentType: ['manual_restraint'] } },
    { key: 'alreadyReported', label: 'Has this incident already been reported to OMHDD?', type: 'radio', options: yesNoUnknown, when: { topic: ['incident'] } },
    { key: 'agencyReference', label: 'Existing OMHDD case number', type: 'text', max: 80, when: { alreadyReported: ['yes'] } },
    { key: 'commitmentHelp', label: 'Civil commitment assistance requested', type: 'radio', when: { topic: ['civil_commitment'] }, options: [
      choice('information', 'Information or referral'), choice('advocacy', 'Individual advocacy'), choice('training', 'Training'), choice('unknown', 'Not sure'),
    ] },
  ],
  managed_care: [
    { key: 'topic', label: 'Managed care issue', type: 'radio', required: true, options: [
      choice('access_or_billing', 'Coverage, access, or billing question'), choice('grievance', 'Quality of care, service, or rights grievance'),
      choice('benefit_decision', 'Benefit denial, reduction, termination, or appeal'), choice('unknown', 'Not sure'),
    ] },
    { key: 'program', label: 'Health coverage program', type: 'radio', options: [
      choice('medical_assistance', 'Medical Assistance'), choice('minnesotacare', 'MinnesotaCare'),
      choice('other', 'Other coverage'), choice('unknown', 'Not sure'),
    ] },
    { key: 'healthPlan', label: 'Managed health plan name', type: 'text', max: 160 },
    { key: 'contactedPlan', label: 'Has the enrollee contacted the health plan?', type: 'radio', options: yesNoUnknown, additional: true },
    { key: 'decisionType', label: 'Health plan action', type: 'radio', when: { topic: ['benefit_decision'] }, options: [
      choice('denial', 'Denied a service'), choice('reduction', 'Reduced or suspended services'),
      choice('termination', 'Ended services'), choice('payment_denial', 'Denied payment'), choice('unknown', 'Not sure'),
    ] },
    { key: 'appealStage', label: 'Where is the appeal now?', type: 'select', required: true, when: { topic: ['benefit_decision'] }, options: [
      choice('not_started', 'Plan appeal yet to be filed'), choice('pending', 'Plan appeal pending'),
      choice('decision', 'Plan appeal decision received'), choice('hearing', 'State fair hearing requested'), choice('unknown', 'Not sure'),
    ] },
    { key: 'actionNoticeDate', label: 'Date on the plan’s original action notice', type: 'date', when: { topic: ['benefit_decision'] } },
    { key: 'actionEffectiveDate', label: 'Date the plan change takes effect', type: 'date', when: { topic: ['benefit_decision'] } },
    { key: 'planAppealFiledDate', label: 'Date the plan appeal was filed', type: 'date', when: { appealStage: ['pending', 'decision', 'hearing'] } },
    { key: 'appealDecisionDate', label: 'Date on the plan’s appeal decision notice', type: 'date', when: { appealStage: ['decision', 'hearing'] } },
    { key: 'urgentService', label: 'Is the appeal about a service needed urgently?', type: 'radio', options: yesNoUnknown, when: { topic: ['benefit_decision'] } },
  ],
  triage: [
    { key: 'routingNotes', label: 'What may help staff identify the right office?', type: 'textarea', max: 1500,
      help: 'For example, the provider, a health plan, or any offices already contacted.' },
  ],
};

export function readFields(fields, values) {
  const answers = {};
  const visible = [];
  for (const field of fields) {
    if (field.when && !Object.entries(field.when).every(([key, options]) => options.includes(answers[key]))) {
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

export function prepareIntake(draft) {
  const { county: countyCode, ...concern } = readFields(concernFields, draft.concern).answers;
  if (countyCode) {
    concern.county = minnesotaCounties.find((county) => county.value === countyCode).label;
    concern.countyCode = countyCode;
  }
  const contactAndReceipt = readFields(contactFields, draft.contact).answers;
  const { receivedVia, receivedAtCentral, ...contact } = contactAndReceipt;
  const details = readFields(officeFields[draft.office] ?? [], draft.officeAnswers[draft.office] ?? {}).answers;
  const hint = suggestRoute(draft.routingHint);
  const reviewFlags = [];

  if (concern.urgency === 'immediate_danger') reviewFlags.push('immediate_safety_concern');
  if (concern.urgency === 'time_sensitive' || details.urgentService === 'yes') reviewFlags.push('time_sensitive');
  if (draft.office === 'triage' || details.program === 'other' || (hint && hint.office !== draft.office)) reviewFlags.push('routing_review');
  if (draft.office === 'ooltc' && details.topic === 'notice') reviewFlags.push('facility_notice_review');
  if (draft.office === 'omhdd' && details.topic === 'incident') reviewFlags.push('incident_report_review');
  if (draft.office === 'managed_care' && details.topic === 'benefit_decision') reviewFlags.push('appeal_review');

  return {
    schemaVersion: 1,
    status: 'pending_staff_review',
    requestedOffice: draft.office === 'triage' ? null : draft.office,
    ...(hint && { routingHint: hint.value }),
    receipt: { receivedVia, receivedAtCentral, timeZone: receivedAtCentral ? 'America/Chicago' : undefined },
    concern,
    contact,
    officeDetails: details,
    reviewFlags,
  };
}
