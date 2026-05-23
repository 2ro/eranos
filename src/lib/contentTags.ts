const EXCLUDED_CONTENT_TAGS = new Set(['agora']);

export function normalizeContentTag(value: string): string {
  return value.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
}

export function parseContentTagInput(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of value.split(',')) {
    const tag = normalizeContentTag(part);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}

export function getEditableContentTags(tags: string[][]): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const [name, value] of tags) {
    if (name !== 't' || !value) continue;
    const normalized = normalizeContentTag(value);
    if (!normalized || EXCLUDED_CONTENT_TAGS.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }

  return values;
}
