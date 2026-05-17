import { useSeoMeta } from '@unhead/react';
import { ArrowUpRight } from 'lucide-react';
import { WhiteNoiseIcon } from '@/components/icons/WhiteNoiseIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { openUrl } from '@/lib/downloadFile';

const WHITENOISE_URL = 'https://www.whitenoise.chat/';

const Messages = () => {
  useSeoMeta({
    title: 'Messages',
    description: 'Private messaging on Nostr',
  });

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="max-w-md w-full border-dashed">
        <CardContent className="py-10 px-8 text-center space-y-6">
          <WhiteNoiseIcon className="mx-auto h-14 w-auto text-foreground" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Private messaging lives elsewhere</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Agora doesn&apos;t handle direct messages. For end-to-end encrypted Nostr chat with strong metadata protection, we recommend White Noise.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => openUrl(WHITENOISE_URL)}
          >
            Install White Noise
            <ArrowUpRight className="ml-2 w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Messages;
