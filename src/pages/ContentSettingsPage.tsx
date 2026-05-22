import { useSeoMeta } from '@unhead/react';
import { ContentSettings } from '@/components/ContentSettings';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';

export function ContentSettingsPage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `Home Feed | Settings | ${config.appName}`,
    description: 'Choose what types of posts appear in your home feed',
  });

  return (
    <main>
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">Home Feed</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose what appears in your feed, manage saved searches, and hide content you don't want to see.
            </p>
          </div>
        }
      />

      <div className="p-4">
        <ContentSettings />
      </div>
    </main>
  );
}
