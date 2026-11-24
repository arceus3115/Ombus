import {
  downloadCase,
  downloadJSON,
  getCase,
  listCases,
  type CaseDetails,
  type CaseSummary,
} from '../../api.ts';
import { byId, headingLink, node } from '../../components/dom.ts';
import { displayFlags } from '../../components/status.ts';
import { reviewGroup } from '../../components/review.ts';
import {
  concernQuestions,
  contactFields,
  destinationName,
  stateProfile,
  suggestRoute,
} from '../intake/model.ts';
import { reviewEntries } from '../intake/review-entries.ts';

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Chicago',
});

function title(heading: string, description: string) {
  const header = node('header', 'page-title');
  header.append(node('h1', '', heading), node('p', '', description));
  document.title = `${heading} | Ombus`;
  return header;
}

function card(className = 'card') {
  const panel = node('section', className);
  const body = node('div', 'card-body');
  panel.append(body);
  return { panel, body };
}

function caseList(cases: CaseSummary[]) {
  const { panel, body } = card();
  const toolbar = node('div', 'toolbar');
  const label = cases.length === 1 ? '1 saved intake' : `${cases.length} saved intakes`;
  toolbar.append(node('h2', '', label), headingLink('New intake', '/', 'button secondary'));
  body.append(toolbar);
  if (!cases.length) {
    body.append(node('p', 'case-empty', 'Saved intakes appear here.'));
    return panel;
  }

  const list = node('ul', 'case-list');
  for (const record of cases) {
    const item = node('li');
    const link = headingLink('', `/cases?id=${encodeURIComponent(record.id)}`, 'case-item');
    const information = node('div');
    information.append(
      node('strong', '', destinationName(record, record.reviewFlags)),
      node(
        'p',
        'case-description',
        [stateProfile(record.stateCode).name, record.topic, record.county]
          .filter(Boolean)
          .join(' · '),
      ),
    );
    if (record.reviewFlags.length) information.append(displayFlags(record.reviewFlags));
    const metadata = node('div', 'case-meta');
    const time = node('time', '', dateTime.format(new Date(record.createdAt)));
    time.dateTime = record.createdAt;
    metadata.append(time, node('p', '', 'Pending staff review'));
    link.append(information, metadata);
    item.append(link);
    list.append(item);
  }
  panel.append(list);
  return panel;
}

function caseDetail({ record, handoff }: CaseDetails) {
  const state = stateProfile(record.stateCode);
  const topic = suggestRoute(record.routingHint, state.code);
  const grid = node('div', 'case-grid');
  const saved = card();
  const heading = node('h2', 'case-card-heading', 'Intake record');
  saved.body.append(heading, node('p', 'record-reference', `Case ID ${record.id}`));
  if (record.reviewFlags.length) saved.body.append(displayFlags(record.reviewFlags));
  saved.body.append(
    reviewGroup('Concern', [
      ['State', state.name],
      ...reviewEntries(concernQuestions(state.code), {
        ...record.concern,
        county: record.concern.countyCode,
      }),
    ]),
    reviewGroup(
      'Contact and receipt',
      reviewEntries(contactFields, { ...record.contact, ...record.receipt }),
    ),
    reviewGroup('Topic and destination', [
      ...(topic ? [['Topic', topic.label] as [string, string]] : []),
      [
        'Destination',
        handoff.output?.format === 'public_referral'
          ? handoff.title
          : destinationName(record, record.reviewFlags),
      ],
      ...reviewEntries(
        state.officeFields[record.requestedOffice ?? 'triage'] ?? [],
        record.officeDetails,
        topic?.topic === record.officeDetails.topic ? 'topic' : undefined,
      ),
    ]),
  );
  const exportButton = node('button', 'button secondary', 'Download JSON');
  exportButton.type = 'button';
  exportButton.addEventListener('click', () => downloadCase(record));
  const actions = node('div', 'card-footer');
  actions.append(exportButton);
  saved.panel.append(actions);

  const delivery = card('card case-handoff');
  delivery.body.append(
    node('h2', 'case-card-heading', 'Handoff preview'),
    node('h3', '', handoff.title),
    node('p', 'case-description', handoff.channel),
    node('p', 'section-intro', handoff.instruction),
  );
  if (handoff.fields.length) {
    delivery.body.append(
      reviewGroup(
        'Available fields',
        handoff.fields.map(({ label, value }) => [label, value]),
      ),
    );
  }
  if (handoff.output && handoff.output.format !== 'public_referral') {
    const output = handoff.output;
    delivery.body.append(
      reviewGroup('Output schema', [
        ['Contract', `${output.id} v${output.version}`],
        ['Format', output.format.replaceAll('_', ' ')],
      ]),
    );
    if (output.missing.length)
      delivery.body.append(requirementsList('Information to confirm', output.missing));
    if (output.documents?.length)
      delivery.body.append(requirementsList('Documents to prepare', output.documents));
    if (Object.keys(output.schema.properties).length) {
      const button = node('button', 'button secondary', 'Download output preview');
      button.type = 'button';
      button.addEventListener('click', () =>
        downloadJSON(`ombus-handoff-${record.id}.json`, output),
      );
      delivery.body.append(button);
    }
  }
  if (handoff.sourceUrl) {
    const link = headingLink(
      'Find contact instructions (new tab)',
      handoff.sourceUrl,
      'button secondary',
    );
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    delivery.body.append(link);
  }
  grid.append(saved.panel, delivery.panel);
  return grid;
}

function requirementsList(title: string, items: string[]): HTMLElement {
  const section = node('section', 'review-group');
  const list = node('ul', 'output-requirements');
  list.append(...items.map((item) => node('li', '', item)));
  section.append(node('h3', '', title), list);
  return section;
}

export async function mountCases(): Promise<void> {
  const surface = byId('case-surface');
  const id = new URLSearchParams(location.search).get('id');
  const status = node('p', 'notice', 'Loading cases…');
  status.setAttribute('role', 'status');
  surface.hidden = false;
  surface.replaceChildren(
    title(id ? 'Case details' : 'Cases', 'Local intake records for staff review.'),
    status,
  );
  try {
    if (id) {
      const details = await getCase(id);
      surface.replaceChildren(
        headingLink('← All cases', '/cases', 'case-back'),
        title(
          destinationName(details.record, details.record.reviewFlags),
          `${stateProfile(details.record.stateCode).name} · Pending staff review`,
        ),
        caseDetail(details),
      );
    } else {
      const cases = await listCases();
      status.replaceWith(caseList(cases));
    }
  } catch (error) {
    status.classList.add('urgent');
    status.textContent = error instanceof Error ? error.message : 'Ombus could not load the cases.';
    if (id) surface.append(headingLink('Return to cases', '/cases', 'case-back'));
  }
}
