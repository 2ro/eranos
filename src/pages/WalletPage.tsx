/**
 * Wallet Page
 * Main wallet interface with balance, send, receive, and history.
 *
 * Ported from the legacy Agora (pathos) Wallet page. PageLayout is replaced
 * with the agora-3 PageHeader + a 2xl content container.
 */

import { useState, useEffect, type ReactNode } from "react";
import { useSeoMeta } from "@unhead/react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet as WalletIcon,
  Plus,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CreateWallet,
  RestoreWallet,
  WalletBalance,
  ReceivePayment,
  SendPayment,
  PaymentHistory,
  UnclaimedDeposits,
  WasmUnsupportedError,
} from "@/components/SparkWallet";
import { WalletLockScreen } from "@/components/SparkWallet/WalletLockScreen";
import { useSparkWallet } from "@/hooks/useSparkWallet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { LoginArea } from "@/components/auth/LoginArea";
import { PageHeader } from "@/components/PageHeader";
import { checkWasmSupport } from "@/lib/checkWasmSupport";

type SetupMode = "choice" | "create" | "restore" | null;

function WalletShell({ children }: { children: ReactNode }) {
  return (
    <main>
      <PageHeader title="Wallet" icon={<WalletIcon className="size-5" />} />
      <div className="max-w-2xl mx-auto px-4 py-4 sm:py-6">{children}</div>
    </main>
  );
}

export function WalletPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const [setupMode, setSetupMode] = useState<SetupMode>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [wasmSupported, setWasmSupported] = useState<boolean | null>(null);
  const [wasmError, setWasmError] = useState<string | null>(null);

  const { hasWallet, balance, hasBackup, isCheckingBackup, isLocked } =
    useSparkWallet();
  const { user } = useCurrentUser();

  useEffect(() => {
    checkWasmSupport().then((result) => {
      setWasmSupported(result.supported);
      if (!result.supported) {
        setWasmError(result.reason || "WebAssembly is not supported");
      }
    });
  }, []);

  useSeoMeta({
    title: `${t("wallet.title")} | ${config.appName}`,
    description:
      "Manage your self-custodial Lightning wallet. Send and receive Bitcoin payments instantly.",
  });

  if (wasmSupported === null) {
    return (
      <WalletShell>
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Checking browser compatibility...
              </p>
            </div>
          </CardContent>
        </Card>
      </WalletShell>
    );
  }

  if (wasmSupported === false) {
    return (
      <WalletShell>
        <WasmUnsupportedError technicalDetails={wasmError ?? undefined} />
      </WalletShell>
    );
  }

  if (!user) {
    return (
      <WalletShell>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                <WalletIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Wallet</h3>
              <p className="text-muted-foreground">
                You need to be logged in with your Nostr account to create or
                access your wallet.
              </p>
              <LoginArea className="justify-center" />
            </div>
          </CardContent>
        </Card>
      </WalletShell>
    );
  }

  if (hasWallet && isLocked) {
    return (
      <WalletShell>
        <WalletLockScreen />
      </WalletShell>
    );
  }

  if (!hasWallet || setupMode === "create" || setupMode === "restore") {
    if (setupMode === "create") {
      return (
        <WalletShell>
          <CreateWallet
            onComplete={() => setSetupMode(null)}
            onCancel={() => setSetupMode("choice")}
          />
        </WalletShell>
      );
    }

    if (setupMode === "restore") {
      return (
        <WalletShell>
          <RestoreWallet
            onComplete={() => setSetupMode(null)}
            onCancel={() => setSetupMode("choice")}
          />
        </WalletShell>
      );
    }

    return (
      <WalletShell>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <WalletIcon className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>{t('wallet.title')}</CardTitle>
            <CardDescription>{t('wallet.selfCustodialWallet')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isCheckingBackup ? (
              <div className="py-4 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('wallet.checkingBackup')}
                </p>
              </div>
            ) : hasBackup ? (
              <>
                <Card className="bg-muted/50 border-dashed">
                  <CardContent className="py-4 text-center">
                    <p className="text-sm font-medium">
                      {t('wallet.backupFound')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('wallet.canRestore')}
                    </p>
                  </CardContent>
                </Card>

                <Button
                  onClick={() => setSetupMode("restore")}
                  className="w-full"
                  size="lg"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('wallet.restoreExistingWallet')}
                </Button>

                <Button
                  onClick={() => setSetupMode("create")}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('wallet.createNewWallet')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => setSetupMode("create")}
                  className="w-full"
                  size="lg"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('wallet.createNewWallet')}
                </Button>

                <Button
                  onClick={() => setSetupMode("restore")}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('wallet.restoreExistingWallet')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </WalletShell>
    );
  }

  return (
    <WalletShell>
      <WalletBalance className="mb-6" />

      <UnclaimedDeposits className="mb-6" />

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Button
          size="lg"
          className="h-16 text-lg"
          onClick={() => setActiveTab("receive")}
        >
          <ArrowDownLeft className="h-5 w-5 mr-2" />
          Receive
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-16 text-lg"
          onClick={() => setActiveTab("send")}
          disabled={balance === 0}
        >
          <ArrowUpRight className="h-5 w-5 mr-2" />
          Send
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">{t('wallet.transactions')}</TabsTrigger>
          <TabsTrigger value="receive">Receive</TabsTrigger>
          <TabsTrigger value="send">Send</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <PaymentHistory />
        </TabsContent>

        <TabsContent value="receive" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Receive Payment</CardTitle>
              <CardDescription>
                Choose how you want to receive funds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReceivePayment />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="send" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Send Payment</CardTitle>
              <CardDescription>
                Send Lightning payments to anyone
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SendPayment onSuccess={() => setActiveTab("overview")} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </WalletShell>
  );
}

export default WalletPage;
