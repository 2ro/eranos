import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { TranslateButton } from '@/components/TranslateButton';

type TranslatableEventField = 'name' | 'description' | 'title' | 'summary' | 'location' | 'content';

interface TranslationField {
  field: TranslatableEventField;
  text: string;
}

type TranslatedEventText = Partial<Record<TranslatableEventField, string>>;

interface UseEventTranslationOptions {
  /** Treat generic plaintext event.content as translatable for kinds not listed explicitly. */
  includePlainContent?: boolean;
  /** Always hide the visible label on the translate button. */
  iconOnly?: boolean;
  /** Extra classes for the translate button. */
  buttonClassName?: string;
}

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function textTag(event: NostrEvent, field: Exclude<TranslatableEventField, 'content'>): TranslationField | undefined {
  const text = getTag(event.tags, field)?.trim();
  return text ? { field, text } : undefined;
}

function contentField(event: NostrEvent): TranslationField | undefined {
  const text = event.content.trim();
  return text ? { field: 'content', text: event.content } : undefined;
}

function replaceTagValue(tags: string[][], name: string, value: string): string[][] {
  return tags.map((tag) => tag[0] === name ? [tag[0], value, ...tag.slice(2)] : tag);
}

function getTranslatableEventFields(event: NostrEvent, includePlainContent: boolean): TranslationField[] {
  const fields: Array<TranslationField | undefined> = [];

  if (event.kind === 34550) {
    fields.push(textTag(event, 'name'), textTag(event, 'description'));
  } else if (event.kind === 33863) {
    fields.push(textTag(event, 'title'), textTag(event, 'summary'), contentField(event));
  } else if (event.kind === 36639) {
    fields.push(textTag(event, 'title'), contentField(event));
  } else if (event.kind === 31922 || event.kind === 31923) {
    const location = getTag(event.tags, 'location')?.trim();
    fields.push(
      textTag(event, 'title'),
      textTag(event, 'summary'),
      location && !location.startsWith('{') ? { field: 'location', text: location } : undefined,
      contentField(event),
    );
  } else if (includePlainContent) {
    fields.push(contentField(event));
  }

  return fields.filter((field): field is TranslationField => !!field);
}

function applyTranslatedEventFields(event: NostrEvent, translatedText: TranslatedEventText | null): NostrEvent {
  if (!translatedText) return event;

  let tags = event.tags;
  for (const field of ['name', 'description', 'title', 'summary', 'location'] as const) {
    const value = translatedText[field];
    if (value) tags = replaceTagValue(tags, field, value);
  }

  return {
    ...event,
    tags,
    content: translatedText.content ?? event.content,
  };
}

export function useEventTranslation(event: NostrEvent, options: UseEventTranslationOptions = {}): {
  translatedEvent: NostrEvent;
  translateAction: ReactNode;
} {
  const [translatedText, setTranslatedText] = useState<TranslatedEventText | null>(null);

  const fields = useMemo(
    () => getTranslatableEventFields(event, !!options.includePlainContent),
    [event, options.includePlainContent],
  );
  const texts = fields.map(({ text }) => text);
  const labelText = texts.join('\n\n');
  const translatedEvent = useMemo(() => applyTranslatedEventFields(event, translatedText), [event, translatedText]);

  useEffect(() => {
    setTranslatedText(null);
  }, [event.id]);

  return {
    translatedEvent,
    translateAction: fields.length > 0 ? (
      <TranslateButton
        text={labelText}
        texts={texts}
        isTranslated={translatedText !== null}
        onTranslated={(_, translatedTexts) => {
          const next: TranslatedEventText = {};
          fields.forEach(({ field }, index) => {
            const translated = translatedTexts[index];
            if (translated) next[field] = translated;
          });
          setTranslatedText(next);
        }}
        onReset={() => setTranslatedText(null)}
        responsiveLabel={!options.iconOnly}
        iconOnly={options.iconOnly}
        className={options.buttonClassName ?? "h-9 px-3 text-sm font-medium"}
      />
    ) : null,
  };
}
