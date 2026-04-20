import { useSeoMeta } from '@unhead/react';
import { DMMessagingInterface } from '@samthomson/nostr-messaging/ui';
import { Link } from 'react-router-dom';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const Messages = () => {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const messagingEnabled = config.messaging?.enabled ?? true;

  useSeoMeta({
    title: 'Messages',
    description: 'Private encrypted messaging on Nostr',
  });

  useLayoutOptions({
    rightSidebar: null,
    noMaxWidth: true,
    noOverscroll: true,
    wrapperClassName: 'max-w-full',
  });

  return (
    <div className="h-dvh flex flex-col">
      {!user ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-3 text-muted-foreground">
            <p>Please log in to view your messages.</p>
          </div>
        </div>
      ) : messagingEnabled ? (
        <DMMessagingInterface />
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-3">
            <h2 className="text-xl font-semibold">Chats are turned off</h2>
            <p className="text-sm text-muted-foreground">
              Enable messaging in settings to start using chats.
            </p>
            <Link to="/settings/advanced" className="inline-block text-sm text-primary hover:underline">
              Open Settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;
