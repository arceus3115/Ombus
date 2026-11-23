import { node } from './dom.ts';
import { searchCounties } from '../features/intake/counties.ts';

export function bindCountyPicker(input: HTMLInputElement, element: HTMLElement, onValue: (value: string) => void): void {
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

  let matches: ReturnType<typeof searchCounties> = [];
  let active = -1;

  function close() {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function choose(county: (typeof matches)[number]) {
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
    const item = (event.target as HTMLElement).closest<HTMLElement>('[data-match]');
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

