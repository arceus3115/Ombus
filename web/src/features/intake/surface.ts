import { byId, node } from '../../components/dom.ts';
import {
  createGroup,
  setError,
  validationMessage,
  type FieldGroup,
  type FieldRow,
} from '../../components/fields.ts';
import { reviewGroup } from '../../components/review.ts';
import { displayFlags } from '../../components/status.ts';
import { downloadCase, saveCase, type CaseRecord } from '../../api.ts';
import {
  concernQuestions,
  contactFields,
  destinationName,
  prepareIntake,
  readFields,
  reviewFlags,
  stateProfile,
  states,
  suggestRoute,
  type Field,
  type IntakeDraft,
} from './model.ts';
import { reviewEntries } from './review-entries.ts';

export function mountIntake(): void {
  const form = byId<HTMLFormElement>('intake-form');
  const panels = [...form.querySelectorAll<HTMLElement>('[data-step]')];
  const steps = [...byId('steps').children];
  const summary = byId('error-summary');
  const continueButton = byId<HTMLButtonElement>('continue');
  const stateField: Field = {
    key: 'stateCode',
    label: 'State or territory where the issue happened',
    type: 'select',
    required: true,
    help: 'If the people involved are in different states, choose the state responsible for the services or agency in the concern.',
    options: states.map(({ code, name }) => ({ value: code, label: name })),
  };
  let draft: IntakeDraft;
  let requestId: string;
  let step = 0;
  let record: CaseRecord | undefined;
  let stateGroup: FieldGroup;
  let concernGroup: FieldGroup;
  let contactGroup: FieldGroup;
  let routingHintGroup: FieldGroup;
  let officeGroup: FieldGroup;

  function bindOffice() {
    const hint = suggestRoute(draft.routingHint, draft.stateCode);
    const fields = hint ? (stateProfile(draft.stateCode).officeFields[hint.office] ?? []) : [];
    const answers = hint ? (draft.officeAnswers[hint.value] ??= { topic: hint.topic }) : {};
    byId<HTMLDetailsElement>('office-more').open = false;
    officeGroup = createGroup(
      byId('office-fields'),
      fields,
      answers,
      'details',
      updateVisibility,
      byId('office-extra-fields'),
    );
    byId('office-details').hidden = fields.length === 0;
    updateVisibility();
  }

  function updateVisibility() {
    const hint = suggestRoute(draft.routingHint, draft.stateCode);
    const groups = [
      [stateGroup, 0],
      [concernGroup, 0],
      [contactGroup, 1],
      [routingHintGroup, 2],
      [officeGroup, 2],
    ] as const;
    for (const [group, groupStep] of groups) {
      if (!group) continue;
      const { visible } = readFields(group.fields, group.values);
      if (group.disclosure) group.disclosure.hidden = !visible.some((field) => field.additional);
      for (const row of group.rows) {
        const show =
          visible.includes(row.field) &&
          !(group === officeGroup && row.field.key === 'topic' && hint?.topic);
        row.element.hidden = !show;
        for (const control of row.controls) control.disabled = !show || step !== groupStep;
        if (!show) setError(row, '');
      }
    }

    byId('emergency-guidance').textContent =
      draft.concern.urgency === 'immediate_danger'
        ? 'Call 911 now if someone is in immediate danger.'
        : '';
    const incidentType = readFields(officeGroup?.fields ?? [], officeGroup?.values ?? {}).answers
      .incidentType;
    byId('incident-guidance').hidden =
      hint?.office !== 'omhdd' || !['death', 'serious_injury'].includes(incidentType ?? '');
  }

  function validateStep() {
    const entries = [
      [...stateGroup.rows, ...concernGroup.rows],
      contactGroup.rows,
      [...routingHintGroup.rows, ...officeGroup.rows],
    ][step];
    const invalidRows: FieldRow[] = [];
    for (const row of entries) {
      if (row.element.hidden) continue;
      const message = validationMessage(row);
      setError(row, message);
      if (message) invalidRows.push(row);
    }
    if (!invalidRows.length) return true;
    summary.textContent =
      invalidRows.length === 1 ? 'Check the highlighted field.' : 'Check the highlighted fields.';
    const disclosure = invalidRows[0].element.closest('details');
    if (disclosure) disclosure.open = true;
    invalidRows[0].controls[0].focus();
    return false;
  }

  function moveTo(nextStep: number, focus = true) {
    step = nextStep;
    panels.forEach((panel, index) => {
      panel.hidden = index !== step;
    });
    steps.forEach((item, index) => {
      if (index === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.classList.toggle('done', index < step);
      if (item.firstElementChild)
        item.firstElementChild.textContent = index < step ? '✓' : String(index + 1);
    });
    summary.textContent = '';
    byId('back').hidden = step === 0;
    const complete = step === panels.length;
    byId('workflow-actions').hidden = complete;
    byId('intake-complete').hidden = !complete;
    byId('complete-actions').hidden = !complete;
    continueButton.replaceChildren(step === 3 ? 'Submit to Ombus' : 'Continue');
    const arrow = node('span', '', step === 3 ? '✓' : '→');
    arrow.setAttribute('aria-hidden', 'true');
    continueButton.append(arrow);
    updateVisibility();
    if (step === 3) renderReview();
    if (focus) {
      (panels[step]?.querySelector('h2') ?? byId('complete-heading')).focus({
        preventScroll: true,
      });
      window.scrollTo(0, 0);
    }
  }

  function renderReview() {
    const review = byId('intake-review');
    const input = prepareIntake(draft, requestId);
    const flags = reviewFlags(input);
    const hint = suggestRoute(draft.routingHint, draft.stateCode);
    review.replaceChildren(
      reviewGroup(
        'Concern',
        [
          ['State', stateProfile(draft.stateCode).name],
          ...reviewEntries(concernGroup.fields, concernGroup.values),
        ],
        () => moveTo(0),
      ),
      reviewGroup(
        'Contact and receipt',
        reviewEntries(contactGroup.fields, contactGroup.values),
        () => moveTo(1),
      ),
      reviewGroup(
        'Topic and destination',
        [
          ...reviewEntries(routingHintGroup.fields, routingHintGroup.values),
          ['Destination', destinationName(input, flags)],
          ...reviewEntries(
            officeGroup.fields,
            officeGroup.values,
            hint?.topic ? 'topic' : undefined,
          ),
        ],
        () => moveTo(2),
      ),
    );
    if (flags.length) review.append(displayFlags(flags));
  }

  function buildStateQuestions() {
    const state = draft.stateCode ? stateProfile(draft.stateCode) : undefined;
    const routingHint: Field = {
      key: 'routingHint',
      label: 'What is the concern mainly about?',
      type: 'select',
      required: true,
      options: state?.routingHints ?? [],
    };
    concernGroup = createGroup(
      byId('concern-fields'),
      concernQuestions(state?.code ?? null),
      draft.concern,
      'concern',
      updateVisibility,
    );
    routingHintGroup = createGroup(
      byId('routing-hint'),
      [routingHint],
      { routingHint: draft.routingHint },
      'route',
      () => {
        draft.routingHint = routingHintGroup.values.routingHint;
        bindOffice();
      },
    );
    bindOffice();
  }

  function startIntake(focus: boolean) {
    draft = { concern: {}, contact: {}, officeAnswers: {} };
    record = undefined;
    requestId = crypto.randomUUID();
    byId('intake-review').replaceChildren();
    byId('record-reference').textContent = '';
    byId('contact-office').hidden = true;
    byId<HTMLDetailsElement>('contact-more').open = false;
    contactGroup = createGroup(
      byId('contact-fields'),
      contactFields,
      draft.contact,
      'contact',
      updateVisibility,
      byId('contact-extra-fields'),
    );
    stateGroup = createGroup(byId('state-field'), [stateField], {}, 'intake', () => {
      const nextState = stateGroup.values.stateCode || undefined;
      if (nextState === draft.stateCode) return;
      if (draft.stateCode) {
        for (const field of stateProfile(draft.stateCode).locationFields)
          delete draft.concern[field.key];
      }
      draft.stateCode = nextState;
      draft.routingHint = undefined;
      draft.officeAnswers = {};
      summary.textContent = '';
      buildStateQuestions();
    });
    buildStateQuestions();
    byId('intake-workspace').hidden = false;
    moveTo(0, focus);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (step === 3 && !continueButton.disabled) {
      continueButton.disabled = true;
      continueButton.textContent = 'Saving…';
      summary.textContent = '';
      try {
        const saved = await saveCase(prepareIntake(draft, requestId));
        record = saved.record;
        byId('record-reference').textContent = `Case ID ${record.id}`;
        byId('completed-destination').textContent =
          saved.handoff.output?.format === 'public_referral'
            ? saved.handoff.title
            : destinationName(record, record.reviewFlags);
        const officeLink = byId<HTMLAnchorElement>('contact-office');
        if (saved.handoff.sourceUrl) {
          officeLink.href = saved.handoff.sourceUrl;
          officeLink.hidden = false;
          byId('completion-message').textContent =
            'Ombus saved your intake for staff review. To reach the office directly, use its published contact instructions.';
        } else {
          byId('completion-message').textContent =
            'Ombus saved your intake so staff can find the right office.';
        }
        const openCase = byId<HTMLAnchorElement>('open-case');
        openCase.href = `/cases?id=${record.id}`;
        openCase.classList.toggle('primary', !saved.handoff.sourceUrl);
        openCase.classList.toggle('secondary', Boolean(saved.handoff.sourceUrl));
        moveTo(4);
      } catch (error) {
        continueButton.textContent = 'Submit to Ombus';
        summary.textContent =
          error instanceof Error ? error.message : 'Ombus could not save this intake.';
      } finally {
        continueButton.disabled = false;
      }
    } else if (step < 3 && validateStep()) {
      moveTo(step + 1);
    }
  });

  form.addEventListener('input', () => {
    if (step < 3 && !form.querySelector('[aria-invalid="true"]')) summary.textContent = '';
  });
  byId('back').addEventListener('click', () => {
    if (!continueButton.disabled) moveTo(step - 1);
  });
  byId('download-record').addEventListener('click', () => {
    if (record) downloadCase(record);
  });
  byId('new-intake').addEventListener('click', () => startIntake(true));
  startIntake(false);
}
