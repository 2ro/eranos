/**
 * TanStack Query hooks over the GoblinPay REST client (`lib/goblinPay.ts`) —
 * the in-app Grin donate flow (Plan 2, C2).
 */

import { useMutation, useQuery } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import {
  createGoblinPayInvoice,
  getGoblinPayInvoiceStatus,
  getGoblinPayPayment,
  getGoblinPayReceipt,
  submitManualSlatepack,
  type CreateInvoiceParams,
  type GoblinPayCheckout,
} from '@/lib/goblinPay';

/** Fallback Grin node for kernel lookups when the config leaves it unset. */
const DEFAULT_GRIN_NODE_URL = 'https://api.grin.money';

/** Resolved Grin-payments configuration for this Eranos instance. */
export interface GrinPayConfig {
  /** GoblinPay base URL, or `undefined` when the GoblinPay path is disabled. */
  goblinPayUrl?: string;
  /** GoblinPay API token (needed for create-invoice; may be unset). */
  goblinPayApiToken?: string;
  /** Grin node for read-only kernel lookups (always resolved). */
  grinNodeUrl: string;
}

/** Read the instance's Grin-payments config from the app config. */
export function useGrinPayConfig(): GrinPayConfig {
  const { config } = useAppContext();
  const goblinPayUrl = config.goblinPayUrl?.trim().replace(/\/+$/, '') || undefined;
  return {
    goblinPayUrl,
    goblinPayApiToken: config.goblinPayApiToken?.trim() || undefined,
    grinNodeUrl: config.grinNodeUrl?.trim().replace(/\/+$/, '') || DEFAULT_GRIN_NODE_URL,
  };
}

/** Create a GoblinPay invoice (requires `goblinPayUrl` + `goblinPayApiToken`). */
export function useCreateGrinInvoice() {
  const { goblinPayUrl, goblinPayApiToken } = useGrinPayConfig();

  return useMutation({
    mutationFn: async (params: CreateInvoiceParams): Promise<GoblinPayCheckout> => {
      if (!goblinPayUrl) throw new Error('GoblinPay is not configured on this instance');
      if (!goblinPayApiToken) throw new Error('GoblinPay API token is not configured');
      return createGoblinPayInvoice(goblinPayUrl, goblinPayApiToken, params);
    },
  });
}

/**
 * Poll an invoice's live status (public-by-token). Polls every 4s while the
 * invoice is `open`; stops once it is `paid`/`expired` or `enabled` is false
 * (e.g. dialog closed).
 */
export function useGrinInvoiceStatus(token: string | undefined, enabled: boolean) {
  const { goblinPayUrl } = useGrinPayConfig();

  return useQuery({
    queryKey: ['goblinpay-invoice-status', goblinPayUrl, token],
    queryFn: async (c) => {
      if (!goblinPayUrl || !token) throw new Error('missing invoice');
      return getGoblinPayInvoiceStatus(goblinPayUrl, token, fetch, c.signal);
    },
    enabled: enabled && !!goblinPayUrl && !!token,
    refetchInterval: (query) => (query.state.data?.status === 'open' ? 4000 : false),
    staleTime: 0,
  });
}

/**
 * Poll a payment's status (received → replied → confirmed). Polls every 10s
 * until confirmed.
 */
export function useGrinPayment(paymentId: string | null | undefined, enabled: boolean) {
  const { goblinPayUrl } = useGrinPayConfig();

  return useQuery({
    queryKey: ['goblinpay-payment', goblinPayUrl, paymentId],
    queryFn: async (c) => {
      if (!goblinPayUrl || !paymentId) throw new Error('missing payment');
      return getGoblinPayPayment(goblinPayUrl, paymentId, fetch, c.signal);
    },
    enabled: enabled && !!goblinPayUrl && !!paymentId,
    refetchInterval: (query) => (query.state.data?.status === 'confirmed' ? false : 10_000),
    staleTime: 0,
  });
}

/**
 * Fetch a payment's server-signed receipt. `raw` is the verbatim response
 * body — this is what gets published in a kind-3414 donation event so the
 * BIP-340 signature verifies byte-for-byte for every reader.
 */
export function useGrinReceipt(paymentId: string | null | undefined, enabled: boolean) {
  const { goblinPayUrl } = useGrinPayConfig();

  return useQuery({
    queryKey: ['goblinpay-receipt', goblinPayUrl, paymentId],
    queryFn: async (c) => {
      if (!goblinPayUrl || !paymentId) throw new Error('missing payment');
      return getGoblinPayReceipt(goblinPayUrl, paymentId, fetch, c.signal);
    },
    enabled: enabled && !!goblinPayUrl && !!paymentId,
    staleTime: Infinity,
    retry: 2,
  });
}

/** Manual slatepack fallback: paste S1, get the S2 armor back to finalize. */
export function useManualSlatepack() {
  const { goblinPayUrl } = useGrinPayConfig();

  return useMutation({
    mutationFn: async ({ token, s1 }: { token: string; s1: string }): Promise<string> => {
      if (!goblinPayUrl) throw new Error('GoblinPay is not configured on this instance');
      return submitManualSlatepack(goblinPayUrl, token, s1);
    },
  });
}
