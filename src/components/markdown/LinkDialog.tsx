import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedText?: string;
  onSubmit: (text: string, url: string) => void;
}

/**
 * Insert-link dialog for the Milkdown editor. When the user has text
 * selected, we only ask for a URL; otherwise we ask for both link text
 * and URL. Bare hostnames are upgraded to `https://`.
 */
export function LinkDialog({ open, onOpenChange, selectedText, onSubmit }: LinkDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');

  // Reset form when the dialog opens.
  useEffect(() => {
    if (open) {
      setText(selectedText || '');
      setUrl('');
    }
  }, [open, selectedText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const finalText = text.trim() || url.trim();
    let finalUrl = url.trim();

    // Add https:// if no protocol specified.
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    onSubmit(finalText, finalUrl);
    onOpenChange(false);
  };

  const hasSelectedText = !!selectedText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('mdEditor.link.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {!hasSelectedText ? (
              <div className="space-y-2">
                <Label htmlFor="link-text">{t('mdEditor.link.textLabel')}</Label>
                <Input
                  id="link-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('mdEditor.link.textPlaceholder')}
                  autoFocus
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('mdEditor.link.textLabel')}</Label>
                <p className="text-sm bg-muted px-3 py-2 rounded-md break-words">{selectedText}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="link-url">{t('mdEditor.link.urlLabel')}</Label>
              <Input
                id="link-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                type="url"
                autoFocus={hasSelectedText}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('mdEditor.link.cancel')}
            </Button>
            <Button type="submit" disabled={!url.trim()}>
              {t('mdEditor.link.insert')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
