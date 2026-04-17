/**
 * Wallet Balance Component
 * Displays wallet balance with refresh capability and USD/sats toggle
 *
 * Defaults to USD display. Click the dollar icon to switch to sats,
 * click the lightning icon to switch back to USD.
 */

import { useState } from "react";
import { RefreshCw, Eye, EyeOff, Bitcoin, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSparkWallet } from "@/hooks/useSparkWallet";
import { useSatsToUsd } from "@/hooks/useExchangeRate";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

type DisplayMode = "usd" | "sats";

interface WalletBalanceProps {
  className?: string;
  showRefresh?: boolean;
  compact?: boolean;
}

export function WalletBalance({
  className,
  showRefresh = true,
  compact = false,
}: WalletBalanceProps) {
  const [isHidden, setIsHidden] = useLocalStorage(
    "wallet-balance-hidden",
    false,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("usd");

  const { balance, isInitialized, isConnecting, syncWallet, isSyncing } =
    useSparkWallet();
  const usdValue = useSatsToUsd(balance);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Use syncWallet to trigger full sync including checking for new deposits
      await syncWallet();
    } catch (error) {
      logger.error("Failed to sync wallet:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const isLoading = isRefreshing || isSyncing;

  const toggleDisplayMode = () => {
    setDisplayMode((prev) => (prev === "usd" ? "sats" : "usd"));
  };

  const formatSatsBalance = (sats: number) => {
    if (isHidden) return "••••••";
    return sats.toLocaleString();
  };

  const formatUsdBalance = (usd: number | null) => {
    if (isHidden) return "••••••";
    if (usd === null) return "---";
    return usd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  if (isConnecting) {
    return (
      <Card className={className}>
        <CardContent className={compact ? "py-3" : "py-6"}>
          <Skeleton className="h-8 w-32 mx-auto" />
          <Skeleton className="h-4 w-20 mx-auto mt-2" />
        </CardContent>
      </Card>
    );
  }

  if (!isInitialized) {
    return (
      <Card className={className}>
        <CardContent className={cn("text-center", compact ? "py-3" : "py-6")}>
          <p className="text-muted-foreground text-sm">Wallet not connected</p>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 p-0"
          onClick={toggleDisplayMode}
          title={displayMode === "usd" ? "Switch to sats" : "Switch to USD"}
        >
          {displayMode === "usd" ? (
            <DollarSign className="h-4 w-4 text-primary" />
          ) : (
            <Bitcoin className="h-4 w-4 text-orange-500" />
          )}
        </Button>
        <span className="font-medium">
          {displayMode === "usd" ? (
            <>${formatUsdBalance(usdValue)}</>
          ) : (
            <>{formatSatsBalance(balance)} sats</>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsHidden(!isHidden)}
        >
          {isHidden ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3" />
          )}
        </Button>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="py-6">
        <div className="text-center">
          {/* Main balance display */}
          <div className="flex items-center justify-center gap-2 mb-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 p-0"
              onClick={toggleDisplayMode}
              title={displayMode === "usd" ? "Switch to sats" : "Switch to USD"}
            >
              {displayMode === "usd" ? (
                <DollarSign className="h-6 w-6 text-primary" />
              ) : (
                <Bitcoin className="h-6 w-6 text-orange-500" />
              )}
            </Button>
            {displayMode === "usd" ? (
              <>
                <span className="text-3xl font-bold">
                  ${formatUsdBalance(usdValue)}
                </span>
              </>
            ) : (
              <>
                <span className="text-3xl font-bold">
                  {formatSatsBalance(balance)}
                </span>
                <span className="text-lg text-muted-foreground">sats</span>
              </>
            )}
          </div>

          {/* Secondary display (shows the other unit) */}
          <div className="text-sm text-muted-foreground mb-4">
            {displayMode === "usd" ? (
              <>{formatSatsBalance(balance)} sats</>
            ) : usdValue !== null ? (
              <>≈ ${formatUsdBalance(usdValue)}</>
            ) : (
              <Skeleton className="h-4 w-16 mx-auto" />
            )}
          </div>

          {/* Syncing indicator when balance is zero */}
          {balance === 0 && isSyncing && (
            <div className="text-xs text-muted-foreground mb-2 flex items-center justify-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Syncing wallet...
            </div>
          )}

          <div className="flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsHidden(!isHidden)}
            >
              {isHidden ? (
                <>
                  <Eye className="h-4 w-4 mr-1" />
                  Show
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 mr-1" />
                  Hide
                </>
              )}
            </Button>

            {showRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw
                  className={cn("h-4 w-4 mr-1", isLoading && "animate-spin")}
                />
                {isLoading ? "Syncing..." : "Sync"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
