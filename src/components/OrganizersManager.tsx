import { useState } from 'react';
import { useOrganizers } from '@/hooks/useOrganizers';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { isAdmin } from '@/lib/admins';
import { getGeoDisplayName, getAllCountries } from '@/lib/countries';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, UserPlus, Trash2, MapPin, Loader2, RefreshCw } from 'lucide-react';
import { getDisplayName } from '@/lib/genUserName';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CountryFlag } from '@/components/CountryFlag';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

/**
 * Card row for a single appointed organizer. Admins see a remove button;
 * everyone else sees just the read-only entry.
 */
function OrganizerCard({ organizer }: { organizer: { pubkey: string; countryCode: string } }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const author = useAuthor(organizer.pubkey);
  const { user } = useCurrentUser();
  const { removeOrganizer } = useOrganizers();
  const { toast } = useToast();
  const [isRemoving, setIsRemoving] = useState(false);

  const metadata: NostrMetadata | undefined = author.data?.metadata;

  const displayName = getDisplayName(metadata, organizer.pubkey);
  const countryName = getGeoDisplayName(organizer.countryCode);
  const npub = nip19.npubEncode(organizer.pubkey);

  const canRemove = !!user && isAdmin(user.pubkey);

  const handleNavigateToProfile = () => {
    navigate(`/${npub}`);
  };

  const handleRemove = async () => {
    if (!canRemove) return;

    setIsRemoving(true);
    try {
      await removeOrganizer.mutateAsync({
        npub,
        countryCode: organizer.countryCode,
      });
      toast({
        title: t('organizers.removed'),
        description: t('organizers.removedSuccess', { name: displayName, country: countryName }),
      });
    } catch (error) {
      console.error('Failed to remove organizer:', error);
      toast({
        title: t('common.error'),
        description: t('common.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <Avatar
            className="h-10 w-10 ring-2 ring-primary/20 cursor-pointer hover:ring-primary/40 transition-all"
            onClick={handleNavigateToProfile}
          >
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4
                className="font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                onClick={handleNavigateToProfile}
              >
                {displayName}
              </h4>
              <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                <MapPin className="h-3 w-3" />
                {countryName}
              </Badge>
            </div>
          </div>
          {canRemove && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={isRemoving}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Admin-only management surface for the country-organizers list. Lets admins
 * appoint a user as organizer for a specific country and remove existing
 * appointments. Reads/writes the canonical kind 30078 / d=`agora-organizers`
 * event via `useOrganizers`.
 */
export function OrganizersManager() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { organizers, isLoading, addOrganizer } = useOrganizers();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [npub, setNpub] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const userIsAdmin = !!user && isAdmin(user.pubkey);

  const countries = getAllCountries();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['organizers'] });
    setTimeout(() => setIsRefreshing(false), 1000);
    toast({
      title: t('organizers.refreshed'),
      description: t('organizers.refreshedDesc'),
    });
  };

  const handleAddOrganizer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!npub || !countryCode || !user) return;

    setIsAdding(true);
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type !== 'npub') {
        throw new Error(t('organizers.invalidNpub'));
      }

      const decodedPubkey = (decoded as { type: 'npub'; data: string }).data;

      const existingOrganizer = organizers.find(
        (org) =>
          org.pubkey === decodedPubkey &&
          org.countryCode.toUpperCase() === countryCode.toUpperCase(),
      );

      if (existingOrganizer) {
        toast({
          title: t('organizers.alreadyOrganizer'),
          description: t('organizers.alreadyOrganizer'),
          variant: 'destructive',
        });
        return;
      }

      await addOrganizer.mutateAsync({ npub, countryCode });

      toast({
        title: t('organizers.appointed'),
        description: t('organizers.appointedSuccess', {
          country: getGeoDisplayName(countryCode),
        }),
      });

      setNpub('');
      setCountryCode('');
    } catch (error) {
      console.error('Failed to add organizer:', error);
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('common.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  if (!userIsAdmin) {
    return (
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">{t('organizers.adminRequired')}</h3>
            <p className="text-muted-foreground">{t('organizers.adminRequiredDesc')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {t('organizers.appoint')}
          </CardTitle>
          <CardDescription>{t('organizers.appointDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddOrganizer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="npub">{t('organizers.userNpub')}</Label>
              <Input
                id="npub"
                value={npub}
                onChange={(e) => setNpub(e.target.value)}
                placeholder="npub1..."
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">{t('organizers.country')}</Label>
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger id="country" className="bg-background/50">
                  <SelectValue placeholder={t('organizers.selectCountry')} />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      <span className="inline-flex items-center gap-2">
                        <CountryFlag
                          code={country.code}
                          emoji={country.flag}
                          label={`Flag of ${country.name}`}
                        />
                        {country.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={!npub || !countryCode || isAdding}
              className="w-full bg-primary hover:opacity-90 text-xs sm:text-sm"
            >
              {isAdding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin flex-shrink-0" />
                  <span className="truncate">{t('organizers.appointing')}</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">{t('organizers.appoint')}</span>
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">{t('organizers.current')}</h3>
            {!isLoading && (
              <Badge variant="secondary" className="ml-2">
                {organizers.length}
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : organizers.length === 0 ? (
          <Card className="border-dashed border-border/50">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{t('organizers.noOrganizers')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {organizers.map((organizer, index) => (
              <OrganizerCard
                key={`${organizer.pubkey}-${organizer.countryCode}-${index}`}
                organizer={organizer}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
