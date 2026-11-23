import { minnesotaCounties } from './model.ts';

export function searchCounties(query: string) {
  const search = query.toLowerCase().trim().replace(/\s+county$/, '').replace(/^st\.?\s+/, 'saint ').replace(/\s+/g, ' ');
  return minnesotaCounties.filter(({ value, label }) => label.toLowerCase().includes(search) || value.startsWith(search));
}
