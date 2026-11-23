import { node } from './dom.ts';

export type Entry = [label: string, value: string];

export function reviewGroup(title: string, entries: Entry[], onEdit?: () => void) {
  const section = node('section', 'review-group');
  const header = node('header');
  header.append(node('h3', '', title));
  if (onEdit) {
    const button = node('button', 'edit', 'Edit');
    button.type = 'button';
    button.setAttribute('aria-label', `Edit ${title.toLowerCase()}`);
    button.addEventListener('click', onEdit);
    header.append(button);
  }
  const list = node('dl', 'review-list');
  for (const [label, value] of entries) {
    const row = node('div', 'review-row');
    row.append(node('dt', '', label), node('dd', '', value));
    list.append(row);
  }
  section.append(header, list);
  return section;
}

