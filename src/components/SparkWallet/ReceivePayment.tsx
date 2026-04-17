/**
 * Receive Payment Component
 * Shows QR codes and addresses for receiving payments
 * Auto-detects when invoice is paid via SDK events
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Check,
  Zap,
  Bitcoin,
  Loader2,
  CheckCircle2,
  RefreshCw,
  AtSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSparkWallet } from "@/hooks/useSparkWallet";
import { useToast } from "@/hooks/useToast";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import type { SdkEvent } from "@breeztech/breez-sdk-spark/web";

interface ReceivePaymentProps {
  defaultAmount?: number;
  onClose?: () => void;
}

export function ReceivePayment({
  defaultAmount,
  onClose,
}: ReceivePaymentProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("lightning");
  const [amount, setAmount] = useState(defaultAmount?.toString() ?? "");
  const [description, setDescription] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [bitcoinAddress, setBitcoinAddress] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);

  const {
    createInvoice,
    getBitcoinAddress,
    isInitialized,
    subscribeToPaymentEvents,
    refreshBalance,
    lightningAddress,
    getLightningAddress,
  } = useSparkWallet();
  const { toast } = useToast();

  // Fetch addresses on mount
  useEffect(() => {
    if (isInitialized) {
      getBitcoinAddress().then(setBitcoinAddress).catch(console.error);
      // Fetch lightning address if not already loaded
      if (!lightningAddress) {
        getLightningAddress();
      }
    }
  }, [isInitialized, getBitcoinAddress, lightningAddress, getLightningAddress]);

  // Subscribe to payment events to detect when invoice is paid
  useEffect(() => {
    if (!isInitialized || !invoice) return;

    const handlePaymentEvent = (event: SdkEvent) => {
      console.log("[ReceivePayment] Got SDK event:", event.type);

      if (event.type === "paymentSucceeded") {
        // A payment was received! Check if it matches our invoice amount
        const receivedAmount = parseInt(amount);

        // Show paid state
        setIsPaid(true);
        setPaidAmount(receivedAmount);

        // Refresh balance
        refreshBalance();

        // Show success toast
        toast({
          title: "Payment received!",
          description: `You received ${receivedAmount.toLocaleString()} sats`,
        });
      }
    };

    const unsubscribe = subscribeToPaymentEvents(handlePaymentEvent);

    return () => {
      unsubscribe();
    };
  }, [
    isInitialized,
    invoice,
    amount,
    subscribeToPaymentEvents,
    refreshBalance,
    toast,
  ]);

  // Generate QR code when content changes
  useEffect(() => {
    const generateQR = async () => {
      let content: string | null = null;

      if (activeTab === "lightning" && invoice) {
        content = invoice;
      } else if (activeTab === "lnaddress" && lightningAddress) {
        content = lightningAddress;
      } else if (activeTab === "bitcoin" && bitcoinAddress) {
        content = bitcoinAddress;
      }

      if (content) {
        try {
          const url = await QRCode.toDataURL(content.toUpperCase(), {
            width: 256,
            margin: 2,
            color: { dark: "#000000", light: "#FFFFFF" },
          });
          setQrCodeUrl(url);
        } catch (error) {
          console.error("Failed to generate QR code:", error);
        }
      } else {
        setQrCodeUrl(null);
      }
    };

    generateQR();
  }, [activeTab, invoice, lightningAddress, bitcoinAddress]);

  const handleGenerateInvoice = async () => {
    const amountSat = parseInt(amount);
    if (!amountSat || amountSat <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount in sats",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const newInvoice = await createInvoice(
        amountSat,
        description || "Payment",
      );
      setInvoice(newInvoice);
    } catch (error) {
      toast({
        title: "Failed to create invoice",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const getCurrentAddress = () => {
    if (activeTab === "lightning") return invoice;
    if (activeTab === "lnaddress") return lightningAddress;
    if (activeTab === "bitcoin") return bitcoinAddress;
    return null;
  };

  const currentAddress = getCurrentAddress();

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lightning">
            <Zap className="h-4 w-4 mr-1" />
            Invoice
          </TabsTrigger>
          <TabsTrigger value="lnaddress">
            <AtSign className="h-4 w-4 mr-1" />
            Address
          </TabsTrigger>
          <TabsTrigger value="bitcoin">
            <Bitcoin className="h-4 w-4 mr-1" />
            Bitcoin
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lightning" className="space-y-4 mt-4">
          {isPaid ? (
            // Payment received - show success state
            <div className="space-y-4">
              <div className="text-center py-8">
                <div className="flex justify-center mb-4">
                  <div className="rounded-full bg-primary/10 p-4">
                    <CheckCircle2 className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">
                  Payment Received!
                </h3>
                <p className="text-3xl font-bold mb-1">
                  {(paidAmount ?? parseInt(amount)).toLocaleString()} sats
                </p>
                {description && (
                  <p className="text-muted-foreground text-sm">{description}</p>
                )}
              </div>
              <Button
                onClick={() => {
                  setIsPaid(false);
                  setPaidAmount(null);
                  setInvoice(null);
                  setAmount("");
                  setDescription("");
                }}
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Receive Another Payment
              </Button>
            </div>
          ) : !invoice ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="amount">{t('wallet2.amount')} (sats)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  placeholder={t('forms.enterAmount')}
                />
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this payment for?"
                />
              </div>
              <Button
                onClick={handleGenerateInvoice}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  t('wallet2.generateInvoice')
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  Waiting for payment...
                </p>
                <p className="text-2xl font-bold">
                  {parseInt(amount).toLocaleString()} sats
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setInvoice(null)}
                className="w-full"
              >
                Create New Invoice
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="lnaddress" className="mt-4">
          {lightningAddress ? (
            <p className="text-sm text-muted-foreground text-center mb-4">
              Share your Lightning Address to receive payments
            </p>
          ) : (
            <div className="space-y-4">
              <Alert>
                <AtSign className="h-4 w-4" />
                <AlertDescription>
                  You don't have a Lightning Address yet. Set one up in wallet
                  settings to receive payments easily.
                </AlertDescription>
              </Alert>
              <Link to="/settings?tab=wallet">
                <Button variant="outline" className="w-full">
                  Set Up Lightning Address
                </Button>
              </Link>
            </div>
          )}
        </TabsContent>

        <TabsContent value="bitcoin" className="mt-4">
          <p className="text-sm text-muted-foreground text-center mb-4">
            Receive on-chain Bitcoin (may take longer to confirm)
          </p>
        </TabsContent>
      </Tabs>

      {/* QR Code Display - hide when paid */}
      {!isPaid && (currentAddress || qrCodeUrl) && (
        <Card>
          <CardContent className="pt-4">
            {qrCodeUrl ? (
              <div className="flex justify-center">
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="w-48 h-48 bg-muted animate-pulse rounded" />
              </div>
            )}

            {currentAddress && (
              <div className="mt-4 space-y-2">
                <Input
                  value={currentAddress}
                  readOnly
                  className="font-mono text-xs"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  onClick={() => handleCopy(currentAddress)}
                  className="w-full"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-primary" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Address
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {onClose && (
        <Button variant="ghost" onClick={onClose} className="w-full">
          Close
        </Button>
      )}
    </div>
  );
}
