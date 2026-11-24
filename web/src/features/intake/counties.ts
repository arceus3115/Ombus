import { minnesotaCounties, type Option } from './model.ts';

export function searchCounties(query: string, options: readonly Option[] = minnesotaCounties) {
  const search = query
    .toLowerCase()
    .trim()
    .replace(/\s+county$/, '')
    .replace(/^st\.?\s+/, 'saint ')
    .replace(/\s+/g, ' ');
  return options.filter(
    ({ value, label }) => label.toLowerCase().includes(search) || value.startsWith(search),
  );
}
