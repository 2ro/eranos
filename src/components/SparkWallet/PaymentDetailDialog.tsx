import { useState } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Zap,
  User,
  Clock,
  Hash,
  FileText,
  ExternalLink,
  Copy,
  Check,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Fingerprint,
} from 'lucide-react';
import { useEnrichedPayment } from '@/hooks/usePaymentContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useToast } from '@/hooks/useToast';
import { getDisplayName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import type { BreezPaymentInfo } from '@/lib/spark/breezService';
import { format } from 'date-fns';

interface PaymentDetailDialogProps {
  payment: BreezPaymentInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailRow({
  label,
  value,
  copyValue,
  icon: Icon,
  copyable = false,
  className
}: {
  label: string;
  value: string | number;
  copyValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  copyable?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyValue ?? String(value));
    setCopied(true);
    toast({ title: 'Copied', description: `${label} copied to clipboard` });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("flex items-start justify-between gap-4 py-2", className)}>
      <div className="flex items-center gap-2 text-muted-foreground min-w-0">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-right break-all">{value}</span>
        {copyable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export function PaymentDetailDialog({ payment, open, onOpenChange }: PaymentDetailDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { context, author } = useEnrichedPayment(payment);

  if (!payment) return null;

  const isReceived = payment.paymentType === 'receive';
  const isZap = context?.isZap && !isReceived;
  const targetEvent = context?.targetEvent;
  const targetProfile = context?.targetProfile;
  const metadata = author?.metadata;
  const zapRequest = context?.zapRequest;

  // Generate target link
  let targetLink: string | undefined;
  let targetNip19: string | undefined;

  if (isZap && targetEvent) {
    targetNip19 = nip19.noteEncode(targetEvent.id);
    targetLink = `/${targetNip19}`;
  } else if (isZap && targetProfile) {
    targetNip19 = nip19.npubEncode(targetProfile);
    targetLink = `/${targetNip19}`;
  }

  const displayName = getDisplayName(metadata, targetProfile || targetEvent?.pubkey || '');
  const lightningAddress = metadata?.lud16 || metadata?.lud06;

  // Extract comment from zap request
  const zapComment = zapRequest?.tags.find(([name]) => name === 'comment')?.[1];

  const content = (
    <ScrollArea className="max-h-[60vh] px-1">
      <div className="space-y-6">
        {/* Payment Type Header */}
        <Card className={cn(
          "border-2",
          isReceived ? "bg-primary/5 dark:bg-primary/10 border-primary/30 dark:border-primary/40" : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
        )}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  isReceived ? "bg-primary/10 text-primary" : "bg-red-100 text-red-600"
                )}>
                  {isReceived ? (
                    <ArrowDownLeft className="h-6 w-6" />
                  ) : (
                    <ArrowUpRight className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-lg">
                    {isReceived ? "Received" : isZap ? "Zapped" : "Sent"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(payment.timestamp * 1000, 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn(
                  "text-2xl font-bold",
                  isReceived ? "text-primary" : "text-red-600"
                )}>
                  {isReceived ? "+" : "-"}{payment.amount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">sats</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Zap Target Information */}
        {isZap && (targetEvent || targetProfile) && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Zap Target
            </h3>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={metadata?.picture} />
                    <AvatarFallback>
                      <User className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{displayName}</p>
                    {lightningAddress && (
                      <p className="text-xs text-muted-foreground truncate">
                        ⚡ {lightningAddress}
                      </p>
                    )}
                    {metadata?.nip05 && (
                      <p className="text-xs text-muted-foreground truncate">
                        ✓ {metadata.nip05}
                      </p>
                    )}
                  </div>
                </div>

                {targetLink && (
                  <Link to={targetLink}>
                    <Button variant="outline" className="w-full gap-2" size="sm">
                      <ExternalLink className="h-4 w-4" />
                      View {targetEvent ? 'Post' : 'Profile'}
                    </Button>
                  </Link>
                )}

                {zapComment && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Your message:</p>
                    <p className="text-sm italic">"{zapComment}"</p>
                  </div>
                )}

                {targetEvent && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Submission preview:</p>
                    <p className="text-sm line-clamp-3">{targetEvent.content}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Technical Details */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Technical Details
          </h3>
          <Card>
            <CardContent className="pt-4 pb-4 space-y-0 divide-y">
              <DetailRow
                label="Payment ID"
                value={payment.id}
                icon={Fingerprint}
                copyable
              />
              <DetailRow
                label="Amount"
                value={`${payment.amount.toLocaleString()} sats`}
                icon={Zap}
              />
              {payment.fees > 0 && (
                <DetailRow
                  label="Fees"
                  value={`${payment.fees.toLocaleString()} sats`}
                  icon={Receipt}
                />
              )}
              <DetailRow
                label="Type"
                value={payment.paymentType === 'receive' ? 'Received' : 'Sent'}
                icon={isReceived ? ArrowDownLeft : ArrowUpRight}
              />
              <DetailRow
                label="Status"
                value={payment.status}
                icon={Clock}
              />
              <DetailRow
                label="Timestamp"
                value={format(payment.timestamp * 1000, 'PPpp')}
                icon={Clock}
              />
              {payment.paymentHash && (
                <DetailRow
                  label="Payment Hash"
                  value={payment.paymentHash.slice(0, 16) + '...' + payment.paymentHash.slice(-16)}
                  copyValue={payment.paymentHash}
                  icon={Hash}
                  copyable
                />
              )}
              {payment.preimage && (
                <DetailRow
                  label="Preimage"
                  value={payment.preimage.slice(0, 16) + '...' + payment.preimage.slice(-16)}
                  copyValue={payment.preimage}
                  icon={Fingerprint}
                  copyable
                />
              )}
              {payment.description && !isZap && (
                <DetailRow
                  label="Description"
                  value={payment.description}
                  icon={FileText}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Zap Request Details (if available) */}
        {isZap && zapRequest && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Zap Request Details
            </h3>
            <Card>
              <CardContent className="pt-4 pb-4 space-y-0 divide-y">
                <DetailRow
                  label="Event ID"
                  value={zapRequest.id.slice(0, 16) + '...' + zapRequest.id.slice(-16)}
                  icon={Hash}
                  copyable
                />
                <DetailRow
                  label="Created At"
                  value={format(zapRequest.created_at * 1000, 'PPpp')}
                  icon={Clock}
                />
                <DetailRow
                  label="Sender"
                  value={nip19.npubEncode(zapRequest.pubkey).slice(0, 16) + '...'}
                  icon={User}
                  copyable
                />
                {targetEvent && (
                  <DetailRow
                    label="Zapped Event"
                    value={targetEvent.id.slice(0, 16) + '...' + targetEvent.id.slice(-16)}
                    icon={FileText}
                    copyable
                  />
                )}
                {targetProfile && (
                  <DetailRow
                    label="Zapped Profile"
                    value={nip19.npubEncode(targetProfile).slice(0, 16) + '...'}
                    icon={User}
                    copyable
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Invoice (if available) */}
        {payment.invoice && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Lightning Invoice
            </h3>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="relative">
                  <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-x-auto break-all whitespace-pre-wrap">
                    {payment.invoice}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={async () => {
                      await navigator.clipboard.writeText(payment.invoice!);
                      toast({ 
                        title: 'Copied', 
                        description: 'Invoice copied to clipboard' 
                      });
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ScrollArea>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Payment Details
            </DrawerTitle>
            <DrawerDescription>
              Transaction information
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payment Details
          </DialogTitle>
          <DialogDescription>
            Transaction information
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
