import { node } from './dom.ts';

const flagLabels: Record<string, string> = {
  immediate_safety_concern: 'Immediate safety concern',
  time_sensitive: 'Time-sensitive',
  routing_review: 'Confirm office',
  facility_notice_review: 'Facility notice',
  incident_report_review: 'Incident report',
  appeal_review: 'Appeal review',
};

export function displayFlags(flags: string[]): HTMLUListElement {
  const list = node('ul', 'case-flags');
  list.setAttribute('aria-label', 'Staff review flags');
  list.append(...flags.map((flag) => node('li', '', flagLabels[flag] ?? flag)));
  return list;
}
