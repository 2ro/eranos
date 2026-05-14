import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Settings, Plus, Trash2, Search, X, MapPin, Globe, Hash } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useEventDashboardConfig, materializeHashtags } from '@/hooks/useEventDashboardConfig';
import type { TrackedRegion, TerritorialScope, DashboardConfig } from '@/hooks/useEventDashboardConfig';
import { VE_STATES, VE_MUNICIPALITIES } from '@/lib/venezuelaTerritorial';

interface ConfigDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CatalogScope = 'state' | 'municipality';

const MAX_CATALOG_RESULTS = 50;

export function ConfigDrawer({ open, onOpenChange }: ConfigDrawerProps) {
  const { config, applyConfig } = useEventDashboardConfig();

  // Draft state — cloned from config on open
  const [draftRegions, setDraftRegions] = useState<TrackedRegion[]>([]);
  const [draftSince, setDraftSince] = useState<number | null>(null);

  // Catalog state
  const [catalogScope, setCatalogScope] = useState<CatalogScope>('state');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Custom entry state
  const [customLabel, setCustomLabel] = useState('');
  const [customHashtag, setCustomHashtag] = useState('');

  // Tracked list search
  const [trackedSearch, setTrackedSearch] = useState('');

  // Initialize draft when drawer opens
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      setDraftRegions([...config.regions]);
      setDraftSince(config.since);
    }
    prevOpen.current = open;
  }, [open, config]);

  // Lookup set for fast "is tracked" checks
  const trackedCodes = useMemo(() => {
    const set = new Set<string>();
    for (const r of draftRegions) {
      for (const h of r.hashtags) set.add(h);
    }
    return set;
  }, [draftRegions]);

  // Catalog items — full filtered set (for "Add all") and capped subset (for rendering)
  const allFilteredCatalogItems = useMemo(() => {
    const query = catalogSearch.toLowerCase().trim();
    const source = catalogScope === 'state'
      ? VE_STATES.map((s) => ({ code: s.code, label: s.label, scope: 'state' as const }))
      : VE_MUNICIPALITIES.map((m) => ({ code: m.code, label: `${m.label} (${m.stateLabel})`, scope: 'municipality' as const }));

    return query
      ? source.filter((item) =>
          item.label.toLowerCase().includes(query) || item.code.includes(query),
        )
      : source;
  }, [catalogScope, catalogSearch]);

  const catalogItems = useMemo(
    () => allFilteredCatalogItems.slice(0, MAX_CATALOG_RESULTS),
    [allFilteredCatalogItems],
  );

  // Filtered tracked list
  const filteredTracked = useMemo(() => {
    const query = trackedSearch.toLowerCase().trim();
    if (!query) return draftRegions;
    return draftRegions.filter(
      (r) => r.label.toLowerCase().includes(query) || r.hashtags.some((h) => h.includes(query)),
    );
  }, [draftRegions, trackedSearch]);

  // Actions
  const addTerritory = useCallback((code: string, label: string, scope: TerritorialScope) => {
    setDraftRegions((prev) => {
      if (prev.some((r) => r.type === scope && r.code === code)) return prev;
      const entry: TrackedRegion = {
        id: crypto.randomUUID(),
        type: scope,
        code,
        label,
        hashtags: materializeHashtags(scope, code),
        order: prev.length,
      };
      return [...prev, entry];
    });
  }, []);

  const removeTerritory = useCallback((code: string) => {
    setDraftRegions((prev) => prev.filter((r) => !(r.code === code || (r.hashtags.length === 1 && r.hashtags[0] === code))));
  }, []);

  const addCustomEntry = useCallback(() => {
    const tag = customHashtag.trim().toLowerCase().replace(/^#/, '');
    const label = customLabel.trim();
    if (!tag) return;

    setDraftRegions((prev) => {
      if (prev.some((r) => r.hashtags.includes(tag))) return prev;
      const entry: TrackedRegion = {
        id: crypto.randomUUID(),
        label: label || tag,
        hashtags: [tag],
        order: prev.length,
      };
      return [...prev, entry];
    });
    setCustomLabel('');
    setCustomHashtag('');
  }, [customLabel, customHashtag]);

  const removeById = useCallback((id: string) => {
    setDraftRegions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const removeAll = useCallback(() => {
    setDraftRegions([]);
  }, []);

  const addAllCatalogResults = useCallback(() => {
    setDraftRegions((prev) => {
      const existing = new Set(prev.map((r) => r.code).filter(Boolean));
      const newEntries: TrackedRegion[] = [];
      for (const item of allFilteredCatalogItems) {
        if (existing.has(item.code)) continue;
        newEntries.push({
          id: crypto.randomUUID(),
          type: item.scope,
          code: item.code,
          label: item.label,
          hashtags: materializeHashtags(item.scope, item.code),
          order: prev.length + newEntries.length,
        });
      }
      return [...prev, ...newEntries];
    });
  }, [allFilteredCatalogItems]);

  // Since filter helpers — format as local time for datetime-local input
  const sinceValue = useMemo(() => {
    if (!draftSince) return '';
    const d = new Date(draftSince * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [draftSince]);

  const handleSinceChange = (value: string) => {
    if (!value) {
      setDraftSince(null);
    } else {
      setDraftSince(Math.floor(new Date(value).getTime() / 1000));
    }
  };

  // Save / Cancel
  const handleSave = () => {
    const next: DashboardConfig = {
      regions: draftRegions,
      since: draftSince,
      lastUpdated: Date.now(),
    };
    applyConfig(next);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  // Type badge helper
  const typeBadge = (r: TrackedRegion) => {
    if (r.type === 'state') return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">State</Badge>;
    if (r.type === 'municipality') return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Muni</Badge>;
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0">Custom</Badge>;
  };

  // Counts
  const stateCount = draftRegions.filter((r) => r.type === 'state').length;
  const muniCount = draftRegions.filter((r) => r.type === 'municipality').length;
  const customCount = draftRegions.filter((r) => !r.type).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Settings className="size-4" />
            Dashboard Configuration
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-6 pb-4">
            {/* Since filter */}
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Time Filter
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={sinceValue}
                  onChange={(e) => handleSinceChange(e.target.value)}
                  className="text-sm"
                />
                {draftSince && (
                  <Button size="icon" variant="ghost" onClick={() => setDraftSince(null)} className="shrink-0">
                    <X className="size-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Only show posts after this time. Leave empty for no time limit.
              </p>
            </div>

            <Separator />

            {/* Territory catalog */}
            <div className="space-y-3">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Territory Catalog
              </Label>
              <Tabs value={catalogScope} onValueChange={(v) => { setCatalogScope(v as CatalogScope); setCatalogSearch(''); }}>
                <TabsList className="w-full">
                  <TabsTrigger value="state" className="flex-1">States</TabsTrigger>
                  <TabsTrigger value="municipality" className="flex-1">Municipalities</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder={`Search ${catalogScope === 'state' ? 'states' : 'municipalities'}...`}
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>

              {/* Catalog results */}
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {catalogItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">No results</p>
                ) : (
                  <div className="divide-y">
                    {catalogItems.map((item) => {
                      const isTracked = trackedCodes.has(item.code);
                      return (
                        <button
                          key={item.code}
                          type="button"
                          onClick={() => isTracked ? removeTerritory(item.code) : addTerritory(item.code, item.label, item.scope)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors ${isTracked ? 'bg-primary/5' : ''}`}
                        >
                          <span className="truncate">{item.label}</span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-2">
                            {isTracked ? '✓' : item.code}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {allFilteredCatalogItems.length > MAX_CATALOG_RESULTS && (
                <p className="text-xs text-muted-foreground">
                  Showing {MAX_CATALOG_RESULTS} of {allFilteredCatalogItems.length} results
                </p>
              )}
              {allFilteredCatalogItems.length > 0 && (
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={addAllCatalogResults}>
                  <Plus className="size-3 mr-1" />
                  Add all {allFilteredCatalogItems.length} results
                </Button>
              )}
            </div>

            <Separator />

            {/* Custom entry */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Hash className="size-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Custom Entry
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Track arbitrary hashtags (campaign tags, special codes, etc.)
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="Label (optional)"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="text-sm"
                />
                <Input
                  placeholder="Hashtag code (without #)"
                  value={customHashtag}
                  onChange={(e) => setCustomHashtag(e.target.value.toLowerCase())}
                  className="text-sm"
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={addCustomEntry}
                disabled={!customHashtag.trim()}
              >
                <Plus className="size-3 mr-1" />
                Add Custom Entry
              </Button>
            </div>

            <Separator />

            {/* Tracked entries list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tracked Entries ({draftRegions.length})
                  </Label>
                  {draftRegions.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[
                        stateCount > 0 && `${stateCount} states`,
                        muniCount > 0 && `${muniCount} municipalities`,
                        customCount > 0 && `${customCount} custom`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {draftRegions.length > 0 && (
                  <Button size="sm" variant="ghost" className="text-xs text-destructive hover:text-destructive" onClick={removeAll}>
                    <Trash2 className="size-3 mr-1" />
                    Remove All
                  </Button>
                )}
              </div>

              {draftRegions.length > 10 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter tracked entries..."
                    value={trackedSearch}
                    onChange={(e) => setTrackedSearch(e.target.value)}
                    className="pl-8 text-sm"
                  />
                </div>
              )}

              <div className="border rounded-md max-h-64 overflow-y-auto">
                {filteredTracked.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    {draftRegions.length === 0 ? 'No entries tracked' : 'No matches'}
                  </p>
                ) : (
                  <div className="divide-y">
                    {filteredTracked.map((region) => (
                      <div key={region.id} className="flex items-center justify-between px-3 py-2 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {region.type === 'state' && <Globe className="size-3 text-muted-foreground shrink-0" />}
                          {region.type === 'municipality' && <MapPin className="size-3 text-muted-foreground shrink-0" />}
                          {!region.type && <Hash className="size-3 text-muted-foreground shrink-0" />}
                          <span className="text-sm truncate">{region.label}</span>
                          {typeBadge(region)}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeById(region.id)}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="border-t px-4 py-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            Save & Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
