import { node } from './dom.ts';
import { bindCountyPicker } from './county-picker.ts';
import type { Answers, Field } from '../features/intake/model.ts';

type FieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
export type FieldRow = { element: HTMLElement; controls: FieldControl[]; error: HTMLParagraphElement; field: Field; helpIds: string[] };
export type FieldGroup = { fields: Field[]; values: Answers; rows: FieldRow[]; disclosure?: HTMLDetailsElement };

function createField(field: Field, prefix: string, value?: string): FieldRow {
  const isRadio = field.type === 'radio';
  const id = `${prefix}-${field.key}`;
  const element = node(isRadio ? 'fieldset' : 'div', 'field');
  const label = node(isRadio ? 'legend' : 'label', '', field.label);
  if (label instanceof HTMLLabelElement) label.htmlFor = id;
  if (!field.required) label.append(node('span', 'optional', ' Optional'));
  element.append(label);

  const error = node('p', 'field-error');
  error.id = `${id}-error`;
  const helpIds: string[] = [];
  if (field.help) {
    const help = node('p', 'field-help', field.help);
    help.id = `${id}-help`;
    element.append(help);
    helpIds.push(help.id);
  }

  const controls: FieldControl[] = [];
  if (isRadio) {
    const choices = node('div', 'choices');
    for (const option of field.options ?? []) {
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
    if (input instanceof HTMLInputElement) input.type = field.type === 'county' ? 'text' : field.type;
    if (input instanceof HTMLTextAreaElement) input.rows = field.rows ?? 3;
    if (field.max && !(input instanceof HTMLSelectElement)) input.maxLength = field.max;
    if (input instanceof HTMLSelectElement) {
      input.add(new Option('Select an option', ''));
      for (const option of field.options ?? []) input.add(new Option(option.label, option.value));
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

export function createGroup(
  container: HTMLElement,
  fields: Field[],
  values: Answers,
  prefix: string,
  onInput: () => void,
  extraContainer?: HTMLElement,
): FieldGroup {
  const rows = fields.map((field) => {
    const row = createField(field, prefix, values[field.key]);
    const setValue = (value: string) => {
      values[field.key] = value;
      onInput();
      if (row.error.textContent && !validationMessage(row)) setError(row, '');
      
    };
    if (field.type === 'county') bindCountyPicker(row.controls[0] as HTMLInputElement, row.element, setValue);
    else row.element.addEventListener('input', (event) => setValue((event.target as FieldControl).value));
    return row;
  });
  container.replaceChildren(...rows.filter((row) => !row.field.additional).map((row) => row.element));
  extraContainer?.replaceChildren(...rows.filter((row) => row.field.additional).map((row) => row.element));
  return { fields, values, rows, disclosure: extraContainer?.closest('details') ?? undefined };
}

export function setError(row: FieldRow, message: string) {
  row.error.textContent = message;
  const descriptions = message ? [...row.helpIds, row.error.id] : row.helpIds;
  for (const control of row.controls) {
    if (message) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
    if (descriptions.length) control.setAttribute('aria-describedby', descriptions.join(' '));
    else control.removeAttribute('aria-describedby');
  }
}

export function validationMessage(row: FieldRow) {
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

