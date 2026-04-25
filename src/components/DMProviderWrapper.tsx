import { type ReactNode, useCallback, useMemo } from "react";
import { DMProvider } from "@samthomson/nostr-messaging/core";
import { DEFAULT_NEW_MESSAGE_SOUNDS } from "@samthomson/nostr-messaging/core";
import type { NostrEvent } from "@nostrify/nostrify";
import { useNostr } from "@nostrify/react";
import { toast } from "@/hooks/useToast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useUploadFile } from "@/hooks/useUploadFile";
import { useProfileSupplementary } from "@/hooks/useProfileData";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getDisplayName } from "@/lib/getDisplayName";
import { useAuthors } from "@/hooks/useAuthors";

interface DMProviderWrapperProps {
  children: ReactNode;
}

export function DMProviderWrapper({ children }: DMProviderWrapperProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFileMutation } = useUploadFile();
  const isMobile = useIsMobile();

  const { data: profileData } = useProfileSupplementary(user?.pubkey);
  const follows = useMemo(() => profileData?.following ?? [], [profileData]);

  const handlePublishEvent = useCallback(async (
    event: Omit<NostrEvent, "id" | "pubkey" | "sig">,
  ): Promise<void> => {
    await publishEvent(event);
  }, [publishEvent]);

  const handleUploadFile = useCallback(async (file: File): Promise<string> => {
    const tags = await uploadFileMutation(file);
    return tags[0][1] ?? "";
  }, [uploadFileMutation]);

  const handleGetDisplayName = useCallback((
    pubkey: string,
    metadata?: Parameters<typeof getDisplayName>[0],
  ) => {
    return getDisplayName(metadata, pubkey);
  }, []);

  const handleNotify = useCallback((options: { title?: string; description?: string; variant?: "default" | "destructive" }) => {
    toast(options);
  }, []);

  const messaging = useMemo(() => config.messaging ?? {}, [config.messaging]);

  const discoveryRelays = useMemo(() => {
    if (messaging.discoveryRelays?.length) {
      return messaging.discoveryRelays;
    }

    return config.relayMetadata.relays
      .filter((relay) => relay.read)
      .map((relay) => relay.url);
  }, [messaging.discoveryRelays, config.relayMetadata.relays]);

  const relayMode = messaging.relayMode ?? "hybrid";
  const protocolMode = messaging.protocolMode;
  const messagingEnabled = messaging.enabled ?? true;
  const renderInlineMedia = messaging.renderInlineMedia ?? true;
  const soundEnabled = messaging.soundEnabled ?? false;
  const soundId = messaging.soundId ?? DEFAULT_NEW_MESSAGE_SOUNDS[0]?.id ?? "";
  const devMode = messaging.devMode ?? false;

  const messagingConfig = useMemo(() => ({
    enabled: messagingEnabled,
    discoveryRelays,
    relayMode,
    protocolMode,
    renderInlineMedia,
    devMode,
    appName: config.appName,
    appDescription: `Direct messages on ${config.appName}`,
    soundPref: {
      options: DEFAULT_NEW_MESSAGE_SOUNDS,
      value: { enabled: soundEnabled, soundId },
      onChange: () => {},
    },
  }), [
    messagingEnabled,
    discoveryRelays,
    relayMode,
    protocolMode,
    renderInlineMedia,
    devMode,
    config.appName,
    soundEnabled,
    soundId,
  ]);

  const uiConfig = useMemo(() => ({
    showShorts: false,
    showSearch: true,
    isMobile,
  }), [isMobile]);

  return (
    <DMProvider
      nostr={nostr}
      user={user ?? null}
      messagingConfig={messagingConfig}
      onNotify={handleNotify}
      getDisplayName={handleGetDisplayName}
      fetchAuthorsBatch={useAuthors}
      publishEvent={handlePublishEvent}
      uploadFile={handleUploadFile}
      follows={follows}
      ui={uiConfig}
    >
      {children}
    </DMProvider>
  );
}
