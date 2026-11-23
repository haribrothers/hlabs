import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The type scale's sizes (tokens.json `text-*`). tailwind-merge doesn't know them, so it took `text-caption` for a colour
 * and dropped it beside `text-success`: listed here, a size and a colour live together.
 */
const TEXT_SIZES = [
  'display-xl',
  'display',
  'title-1',
  'title-2',
  'headline',
  'body',
  'body-sm',
  'label',
  'caption',
  'tab-label',
  'large-title',
  'row',
  'subhead',
  'footnote',
  'tile-name',
];

const merge = extendTailwindMerge({ extend: { classGroups: { 'font-size': [{ text: TEXT_SIZES }] } } });

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
