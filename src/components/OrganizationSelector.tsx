import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Crown, Loader2, Shield, Users } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useManageableOrganizations } from '@/hooks/useManageableOrganizations';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface OrganizationSelectorProps {
  /**
   * The currently-selected organization's `A` tag coordinate
   * (`34550:<pubkey>:<d>`), or empty when no organization is selected.
   */
  value: string;
  /**
   * Receives the new `A` tag coordinate, or an empty string when the
   * caller cleared the selection.
   */
  onChange: (aTag: string) => void;
  /** Optional disabled state — typically used while a parent form submits. */
  disabled?: boolean;
}

/**
 * Selector that picks one of the NIP-72 Organizations the current user
 * can publish "official" content under (founder or moderator). Used by
 * the create-campaign and create-pledge forms so authors can attach
 * their publication to an Organization they're authorized to represent.
 *
 * The list comes from {@link useManageableOrganizations}, which already
 * restricts the candidate set to founder/moderator orgs. This component
 * is intentionally read-only of that authorization — it doesn't enforce
 * anything itself, it just surfaces the eligible orgs.
 */
export function OrganizationSelector({ value, onChange, disabled }: OrganizationSelectorProps) {
  const { data: organizations, isLoading } = useManageableOrganizations();
  const [open, setOpen] = useState(false);

  const selectedEntry = useMemo(
    () => organizations?.find((entry) => entry.community.aTag === value) ?? null,
    [organizations, value],
  );

  if (isLoading) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className="w-full justify-between"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading organizations…
        </span>
      </Button>
    );
  }

  if (!organizations || organizations.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        You aren't a founder or moderator of any organization yet. Create or join one to publish official organization activity.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            {selectedEntry ? (
              <SelectedOrgLabel
                community={selectedEntry.community}
                isFounder={selectedEntry.isFounder}
              />
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Users className="size-4" />
                Publish under an organization (optional)
              </span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
          <Command>
            <CommandInput placeholder="Search organizations…" />
            <CommandList>
              <CommandEmpty>No organizations match.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0">
                    <Users className="size-3.5" />
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    No organization (personal publication)
                  </span>
                  <Check
                    className={cn('size-4', !value ? 'opacity-100' : 'opacity-0')}
                  />
                </CommandItem>
                {organizations.map((entry) => {
                  const isSelected = entry.community.aTag === value;
                  const image = sanitizeUrl(entry.community.image);
                  const initial = entry.community.name.charAt(0).toUpperCase() || '?';
                  return (
                    <CommandItem
                      key={entry.community.aTag}
                      value={`${entry.community.name} ${entry.community.dTag}`}
                      onSelect={() => {
                        onChange(entry.community.aTag);
                        setOpen(false);
                      }}
                      className="gap-2"
                    >
                      <Avatar className="size-7 shrink-0">
                        {image && <AvatarImage src={image} alt="" />}
                        <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {entry.community.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.isFounder ? 'Founder' : 'Moderator'}
                        </span>
                      </span>
                      <Check
                        className={cn('size-4', isSelected ? 'opacity-100' : 'opacity-0')}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedEntry && (
        <p className="text-xs text-muted-foreground">
          Publishes a root-scope <span className="font-mono text-foreground">A</span> tag so this appears as official activity on the organization page.
        </p>
      )}
    </div>
  );
}

function SelectedOrgLabel({
  community,
  isFounder,
}: {
  community: { name: string; image?: string };
  isFounder: boolean;
}) {
  const image = sanitizeUrl(community.image);
  const initial = community.name.charAt(0).toUpperCase() || '?';
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar className="size-6 shrink-0">
        {image && <AvatarImage src={image} alt="" />}
        <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm font-medium">{community.name}</span>
      <Badge variant="secondary" className="ml-1 shrink-0 gap-1 px-1.5 py-0 text-[10px]">
        {isFounder ? <Crown className="size-3" /> : <Shield className="size-3" />}
        {isFounder ? 'Founder' : 'Moderator'}
      </Badge>
    </span>
  );
}
