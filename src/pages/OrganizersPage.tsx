import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { Lock, Shield } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { LoginArea } from '@/components/auth/LoginArea';
import { OrganizersManager } from '@/components/OrganizersManager';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { isAdmin } from '@/lib/admins';

/**
 * Admin-only page for managing country-organizer appointments. Non-admins
 * who land here see a locked-out card; logged-out visitors see the login
 * prompt. The body delegates to `<OrganizersManager />`.
 */
export function OrganizersPage() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const userIsAdmin = !!user && isAdmin(user.pubkey);

  useSeoMeta({
    title: `${t('settings.organizers')} | ${config.appName}`,
    description:
      'Manage country organizers. Organizers can pin posts to their respective country feeds.',
  });

  return (
    <main className="">
      <PageHeader title={t('settings.organizers')} icon={<Shield className="size-5" />} />

      <div className="px-4 py-6 max-w-2xl mx-auto">
        {!user ? (
          <div className="text-center space-y-6 py-12">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">{t('settings.signInToManage')}</h3>
              <p className="text-muted-foreground">{t('settings.loginRequired')}</p>
            </div>
            <LoginArea className="justify-center" />
          </div>
        ) : !userIsAdmin ? (
          <Card className="bg-gradient-to-br from-destructive/5 to-destructive/10 border-destructive/20">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-destructive/20 to-destructive/30 flex items-center justify-center">
                  <Lock className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="font-semibold text-lg">{t('organizers.adminRequired')}</h3>
                <p className="text-muted-foreground">{t('organizers.adminRequiredDesc')}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <OrganizersManager />
        )}
      </div>
    </main>
  );
}

export default OrganizersPage;
