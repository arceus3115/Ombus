import assert from 'node:assert/strict';
import test from 'node:test';
import { minnesotaCounties, searchCounties } from './counties.mjs';
import { concernFields, officeFields, prepareIntake, readFields, routingHints, suggestRoute } from './intake-fields.mjs';

test('a changed relationship or urgency excludes stale common answers', () => {
  const { answers } = readFields(concernFields, {
    relationship: 'systemic', subjectName: 'Sample person', urgency: 'routine', urgentDetails: 'Old deadline',
    summary: '  Sample concern  ',
  });
  assert.deepEqual(answers, { relationship: 'systemic', summary: 'Sample concern', urgency: 'routine' });
});

test('the county search and export use canonical Minnesota county names and codes', () => {
  assert.equal(new Set(minnesotaCounties.map(({ value }) => value)).size, 87);
  assert.deepEqual(searchCounties('St. Louis County'), [{ value: '27137', label: 'Saint Louis' }]);
  assert.deepEqual(searchCounties('27053'), [{ value: '27053', label: 'Hennepin' }]);
  assert.deepEqual(searchCounties('Imaginary county'), []);
  const draft = { contact: {}, office: 'triage', officeAnswers: {}, concern: { county: '27053' } };
  assert.deepEqual(prepareIntake(draft).concern, { county: 'Hennepin', countyCode: '27053' });
  draft.concern.county = 'Unknown county';
  assert.deepEqual(prepareIntake(draft).concern, {});
});

test('suggestions point to real office topics and preserve an explicit routing override', () => {
  for (const hint of routingHints.filter(({ topic }) => topic)) {
    const topics = officeFields[hint.office].find(({ key }) => key === 'topic').options;
    assert.ok(topics.some(({ value }) => value === hint.topic));
  }
  assert.equal(suggestRoute('unsure').office, 'triage');
  const record = prepareIntake({
    concern: {}, contact: {}, office: 'omhdd', routingHint: 'facility_notice', officeAnswers: {},
  });
  assert.equal(record.requestedOffice, 'omhdd');
  assert.equal(record.routingHint, 'facility_notice');
  assert.deepEqual(record.reviewFlags, ['routing_review']);
});

test('changing from phone to email excludes the number and voicemail preference', () => {
  const record = prepareIntake({
    concern: {}, office: 'triage', officeAnswers: {},
    contact: { contactMethod: 'email', email: 'sample@example.com', phone: '555-0100', voicemail: 'yes' },
  });
  assert.deepEqual(record.contact, { contactMethod: 'email', email: 'sample@example.com' });
  assert.equal(record.requestedOffice, null);
  assert.deepEqual(record.reviewFlags, ['routing_review']);
});

test('changing from a reportable incident hides its fields and nested follow-ups', () => {
  const { answers, visible } = readFields(officeFields.omhdd, {
    topic: 'civil_commitment', commitmentHelp: 'training', incidentType: 'manual_restraint',
    supportTeamReviewDate: '2026-11-03', alreadyReported: 'yes', agencyReference: 'SAMPLE-01',
  });
  assert.deepEqual(answers, { topic: 'civil_commitment', commitmentHelp: 'training' });
  assert.ok(!visible.some((field) => ['supportTeamReviewDate', 'agencyReference'].includes(field.key)));
});

test('a nursing facility notice excludes an assisted living termination reason', () => {
  const { answers } = readFields(officeFields.ooltc, {
    topic: 'notice', noticeType: 'nursing_discharge_transfer', terminationReason: 'nonpayment',
    residentReceiptDate: '2026-11-23',
  });
  assert.deepEqual(answers, {
    topic: 'notice', noticeType: 'nursing_discharge_transfer', residentReceiptDate: '2026-11-23',
  });
});

test('managed care appeal export retains the dates for the current stage and only the selected office', () => {
  const record = prepareIntake({
    concern: { urgency: 'routine' }, contact: { receivedAtCentral: '2026-11-23T10:00' }, office: 'managed_care',
    officeAnswers: {
      ooltc: { provider: 'Sample facility', topic: 'notice', residentReceiptDate: '2026-11-05' },
      managed_care: {
        topic: 'benefit_decision', appealStage: 'pending', actionNoticeDate: '2026-11-01',
        planAppealFiledDate: '2026-11-07', appealDecisionDate: '2026-11-18', urgentService: 'yes',
      },
    },
  });
  assert.deepEqual(record.officeDetails, {
    topic: 'benefit_decision', appealStage: 'pending', actionNoticeDate: '2026-11-01',
    planAppealFiledDate: '2026-11-07', urgentService: 'yes',
  });
  assert.equal(record.receipt.timeZone, 'America/Chicago');
  assert.deepEqual(record.reviewFlags, ['time_sensitive', 'appeal_review']);
});
