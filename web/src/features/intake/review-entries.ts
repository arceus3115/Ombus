import type { Entry } from '../../components/review.ts';
import { readFields, type Answers, type Field } from './model.ts';

export function reviewEntries(fields: Field[], values: Answers, skipKey?: string): Entry[] {
  const { answers, visible } = readFields(fields, values);
  return visible
    .filter((field) => field.key !== skipKey && answers[field.key])
    .map((field) => {
      const value = answers[field.key] ?? '';
      const option = field.options?.find((item) => item.value === value);
      return [
        field.label,
        field.type === 'datetime-local'
          ? `${value.replace('T', ' ')} local time`
          : (option?.label ?? value),
      ];
    });
}
