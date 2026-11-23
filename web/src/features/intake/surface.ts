import { byId, node } from '../../components/dom.ts';
import { createGroup, setError, validationMessage, type FieldGroup, type FieldRow } from '../../components/fields.ts';
import { reviewGroup } from '../../components/review.ts';
import { downloadCase, saveCase, type CaseRecord } from '../../api.ts';
import { concernFields, contactFields, offices, officeFields, prepareIntake, readFields, routingHints, suggestRoute, type Field, type IntakeDraft, type OfficeChoice } from './model.ts';
import { reviewEntries } from './review-entries.ts';

export function mountIntake(): void {
  const form = byId<HTMLFormElement>('intake-form');
  const panels = [...form.querySelectorAll<HTMLElement>('[data-step]')];
  const steps = [...byId('steps').children];
  const summary = byId('error-summary');
  const continueButton = byId<HTMLButtonElement>('continue');
  const officeChoice: Field = { key: 'office', label: 'Office for staff review', type: 'radio', required: true, options: offices };
  const routingHint: Field = { key: 'routingHint', label: 'What is the concern mainly about?', type: 'select', options: routingHints };
  let draft: IntakeDraft;
  let requestId: string;
  let step = 0;
  let record: CaseRecord | undefined;
  let concernGroup: FieldGroup;
  let contactGroup: FieldGroup;
  let routingHintGroup: FieldGroup;
  let officeChoiceGroup: FieldGroup;
  let officeGroup: FieldGroup;

  function bindOffice() {
    const office = offices.find((option) => option.value === draft.routing.office);
    byId('office-details').hidden = !office;
    byId('office-details-heading').textContent = office?.label ?? '';
    byId('office-choice').firstElementChild?.classList.add('office-choice');
    byId<HTMLDetailsElement>('office-more').open = false;
    officeGroup = createGroup(
      byId('office-fields'), officeFields[draft.routing.office as OfficeChoice] ?? [], draft.officeAnswers[draft.routing.office] ?? {}, 'details',
      updateVisibility, byId('office-extra-fields'),
    );
    updateVisibility();
  }

  function updateSuggestion() {
    const hint = suggestRoute(draft.routing.routingHint);
    const office = offices.find((item) => item.value === hint?.office);
    byId('routing-suggestion').hidden = !office;
    byId('routing-suggestion-text').textContent = office ? `Suggested route: ${office.label}` : '';
  }

  function updateVisibility() {
    for (const [index, group] of [concernGroup, contactGroup, routingHintGroup, officeChoiceGroup, officeGroup].entries()) {
      if (!group) continue;
      const { visible } = readFields(group.fields, group.values);
      const groupStep = Math.min(index, 2);
      if (group.disclosure) group.disclosure.hidden = !visible.some((field) => field.additional);
      for (const row of group.rows) {
        const show = visible.includes(row.field);
        row.element.hidden = !show;
        for (const control of row.controls) control.disabled = !show || step !== groupStep;
        if (!show) setError(row, '');
      }
    }

    byId('emergency-guidance').textContent = draft.concern.urgency === 'immediate_danger'
      ? 'Call 911 now if someone is in immediate danger.' : '';
    const incidentType = readFields(officeGroup?.fields ?? [], officeGroup?.values ?? {}).answers.incidentType;
    byId('incident-guidance').hidden = draft.routing.office !== 'omhdd' || !['death', 'serious_injury'].includes(incidentType);
  }

  function validateStep() {
    const entries = [concernGroup.rows, contactGroup.rows, [...routingHintGroup.rows, ...officeChoiceGroup.rows, ...officeGroup.rows]][step];
    const invalidRows: FieldRow[] = [];
    for (const row of entries) {
      if (row.element.hidden) continue;
      const message = validationMessage(row);
      setError(row, message);
      if (message) invalidRows.push(row);
    }
    if (!invalidRows.length) return true;
    summary.textContent = invalidRows.length === 1 ? 'Check the highlighted field.' : 'Check the highlighted fields.';
    const disclosure = invalidRows[0].element.closest('details');
    if (disclosure) disclosure.open = true;
    invalidRows[0].controls[0].focus();
    return false;
  }

  function moveTo(nextStep: number, focus = true) {
    step = nextStep;
    panels.forEach((panel, index) => { panel.hidden = index !== step; });
    steps.forEach((item, index) => {
      if (index === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.classList.toggle('done', index < step);
      if (item.firstElementChild) item.firstElementChild.textContent = index < step ? '✓' : String(index + 1);
    });
    summary.textContent = '';
    byId('back').hidden = step === 0;
    const complete = step === panels.length;
    byId('workflow-actions').hidden = complete;
    byId('intake-complete').hidden = !complete;
    byId('complete-actions').hidden = !complete;
    continueButton.replaceChildren(step === 3 ? 'Save intake' : 'Continue');
    const arrow = node('span', '', step === 3 ? '✓' : '→');
    arrow.setAttribute('aria-hidden', 'true');
    continueButton.append(arrow);
    updateVisibility();
    if (step === 3) renderReview();
    if (focus) {
      (panels[step]?.querySelector('h2') ?? byId('complete-heading')).focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  function renderReview() {
    const review = byId('intake-review');
    review.replaceChildren(
      reviewGroup('Concern', reviewEntries(concernGroup.fields, concernGroup.values), () => moveTo(0)),
      reviewGroup('Contact and receipt', reviewEntries(contactGroup.fields, contactGroup.values), () => moveTo(1)),
      reviewGroup('Office details', [
        ...reviewEntries(routingHintGroup.fields, routingHintGroup.values),
        ...reviewEntries(officeChoiceGroup.fields, officeChoiceGroup.values),
        ...reviewEntries(officeGroup.fields, officeGroup.values),
      ], () => moveTo(2)),
    );
  }

  function startIntake(focus: boolean) {
    draft = {
      concern: {}, contact: {}, routing: {},
      officeAnswers: Object.fromEntries(offices.map(({ value }) => [value, {}])),
    };
    record = undefined;
    requestId = crypto.randomUUID();
    byId('intake-review').replaceChildren();
    byId('record-reference').textContent = '';
    concernGroup = createGroup(byId('concern-fields'), concernFields, draft.concern, 'concern');
    byId<HTMLDetailsElement>('contact-more').open = false;
    contactGroup = createGroup(byId('contact-fields'), contactFields, draft.contact, 'contact', updateVisibility, byId('contact-extra-fields'));
    routingHintGroup = createGroup(byId('routing-hint'), [routingHint], draft.routing, 'route', updateSuggestion);
    officeChoiceGroup = createGroup(byId('office-choice'), [officeChoice], draft.routing, 'route', bindOffice);
    updateSuggestion();
    bindOffice();
    byId('intake-workspace').hidden = false;
    moveTo(0, focus);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (step === 3 && !continueButton.disabled) {
      continueButton.disabled = true;
      summary.textContent = '';
      try {
        const saved = await saveCase(prepareIntake(draft, requestId));
        record = saved.record;
        byId('record-reference').textContent = `Case ID ${record.id}`;
        byId<HTMLAnchorElement>('open-case').href = `/cases?id=${record.id}`;
        moveTo(4);
      } catch (error) {
        summary.textContent = error instanceof Error ? error.message : 'Ombus could not save this intake.';
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
  byId('back').addEventListener('click', () => { if (!continueButton.disabled) moveTo(step - 1); });
  byId('use-suggestion').addEventListener('click', () => {
    const hint = suggestRoute(draft.routing.routingHint);
    if (!hint) return;
    const { office, topic } = hint;
    if (topic) draft.officeAnswers[office].topic = topic;
    const control = byId<HTMLInputElement>(`route-office-${office}`);
    if (control.checked) bindOffice();
    else control.click();
    control.focus();
  });
  byId('download-record').addEventListener('click', () => { if (record) downloadCase(record); });
  byId('new-intake').addEventListener('click', () => startIntake(true));
  startIntake(false);
}
