import assert from 'node:assert/strict';
import test from 'node:test';
import { searchCounties } from './counties.ts';
import {
  concernQuestions,
  minnesotaCounties,
  reviewFlags,
  prepareIntake,
  readFields,
  stateProfile,
  suggestRoute,
} from './model.ts';

const concernFields = concernQuestions();
const { officeFields, routingHints } = stateProfile();
const id = '00000000-0000-4000-8000-000000000001';

test('a changed relationship or urgency excludes stale common answers', () => {
  const { answers } = readFields(concernFields, {
    relationship: 'systemic',
    subjectName: 'Sample person',
    urgency: 'routine',
    urgentDetails: 'Old deadline',
    summary: '  Sample concern  ',
  });
  assert.deepEqual(answers, {
    relationship: 'systemic',
    summary: 'Sample concern',
    urgency: 'routine',
  });
});

test('the county search and export use canonical Minnesota county names and codes', () => {
  assert.equal(new Set(minnesotaCounties.map(({ value }) => value)).size, 87);
  assert.deepEqual(searchCounties('St. Louis County'), [{ value: '27137', label: 'Saint Louis' }]);
  assert.deepEqual(searchCounties('27053'), [{ value: '27053', label: 'Hennepin' }]);
  assert.deepEqual(searchCounties('Imaginary county'), []);
  const draft = {
    contact: {},
    routing: { office: 'triage' },
    officeAnswers: {},
    concern: { county: '27053' },
  };
  assert.deepEqual(prepareIntake(draft, id).concern, { county: 'Hennepin', countyCode: '27053' });
  draft.concern.county = 'Unknown county';
  assert.deepEqual(prepareIntake(draft, id).concern, {});
});

test('suggestions point to real office topics and preserve an explicit routing override', () => {
  for (const hint of routingHints.filter(({ topic }) => topic)) {
    const topics = officeFields[hint.office].find(({ key }) => key === 'topic')?.options ?? [];
    assert.ok(topics.some(({ value }) => value === hint.topic));
  }
  assert.equal(suggestRoute('unsure').office, 'triage');
  const record = prepareIntake(
    {
      concern: {},
      contact: {},
      routing: { office: 'omhdd', routingHint: 'facility_notice' },
      officeAnswers: {},
    },
    id,
  );
  assert.equal(record.requestedOffice, 'omhdd');
  assert.equal(record.routingHint, 'facility_notice');
  assert.deepEqual(reviewFlags(record), ['routing_review']);
});

test('changing from phone to email excludes the number and voicemail preference', () => {
  const record = prepareIntake(
    {
      concern: {},
      routing: { office: 'triage' },
      officeAnswers: {},
      contact: {
        contactMethod: 'email',
        email: 'sample@example.com',
        phone: '555-0100',
        voicemail: 'yes',
      },
    },
    id,
  );
  assert.deepEqual(record.contact, { contactMethod: 'email', email: 'sample@example.com' });
  assert.equal(record.requestedOffice, null);
  assert.deepEqual(reviewFlags(record), ['routing_review']);
});

test('changing from a reportable incident hides its fields and nested follow-ups', () => {
  const { answers, visible } = readFields(officeFields.omhdd, {
    topic: 'civil_commitment',
    commitmentHelp: 'training',
    incidentType: 'manual_restraint',
    supportTeamReviewDate: '2026-11-03',
    alreadyReported: 'yes',
    agencyReference: 'SAMPLE-01',
  });
  assert.deepEqual(answers, { topic: 'civil_commitment', commitmentHelp: 'training' });
  assert.ok(
    !visible.some((field) => ['supportTeamReviewDate', 'agencyReference'].includes(field.key)),
  );
});

test('a nursing facility notice excludes an assisted living termination reason', () => {
  const { answers } = readFields(officeFields.ooltc, {
    topic: 'notice',
    noticeType: 'nursing_discharge_transfer',
    terminationReason: 'nonpayment',
    residentReceiptDate: '2026-11-23',
  });
  assert.deepEqual(answers, {
    topic: 'notice',
    noticeType: 'nursing_discharge_transfer',
    residentReceiptDate: '2026-11-23',
  });
});

test('managed care appeal export retains the dates for the current stage and only the selected office', () => {
  const record = prepareIntake(
    {
      concern: { urgency: 'routine' },
      contact: { receivedAtCentral: '2026-11-23T10:00' },
      routing: { office: 'managed_care' },
      officeAnswers: {
        ooltc: { provider: 'Sample facility', topic: 'notice', residentReceiptDate: '2026-11-05' },
        managed_care: {
          topic: 'benefit_decision',
          appealStage: 'pending',
          actionNoticeDate: '2026-11-01',
          planAppealFiledDate: '2026-11-07',
          appealDecisionDate: '2026-11-18',
          urgentService: 'yes',
        },
      },
    },
    id,
  );
  assert.deepEqual(record.officeDetails, {
    topic: 'benefit_decision',
    appealStage: 'pending',
    actionNoticeDate: '2026-11-01',
    planAppealFiledDate: '2026-11-07',
    urgentService: 'yes',
  });
  assert.equal(record.receipt.timeZone, 'America/Chicago');
  assert.deepEqual(reviewFlags(record), ['time_sensitive', 'appeal_review']);
});

test('the same topic resolves to a different office in each state', () => {
  assert.equal(suggestRoute('resident_rights', 'MN')?.office, 'ooltc');
  assert.equal(suggestRoute('resident_rights', 'WI')?.office, 'wi_boaltc');
  assert.equal(suggestRoute('incident', 'WI'), undefined);
});

test('a Wisconsin intake uses Wisconsin location fields and flags an unsure age for review', () => {
  const input = prepareIntake(
    {
      stateCode: 'WI',
      routing: { office: 'wi_boaltc', routingHint: 'resident_rights' },
      concern: { county: '27053', serviceLocation: 'Milwaukee County' },
      contact: {},
      officeAnswers: { wi_boaltc: { topic: 'complaint', ageBand: 'unknown', setting: 'nursing' } },
    },
    id,
  );
  assert.equal(input.stateCode, 'WI');
  assert.deepEqual(input.concern, { serviceLocation: 'Milwaukee County' });
  assert.deepEqual(reviewFlags(input), ['routing_review']);
});
