import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IconPicker } from '@/components/IconPicker';
import { LucideIcon } from '@/components/LucideIcon';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface ListFormInitial {
  title: string;
  description?: string;
  icon: string;
}

interface ListFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Edit mode: prefilled values and existing slug. Create mode: omit.
   */
  initial?: ListFormInitial;
  /** Heading shown above the form. */
  mode: 'create' | 'edit';
  onSubmit: (values: ListFormInitial) => Promise<void>;
}

/**
 * Shared form used by both Create and Edit list flows. Holds title,
 * description, and icon name. The icon is picked through {@link IconPicker}
 * — a modal-on-modal pattern. Lucide's bundled set is ~1500 icons; the
 * picker is lazy-loaded so the create button doesn't pull the whole
 * library into the main chunk.
 */
export function ListFormDialog({
  open,
  onOpenChange,
  initial,
  mode,
  onSubmit,
}: ListFormDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'List');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever the dialog re-opens with fresh initial values.
  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setIcon(initial?.icon ?? 'List');
  }, [open, initial]);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title: trimmedTitle,
        description: description.trim() || undefined,
        icon,
      });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: mode === 'create'
          ? t('campaigns.lists.createFailed')
          : t('campaigns.lists.updateFailed'),
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogTitle>
            {mode === 'create'
              ? t('campaigns.lists.create')
              : t('campaigns.lists.edit')}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {mode === 'create'
              ? t('campaigns.lists.createDesc')
              : t('campaigns.lists.editDesc')}
          </DialogDescription>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="list-title">
                {t('campaigns.lists.titleField')}
              </Label>
              <Input
                id="list-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('campaigns.lists.titlePlaceholder')}
                maxLength={80}
                autoFocus={mode === 'create'}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="list-description">
                {t('campaigns.lists.descriptionField')}{' '}
                <span className="text-muted-foreground font-normal">
                  ({t('forms.optional')})
                </span>
              </Label>
              <Textarea
                id="list-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('campaigns.lists.descriptionPlaceholder')}
                maxLength={240}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('campaigns.lists.iconField')}</Label>
              <button
                type="button"
                onClick={() => setIconPickerOpen(true)}
                className={cn(
                  'group inline-flex items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                  'hover:border-primary/40 hover:bg-primary/5 motion-safe:transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                )}
              >
                <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted text-foreground">
                  <LucideIcon name={icon} className="size-4" />
                </span>
                <span className="font-mono">{icon}</span>
                <Pencil
                  className="size-3.5 text-muted-foreground ml-auto group-hover:text-foreground"
                  aria-hidden
                />
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
              {mode === 'create'
                ? t('campaigns.lists.createSubmit')
                : t('campaigns.lists.editSubmit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <IconPicker
        open={iconPickerOpen}
        onOpenChange={setIconPickerOpen}
        value={icon}
        onSelect={setIcon}
      />
    </>
  );
}
