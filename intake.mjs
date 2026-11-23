import { concernFields, contactFields, offices, officeFields, prepareIntake, readFields, routingHints, suggestRoute } from './intake-fields.mjs';
import { searchCounties } from './counties.mjs';

const byId = (id) => document.getElementById(id);
const form = byId('intake-form');
const panels = [...form.querySelectorAll('[data-step]')];
const steps = [...byId('steps').children];
const summary = byId('error-summary');
const continueButton = byId('continue');
const officeChoice = { key: 'office', label: 'Office for staff review', type: 'radio', required: true, options: offices };
const routingHint = { key: 'routingHint', label: 'What is the concern mainly about?', type: 'select', options: routingHints };
const flagLabels = {
  immediate_safety_concern: 'Immediate safety concern',
  time_sensitive: 'Time-sensitive concern',
  routing_review: 'Confirm the appropriate office',
  facility_notice_review: 'Review the facility notice',
  incident_report_review: 'Review the incident report',
  appeal_review: 'Review the appeal stage and dates',
};

let draft;
let step;
let record;
let concernGroup;
let contactGroup;
let routingHintGroup;
let officeChoiceGroup;
let officeGroup;

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function bindCountyPicker(input, element, onValue) {
  const popup = node('div', 'county-popup');
  const list = node('ul', 'county-list');
  const status = node('p', 'county-status');
  list.id = `${input.id}-matches`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Minnesota counties');
  status.setAttribute('role', 'status');
  popup.hidden = true;
  popup.append(list, status);
  input.after(popup);
  element.classList.add('county-picker');
  input.placeholder = 'Search counties';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');

  let matches = [];
  let active = -1;

  function close() {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function choose(county) {
    input.value = county.label;
    input.dataset.selectedCounty = county.value;
    onValue(county.value);
    close();
  }

  function show() {
    matches = searchCounties(input.value);
    active = -1;
    input.removeAttribute('aria-activedescendant');
    list.replaceChildren(...matches.map((county, index) => {
      const item = node('li', '', county.label);
      item.id = `${list.id}-${county.value}`;
      item.dataset.match = index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(input.dataset.selectedCounty === county.value));
      return item;
    }));
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(Boolean(matches.length)));
    popup.hidden = false;
    status.textContent = matches.length ? '' : 'No Minnesota counties match your search.';
  }

  input.addEventListener('input', () => {
    delete input.dataset.selectedCounty;
    onValue('');
    show();
  });
  input.addEventListener('focus', () => { if (!input.dataset.selectedCounty) show(); });
  input.addEventListener('blur', close);
  list.addEventListener('mousedown', (event) => event.preventDefault());
  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-match]');
    if (item) choose(matches[Number(item.dataset.match)]);
  });
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && !popup.hidden) {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (popup.hidden) show();
      if (!matches.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const index = active < 0 ? (direction === 1 ? 0 : matches.length - 1) : active + direction;
      list.children[active]?.setAttribute('aria-selected', 'false');
      active = Math.max(0, Math.min(index, matches.length - 1));
      const item = list.children[active];
      item.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !popup.hidden && active >= 0) {
      event.preventDefault();
      choose(matches[active]);
    }
  });
}

function createField(field, prefix, value) {
  const isRadio = field.type === 'radio';
  const id = `${prefix}-${field.key}`;
  const element = node(isRadio ? 'fieldset' : 'div', 'field');
  const label = node(isRadio ? 'legend' : 'label', '', field.label);
  if (!isRadio) label.htmlFor = id;
  if (!field.required) label.append(node('span', 'optional', ' Optional'));
  element.append(label);

  const error = node('p', 'field-error');
  error.id = `${id}-error`;
  const helpIds = [];
  if (field.help) {
    const help = node('p', 'field-help', field.help);
    help.id = `${id}-help`;
    element.append(help);
    helpIds.push(help.id);
  }

  const controls = [];
  if (isRadio) {
    const choices = node('div', 'choices');
    for (const option of field.options) {
      const choice = node('div', 'choice');
      const input = node('input');
      input.type = 'radio';
      input.id = `${id}-${option.value}`;
      input.value = option.value;
      input.checked = option.value === value;
      const optionLabel = node('label');
      optionLabel.htmlFor = input.id;
      optionLabel.append(node('span', 'choice-title', option.label));
      if (option.description) optionLabel.append(node('span', 'choice-description', option.description));
      choice.append(input, optionLabel);
      choices.append(choice);
      controls.push(input);
    }
    element.append(choices);
  } else {
    const controlType = ['select', 'textarea'].includes(field.type) ? field.type : 'input';
    const input = node(controlType);
    input.id = id;
    if (controlType === 'input') input.type = field.type === 'county' ? 'text' : field.type;
    if (controlType === 'textarea') input.rows = field.rows ?? 3;
    if (field.max) input.maxLength = field.max;
    if (controlType === 'select') {
      input.add(new Option('Select an option', ''));
      for (const option of field.options) input.add(new Option(option.label, option.value));
    }
    input.value = value ?? '';
    controls.push(input);
    element.append(input);
  }

  for (const control of controls) {
    control.name = id;
    control.required = Boolean(field.required);
    if (helpIds.length) control.setAttribute('aria-describedby', helpIds.join(' '));
  }
  element.append(error);
  return { element, controls, error, field, helpIds };
}

