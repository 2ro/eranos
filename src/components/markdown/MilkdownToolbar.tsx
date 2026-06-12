import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  HelpCircle,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function MarkdownHelpPopover() {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={t('mdEditor.help.title')}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">{t('mdEditor.help.title')}</h4>
          <div className="text-xs space-y-1.5 font-mono text-muted-foreground">
            <div className="flex justify-between"><span>**bold**</span><span className="font-sans font-bold">{t('mdEditor.help.bold')}</span></div>
            <div className="flex justify-between"><span>*italic*</span><span className="font-sans italic">{t('mdEditor.help.italic')}</span></div>
            <div className="flex justify-between"><span># Heading 1</span><span className="font-sans">H1</span></div>
            <div className="flex justify-between"><span>## Heading 2</span><span className="font-sans">H2</span></div>
            <div className="flex justify-between"><span>- list item</span><span className="font-sans">{t('mdEditor.help.bulletList')}</span></div>
            <div className="flex justify-between"><span>1. numbered</span><span className="font-sans">{t('mdEditor.help.numberedList')}</span></div>
            <div className="flex justify-between"><span>[text](url)</span><span className="font-sans text-primary">{t('mdEditor.help.link')}</span></div>
            <div className="flex justify-between"><span>&gt; quote</span><span className="font-sans border-l-2 pl-1">{t('mdEditor.help.quote')}</span></div>
            <div className="flex justify-between"><span>`code`</span><span className="font-sans bg-muted px-1 rounded">{t('mdEditor.help.code')}</span></div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
}

function ToolbarButton({ icon, label, shortcut, onClick, active }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={label}
          className={cn(
            'h-8 w-8 text-muted-foreground hover:text-foreground',
            active && 'bg-muted text-foreground',
          )}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>{label}</span>
        {shortcut && <span className="ml-2 text-muted-foreground text-xs">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

interface MilkdownToolbarProps {
  onCommand: (command: string) => void;
  onImageUpload?: () => void;
  className?: string;
}

export function MilkdownToolbar({ onCommand, onImageUpload, className }: MilkdownToolbarProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 p-1.5 border-b border-border bg-muted/40 flex-wrap',
        className,
      )}
    >
      {/* Text formatting */}
      <ToolbarButton
        icon={<Bold className="h-4 w-4" />}
        label={t('mdEditor.toolbar.bold')}
        shortcut="Ctrl+B"
        onClick={() => onCommand('toggleBold')}
      />
      <ToolbarButton
        icon={<Italic className="h-4 w-4" />}
        label={t('mdEditor.toolbar.italic')}
        shortcut="Ctrl+I"
        onClick={() => onCommand('toggleItalic')}
      />
      <ToolbarButton
        icon={<Strikethrough className="h-4 w-4" />}
        label={t('mdEditor.toolbar.strikethrough')}
        onClick={() => onCommand('toggleStrikethrough')}
      />
      <ToolbarButton
        icon={<Code className="h-4 w-4" />}
        label={t('mdEditor.toolbar.inlineCode')}
        onClick={() => onCommand('toggleInlineCode')}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Headings */}
      <ToolbarButton
        icon={<Heading1 className="h-4 w-4" />}
        label={t('mdEditor.toolbar.heading1')}
        onClick={() => onCommand('heading1')}
      />
      <ToolbarButton
        icon={<Heading2 className="h-4 w-4" />}
        label={t('mdEditor.toolbar.heading2')}
        onClick={() => onCommand('heading2')}
      />
      <ToolbarButton
        icon={<Heading3 className="h-4 w-4" />}
        label={t('mdEditor.toolbar.heading3')}
        onClick={() => onCommand('heading3')}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Lists */}
      <ToolbarButton
        icon={<List className="h-4 w-4" />}
        label={t('mdEditor.toolbar.bulletList')}
        onClick={() => onCommand('bulletList')}
      />
      <ToolbarButton
        icon={<ListOrdered className="h-4 w-4" />}
        label={t('mdEditor.toolbar.numberedList')}
        onClick={() => onCommand('orderedList')}
      />
      <ToolbarButton
        icon={<Quote className="h-4 w-4" />}
        label={t('mdEditor.toolbar.blockquote')}
        onClick={() => onCommand('blockquote')}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Links and media */}
      <ToolbarButton
        icon={<Link className="h-4 w-4" />}
        label={t('mdEditor.toolbar.insertLink')}
        onClick={() => onCommand('link')}
      />
      {onImageUpload && (
        <ToolbarButton
          icon={<Image className="h-4 w-4" />}
          label={t('mdEditor.toolbar.insertImage')}
          onClick={onImageUpload}
        />
      )}
      <ToolbarButton
        icon={<Minus className="h-4 w-4" />}
        label={t('mdEditor.toolbar.horizontalRule')}
        onClick={() => onCommand('hr')}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <MarkdownHelpPopover />
    </div>
  );
}
