import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Zap, Globe, WalletMinimal, CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNWC } from '@/hooks/useNWCContext';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/hooks/useToast';

export function WalletSettings() {
  const { t } = useTranslation();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [connectionUri, setConnectionUri] = useState('');
  const [alias, setAlias] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const {
    connections,
    activeConnection,
    connectionInfo,
    addConnection,
    removeConnection,
    setActiveConnection,
  } = useNWC();
  const { webln } = useWallet();
  const hasNWC = connections.length > 0 && connections.some(c => c.isConnected);
  const { toast } = useToast();

  const handleAddConnection = async () => {
    if (!connectionUri.trim()) {
      toast({
        title: t('walletConnect.toast.uriRequiredTitle'),
        description: t('walletConnect.toast.uriRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    setIsConnecting(true);
    try {
      const success = await addConnection(connectionUri.trim(), alias.trim() || undefined);
      if (success) {
        setConnectionUri('');
        setAlias('');
        setAddDialogOpen(false);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRemoveConnection = (connectionString: string) => {
    removeConnection(connectionString);
  };

  const handleSetActive = (connectionString: string) => {
    setActiveConnection(connectionString);
    toast({
      title: t('walletConnect.toast.activeChangedTitle'),
      description: t('walletConnect.toast.activeChangedDesc'),
    });
  };

  return (
    <>
      <div className="space-y-6">
        {/* Connection status cards */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">{t('walletConnect.status')}</h2>
          <div className="grid gap-3">
            {/* WebLN */}
            <Card className="overflow-hidden">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-9 rounded-full bg-secondary">
                    <Globe className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t('walletConnect.webln.name')}</p>
                    <p className="text-xs text-muted-foreground">{t('walletConnect.webln.description')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {webln && <CheckCircle className="size-4 text-green-500" />}
                  <Badge variant={webln ? 'default' : 'secondary'} className="text-xs">
                    {webln ? t('walletConnect.ready') : t('walletConnect.notFound')}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* NWC */}
            <Card className="overflow-hidden">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-9 rounded-full bg-secondary">
                    <WalletMinimal className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t('walletConnect.nwc.name')}</p>
                    <p className="text-xs text-muted-foreground">
                      {connections.length > 0
                        ? t('walletConnect.nwc.connectedCount', { count: connections.length })
                        : t('walletConnect.nwc.description')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasNWC && <CheckCircle className="size-4 text-green-500" />}
                  <Badge variant={hasNWC ? 'default' : 'secondary'} className="text-xs">
                    {hasNWC ? t('walletConnect.ready') : t('walletConnect.none')}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        {/* NWC Wallets */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('walletConnect.nwc.name')}</h2>
            <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)} className="rounded-full">
              <Plus className="size-4 mr-1" />
              {t('walletConnect.add')}
            </Button>
          </div>

          {connections.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <WalletMinimal className="size-8 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mb-1">{t('walletConnect.empty.title')}</p>
                <p className="text-xs text-muted-foreground/70">{t('walletConnect.empty.description')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {connections.map((connection) => {
                const info = connectionInfo[connection.connectionString];
                const isActive = activeConnection === connection.connectionString;
                return (
                  <Card key={connection.connectionString} className={isActive ? 'ring-2 ring-primary' : ''}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center size-9 rounded-full bg-secondary shrink-0">
                          <WalletMinimal className="size-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {connection.alias || info?.alias || t('walletConnect.defaultWalletName')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isActive ? t('walletConnect.active') : t('walletConnect.connectionLabel')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isActive && <CheckCircle className="size-4 text-green-500 mr-1" />}
                        {!isActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetActive(connection.connectionString)}
                            className="rounded-full"
                            title={t('walletConnect.setActiveTitle')}
                          >
                            <Zap className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveConnection(connection.connectionString)}
                          className="rounded-full text-muted-foreground hover:text-destructive"
                          title={t('walletConnect.removeTitle')}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Help text */}
        {!webln && connections.length === 0 && (
          <>
            <Separator />
            <div className="text-center py-4 space-y-2 px-4">
              <p className="text-sm text-muted-foreground">
                {t('walletConnect.helpText')}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Add wallet dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-[520px] rounded-2xl p-0 gap-0 border-border overflow-hidden [&>button]:hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12">
            <DialogTitle className="text-base font-semibold">
              {t('walletConnect.dialog.title')}
            </DialogTitle>
            <button
              onClick={() => setAddDialogOpen(false)}
              className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Description */}
          <p className="px-4 -mt-1 mb-2 text-sm text-muted-foreground">
            {t('walletConnect.dialog.description')}
          </p>

          {/* Form fields */}
          <div className="px-4 space-y-4">
            <Input
              placeholder={t('walletConnect.dialog.aliasPlaceholder')}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="bg-transparent"
            />
            <Textarea
              placeholder="nostr+walletconnect://..."
              value={connectionUri}
              onChange={(e) => setConnectionUri(e.target.value)}
              rows={3}
              className="bg-transparent resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-4 py-3">
            <Button
              onClick={handleAddConnection}
              disabled={isConnecting || !connectionUri.trim()}
              className="rounded-full px-5 font-bold"
              size="sm"
            >
              {isConnecting ? t('walletConnect.dialog.connecting') : t('walletConnect.dialog.connect')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