function createGroup(container, fields, values, prefix, onInput = updateVisibility, extraContainer) {
  const rows = fields.map((field) => {
    const row = createField(field, prefix, values[field.key]);
    const setValue = (value) => {
      values[field.key] = value;
      onInput();
      if (row.error.textContent && !validationMessage(row)) setError(row, '');
      if (!form.querySelector('[aria-invalid="true"]')) summary.textContent = '';
    };
    if (field.type === 'county') bindCountyPicker(row.controls[0], row.element, setValue);
    else row.element.addEventListener('input', (event) => setValue(event.target.value));
    return row;
  });
  container.replaceChildren(...rows.filter((row) => !row.field.additional).map((row) => row.element));
  extraContainer?.replaceChildren(...rows.filter((row) => row.field.additional).map((row) => row.element));
  return { fields, values, rows, disclosure: extraContainer?.parentElement };
}

function setError(row, message) {
  row.error.textContent = message;
  const descriptions = message ? [...row.helpIds, row.error.id] : row.helpIds;
  for (const control of row.controls) {
    if (message) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
    if (descriptions.length) control.setAttribute('aria-describedby', descriptions.join(' '));
    else control.removeAttribute('aria-describedby');
  }
}

function bindOffice() {
  const office = offices.find((option) => option.value === draft.office);
  byId('office-details').hidden = !office;
  byId('office-details-heading').textContent = office?.label ?? '';
  byId('office-choice').firstElementChild.classList.add('office-choice');
  byId('office-more').open = false;
  officeGroup = createGroup(
    byId('office-fields'), officeFields[draft.office] ?? [], draft.officeAnswers[draft.office] ?? {}, 'details',
    updateVisibility, byId('office-extra-fields'),
  );
  updateVisibility();
}

function updateSuggestion() {
  const hint = suggestRoute(draft.routingHint);
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
  byId('incident-guidance').hidden = draft.office !== 'omhdd' || !['death', 'serious_injury'].includes(incidentType);
}

function validationMessage(row) {
  const [control] = row.controls;
  if (row.field.type === 'county' && control.value.trim() && !control.dataset.selectedCounty) {
    return 'Select a Minnesota county from the matches, or clear the search.';
  }
  if (row.field.required && !row.field.options && !control.value.trim() && !control.validity.badInput) {
    return 'Enter a response for this field.';
  }
  if (control.validity.valueMissing) return 'Choose an option.';
  return control.validity.valid ? '' : control.validationMessage;
}

