import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { CalendarDays } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { LoginArea } from '@/components/auth/LoginArea';
import { CreateCommunityEventDialog } from '@/components/CreateCommunityEventDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';

function decodeOrgParam(value: string | null): string | undefined {
  if (!value) return undefined;
  if (/^34550:[0-9a-f]{64}:.+$/i.test(value)) return value;

  try {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'naddr' || decoded.data.kind !== COMMUNITY_DEFINITION_KIND) return undefined;
    return `${COMMUNITY_DEFINITION_KIND}:${decoded.data.pubkey}:${decoded.data.identifier}`;
  } catch {
    return undefined;
  }
}

export function CreateEventPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(true);
  const publishedRef = useRef(false);
  const communityATag = useMemo(() => decodeOrgParam(searchParams.get('org')), [searchParams]);

  useSeoMeta({
    title: t('calendarEvents.create.seoTitle'),
    description: t('calendarEvents.create.seoDescription'),
  });

  const closePage = () => {
    setOpen(false);
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/groups');
    }
  };

  if (!user) {
    return (
      <main className="min-h-screen pb-16">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <Card>
            <CardContent className="space-y-4 px-8 py-12 text-center">
              <CalendarDays className="mx-auto size-10 text-muted-foreground/60" />
              <h1 className="text-xl font-semibold">{t('calendarEvents.create.loginTitle')}</h1>
              <p className="text-muted-foreground">{t('calendarEvents.create.loginBody')}</p>
              <div className="flex justify-center">
                <LoginArea className="max-w-64" />
              </div>
              <Button type="button" variant="ghost" onClick={() => navigate('/groups')}>
                {t('groups.create.backToGroups')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[60vh]">
      <CreateCommunityEventDialog
        communityATag={communityATag}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen && !publishedRef.current) closePage();
        }}
        onPublished={(naddr) => {
          publishedRef.current = true;
          navigate(`/${naddr}`, { replace: true });
        }}
      />
    </main>
  );
}

export default CreateEventPage;