function validateStep() {
  const entries = [concernGroup.rows, contactGroup.rows, [...routingHintGroup.rows, ...officeChoiceGroup.rows, ...officeGroup.rows]][step];
  const invalidRows = [];
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

function moveTo(nextStep, focus = true) {
  step = nextStep;
  panels.forEach((panel, index) => { panel.hidden = index !== step; });
  steps.forEach((item, index) => {
    if (index === step) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
    item.classList.toggle('done', index < step);
    item.firstElementChild.textContent = index < step ? '✓' : String(index + 1);
  });
  summary.textContent = '';
  byId('back').hidden = step === 0;
  const complete = step === panels.length;
  byId('workflow-actions').hidden = complete;
  byId('intake-complete').hidden = !complete;
  byId('complete-actions').hidden = !complete;
  continueButton.replaceChildren(step === 3 ? 'Download intake' : 'Continue');
  const arrow = node('span', '', step === 3 ? '↓' : '→');
  arrow.setAttribute('aria-hidden', 'true');
  continueButton.append(arrow);
  updateVisibility();
  if (step === 3) renderReview();
  if (focus) {
    (panels[step]?.querySelector('h2') ?? byId('complete-heading')).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function reviewEntries(fields, values) {
  const { answers, visible } = readFields(fields, values);
  return visible.filter((field) => answers[field.key]).map((field) => {
    const value = answers[field.key];
    const option = field.options?.find((item) => item.value === value);
    return [field.label, field.type === 'datetime-local' ? `${value.replace('T', ' ')} Central time` : option?.label ?? value];
  });
}

function reviewGroup(title, entries, targetStep) {
  const section = node('section', 'review-group');
  const header = node('header');
  const button = node('button', 'edit', 'Edit');
  button.type = 'button';
  button.setAttribute('aria-label', `Edit ${title.toLowerCase()}`);
  button.addEventListener('click', () => moveTo(targetStep));
  header.append(node('h3', '', title), button);
  const list = node('dl', 'review-list');
  for (const [label, value] of entries) {
    const row = node('div', 'review-row');
    row.append(node('dt', '', label), node('dd', '', value));
    list.append(row);
  }
  section.append(header, list);
  return section;
}

function renderReview() {
  const review = byId('intake-review');
  review.replaceChildren(
    reviewGroup('Concern', reviewEntries(concernGroup.fields, concernGroup.values), 0),
    reviewGroup('Contact and receipt', reviewEntries(contactGroup.fields, contactGroup.values), 1),
    reviewGroup('Office details', [
      ...reviewEntries(routingHintGroup.fields, routingHintGroup.values),
      ...reviewEntries(officeChoiceGroup.fields, officeChoiceGroup.values),
      ...reviewEntries(officeGroup.fields, officeGroup.values),
    ], 2),
  );
  const { reviewFlags } = prepareIntake(draft);
  if (reviewFlags.length) {
    const section = node('section', 'review-group');
    const flags = node('ul', 'review-flags');
    flags.append(...reviewFlags.map((flag) => node('li', '', flagLabels[flag])));
    section.append(node('h3', '', 'Staff review flags'), flags);
    review.append(section);
  }
}

function downloadRecord() {
  const file = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = node('a');
  link.href = url;
  link.download = `ombus-intake-${record.id}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function startIntake(focus) {
  draft = {
    concern: {}, contact: {}, office: '',
    officeAnswers: Object.fromEntries(offices.map(({ value }) => [value, {}])),
  };
  record = undefined;
  byId('intake-review').replaceChildren();
  byId('record-reference').textContent = '';
  concernGroup = createGroup(byId('concern-fields'), concernFields, draft.concern, 'concern');
  byId('contact-more').open = false;
  contactGroup = createGroup(byId('contact-fields'), contactFields, draft.contact, 'contact', updateVisibility, byId('contact-extra-fields'));
  routingHintGroup = createGroup(byId('routing-hint'), [routingHint], draft, 'route', updateSuggestion);
  officeChoiceGroup = createGroup(byId('office-choice'), [officeChoice], draft, 'route', bindOffice);
  updateSuggestion();
  bindOffice();
  byId('intake-workspace').hidden = false;
  moveTo(0, focus);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (step === 3) {
    record = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...prepareIntake(draft) };
    byId('record-reference').textContent = `Record ID ${record.id}`;
    downloadRecord();
    moveTo(4);
  } else if (step < 3 && validateStep()) {
    moveTo(step + 1);
  }
});

byId('back').addEventListener('click', () => moveTo(step - 1));
byId('use-suggestion').addEventListener('click', () => {
  const { office, topic } = suggestRoute(draft.routingHint);
  if (topic) draft.officeAnswers[office].topic = topic;
  const control = byId(`route-office-${office}`);
  if (control.checked) bindOffice();
  else control.click();
  control.focus();
});
byId('download-again').addEventListener('click', downloadRecord);
byId('new-intake').addEventListener('click', () => startIntake(true));
startIntake(false);
