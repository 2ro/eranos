import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { RequestToVanishDialog } from '@/components/RequestToVanishDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { DEFAULT_SYSTEM_PROMPT_TEMPLATE } from '@/lib/aiChatSystemPrompt';

/** Hardcoded default values for Agent provider fields. Used for reset buttons. */
const DEFAULT_AI_BASE_URL = 'https://ai.shakespeare.diy/v1';
const DEFAULT_AI_MODEL = 'google/gemma-4-26b';

/** Build-time default translation worker URL from the environment variable. */
const DEFAULT_TRANSLATE_WORKER_URL = import.meta.env.VITE_TRANSLATE_WORKER_URL || '';

/** The build-time default DSN from the environment variable. */
const DEFAULT_SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function AdvancedSettings() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const [systemOpen, setSystemOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [sentryOpen, setSentryOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [vanishDialogOpen, setVanishDialogOpen] = useState(false);
  const [statsPubkey, setStatsPubkey] = useState(config.nip85StatsPubkey);
  const [faviconUrl, setFaviconUrl] = useState(config.faviconUrl);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState(config.linkPreviewUrl);
  const [corsProxy, setCorsProxy] = useState(config.corsProxy);
  const [translateWorkerUrl, setTranslateWorkerUrl] = useState(config.translateWorkerUrl);
  const [sentryDsn, setSentryDsn] = useState(config.sentryDsn);
  const [baseUrlDraft, setBaseUrlDraft] = useState(config.aiBaseURL);
  const [apiKeyDraft, setApiKeyDraft] = useState(config.aiApiKey);
  const [modelDraft, setModelDraft] = useState(config.aiModel);
  const [showApiKey, setShowApiKey] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState(config.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT_TEMPLATE);

  useEffect(() => { setBaseUrlDraft(config.aiBaseURL); }, [config.aiBaseURL]);
  useEffect(() => { setApiKeyDraft(config.aiApiKey); }, [config.aiApiKey]);
  useEffect(() => { setModelDraft(config.aiModel); }, [config.aiModel]);

  const commitBaseUrl = () => {
    const trimmed = baseUrlDraft.trim().replace(/\/+$/, '');
    if (!trimmed) {
      setBaseUrlDraft(DEFAULT_AI_BASE_URL);
      if (config.aiBaseURL !== DEFAULT_AI_BASE_URL) {
        updateConfig((current) => ({ ...current, aiBaseURL: DEFAULT_AI_BASE_URL }));
        toast({ title: 'Base URL reset to default' });
      }
      return;
    }
    if (trimmed !== config.aiBaseURL) {
      updateConfig((current) => ({ ...current, aiBaseURL: trimmed }));
      toast({ title: 'AI base URL updated' });
    }
  };

  const commitApiKey = () => {
    const trimmed = apiKeyDraft.trim();
    if (trimmed !== config.aiApiKey) {
      updateConfig((current) => ({ ...current, aiApiKey: trimmed }));
      toast({ title: trimmed ? 'API key updated' : 'API key cleared (using NIP-98 auth)' });
    }
  };

  const commitModel = () => {
    const trimmed = modelDraft.trim();
    if (!trimmed) {
      setModelDraft(DEFAULT_AI_MODEL);
      if (config.aiModel !== DEFAULT_AI_MODEL) {
        updateConfig((current) => ({ ...current, aiModel: DEFAULT_AI_MODEL }));
        toast({ title: 'AI model reset to default' });
      }
      return;
    }
    if (trimmed !== config.aiModel) {
      updateConfig((current) => ({ ...current, aiModel: trimmed }));
      toast({ title: 'AI model updated' });
    }
  };

  const resetProviderDefaults = () => {
    setBaseUrlDraft(DEFAULT_AI_BASE_URL);
    setApiKeyDraft('');
    setModelDraft(DEFAULT_AI_MODEL);
    updateConfig((current) => ({
      ...current,
      aiBaseURL: DEFAULT_AI_BASE_URL,
      aiApiKey: '',
      aiModel: DEFAULT_AI_MODEL,
    }));
    toast({ title: 'Provider settings reset to defaults' });
  };

  const providerIsDefault =
    config.aiBaseURL === DEFAULT_AI_BASE_URL &&
    config.aiApiKey === '' &&
    config.aiModel === DEFAULT_AI_MODEL;

  const handleStatsPubkeyChange = (value: string) => {
    setStatsPubkey(value);
    if (value.length === 64 && /^[0-9a-f]{64}$/i.test(value)) {
      updateConfig(() => ({ nip85StatsPubkey: value.toLowerCase() }));
      toast({ title: 'Stats source updated', description: 'Using NIP-85 stats from this pubkey.' });
    } else if (value.length === 0) {
      updateConfig(() => ({ nip85StatsPubkey: '' }));
      toast({ title: 'Stats source cleared' });
    }
  };

  return (
    <div>
      {/* Agent Section */}
      <div>
        <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">Agent</span>
              {aiOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pt-3 pb-4 space-y-5 border-b border-border">

              {/* AI Base URL */}
              <div>
                <Label htmlFor="ai-base-url" className="text-sm font-medium">
                  Base URL
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  OpenAI-compatible <code className="bg-muted px-1 rounded">/v1</code> endpoint. An API key is required for endpoints that don't support NIP-98 auth.
                </p>
                <Input
                  id="ai-base-url"
                  type="url"
                  value={baseUrlDraft}
                  onChange={(e) => setBaseUrlDraft(e.target.value)}
                  onBlur={commitBaseUrl}
                  placeholder={DEFAULT_AI_BASE_URL}
                  className="font-mono text-base md:text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* API Key */}
              <div>
                <Label htmlFor="ai-api-key" className="text-sm font-medium">
                  API key
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Optional. Required for endpoints that use standard API-key auth (e.g. OpenAI, Anthropic, OpenRouter).
                </p>
                <div className="flex gap-2">
                  <Input
                    id="ai-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyDraft}
                    onChange={(e) => setApiKeyDraft(e.target.value)}
                    onBlur={commitApiKey}
                    placeholder="Leave empty to use NIP-98 auth"
                    className="font-mono text-base md:text-sm"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey((value) => !value)}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* AI Model */}
              <div>
                <Label htmlFor="ai-model" className="text-sm font-medium">
                  Model
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Model ID sent to the provider (e.g. <code className="bg-muted px-1 rounded">google/gemma-4-26b</code>, <code className="bg-muted px-1 rounded">claude-opus-4.6</code>, <code className="bg-muted px-1 rounded">gpt-4o</code>).
                </p>
                <Input
                  id="ai-model"
                  type="text"
                  value={modelDraft}
                  onChange={(e) => setModelDraft(e.target.value)}
                  onBlur={commitModel}
                  placeholder={DEFAULT_AI_MODEL}
                  className="font-mono text-base md:text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
                {!providerIsDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground mt-2"
                    onClick={resetProviderDefaults}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset provider to default
                  </Button>
                )}
              </div>

              {/* AI System Prompt */}
              <div>
                <Label htmlFor="ai-system-prompt" className="text-sm font-medium">
                  System Prompt
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  The base system prompt sent to the AI. Supports <code className="bg-muted px-1 rounded">{'{{SAVED_FEEDS}}'}</code> and <code className="bg-muted px-1 rounded">{'{{USER_IDENTITY}}'}</code> placeholders.
                </p>
                <Textarea
                  id="ai-system-prompt"
                  value={systemPromptDraft}
                  onChange={(e) => setSystemPromptDraft(e.target.value)}
                  onBlur={() => {
                    const trimmed = systemPromptDraft.trim();
                    const defaultPrompt = DEFAULT_SYSTEM_PROMPT_TEMPLATE;
                    // If the user reverted back to the default text, store empty (meaning "use default")
                    const valueToStore = trimmed === defaultPrompt ? '' : trimmed;
                    if (valueToStore !== config.aiSystemPrompt) {
                      updateConfig(() => ({ aiSystemPrompt: valueToStore }));
                      toast({ title: valueToStore ? 'System prompt updated' : 'System prompt reset to default' });
                    }
                  }}
                  className="min-h-[120px] max-h-[400px] resize-y font-mono text-base leading-relaxed"
                />
                {config.aiSystemPrompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground mt-2"
                    onClick={() => {
                      setSystemPromptDraft(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
                      updateConfig(() => ({ aiSystemPrompt: '' }));
                      toast({ title: 'System prompt reset to default' });
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to default
                  </Button>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* System Section (includes Stats Source) */}
      <div>
        <Collapsible open={systemOpen} onOpenChange={setSystemOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">System</span>
              {systemOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pt-3 pb-4 space-y-5">

              {/* Stats Source */}
              <div>
                <Label htmlFor="stats-pubkey" className="text-sm font-medium">
                  NIP-85 Stats Pubkey
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Trusted pubkey for pre-computed engagement stats (likes, reposts, comments).
                </p>
                <Input
                  id="stats-pubkey"
                  value={statsPubkey}
                  onChange={(e) => handleStatsPubkeyChange(e.target.value)}
                  placeholder="Enter 64-character hex pubkey"
                  className="font-mono text-base md:text-sm"
                  maxLength={64}
                />
                {statsPubkey && statsPubkey.length !== 64 && (
                  <p className="text-xs text-destructive mt-1">
                    Pubkey must be exactly 64 hexadecimal characters
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea</span>
                </div>
              </div>

              {/* Favicon URL */}
              <div>
                <Label htmlFor="favicon-url" className="text-sm font-medium">
                  Favicon URL
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  URI template for fetching site favicons. Supports RFC 6570 variables: <code className="bg-muted px-1 rounded">{'{href}'}</code>, <code className="bg-muted px-1 rounded">{'{hostname}'}</code>, <code className="bg-muted px-1 rounded">{'{origin}'}</code>, etc.
                </p>
                <Input
                  id="favicon-url"
                  value={faviconUrl}
                  onChange={(e) => setFaviconUrl(e.target.value)}
                  onBlur={async () => {
                    const trimmed = faviconUrl.trim();
                    if (trimmed && trimmed !== config.faviconUrl) {
                      updateConfig(() => ({ faviconUrl: trimmed }));
                      if (user) await updateSettings.mutateAsync({ faviconUrl: trimmed });
                      toast({ title: 'Favicon URL updated' });
                    }
                  }}
                  placeholder="https://ditto.pub/api/favicon/{hostname}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://ditto.pub/api/favicon/{'{hostname}'}</span>
                </div>
              </div>

              {/* Link Preview URL */}
              <div>
                <Label htmlFor="link-preview-url" className="text-sm font-medium">
                  Link Preview URL
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  URI template for fetching link previews (returns OEmbed JSON). Supports RFC 6570 variables: <code className="bg-muted px-1 rounded">{'{url}'}</code>, <code className="bg-muted px-1 rounded">{'{hostname}'}</code>, <code className="bg-muted px-1 rounded">{'{origin}'}</code>, etc.
                </p>
                <Input
                  id="link-preview-url"
                  value={linkPreviewUrl}
                  onChange={(e) => setLinkPreviewUrl(e.target.value)}
                  onBlur={async () => {
                    const trimmed = linkPreviewUrl.trim();
                    if (trimmed && trimmed !== config.linkPreviewUrl) {
                      updateConfig(() => ({ linkPreviewUrl: trimmed }));
                      if (user) await updateSettings.mutateAsync({ linkPreviewUrl: trimmed });
                      toast({ title: 'Link preview URL updated' });
                    }
                  }}
                  placeholder="https://ditto.pub/api/link-preview/{url}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://ditto.pub/api/link-preview/{'{url}'}</span>
                </div>
              </div>

              {/* CORS Proxy */}
              <div>
                <Label htmlFor="cors-proxy" className="text-sm font-medium">
                  CORS Proxy
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Proxy for cross-origin requests (NIP-05 fallback). Use <code className="bg-muted px-1 rounded">{'{href}'}</code> as a placeholder for the target URL.
                </p>
                <Input
                  id="cors-proxy"
                  value={corsProxy}
                  onChange={(e) => setCorsProxy(e.target.value)}
                  onBlur={async () => {
                    const trimmed = corsProxy.trim();
                    if (trimmed && trimmed !== config.corsProxy) {
                      updateConfig(() => ({ corsProxy: trimmed }));
                      if (user) await updateSettings.mutateAsync({ corsProxy: trimmed });
                      toast({ title: 'CORS proxy updated' });
                    }
                  }}
                  placeholder="https://proxy.shakespeare.diy/?url={href}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://proxy.shakespeare.diy/?url={'{href}'}</span>
                </div>
              </div>

              {/* Translation Worker URL */}
              <div>
                <Label htmlFor="translate-worker-url" className="text-sm font-medium">
                  Translation Worker URL
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  DeepL-backed worker endpoint used by the "Translate" button on notes. Receives a POST with the text and target language.
                </p>
                <Input
                  id="translate-worker-url"
                  type="url"
                  value={translateWorkerUrl}
                  onChange={(e) => setTranslateWorkerUrl(e.target.value)}
                  onBlur={async () => {
                    const trimmed = translateWorkerUrl.trim();
                    if (trimmed && trimmed !== config.translateWorkerUrl) {
                      updateConfig(() => ({ translateWorkerUrl: trimmed }));
                      if (user) await updateSettings.mutateAsync({ translateWorkerUrl: trimmed });
                      toast({ title: 'Translation worker URL updated' });
                    }
                  }}
                  placeholder={DEFAULT_TRANSLATE_WORKER_URL || 'https://example.workers.dev'}
                  className="font-mono text-base md:text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
                {DEFAULT_TRANSLATE_WORKER_URL && (
                  <div className="text-xs text-muted-foreground mt-2">
                    <span className="font-medium">Default: </span>
                    <span className="font-mono break-all">{DEFAULT_TRANSLATE_WORKER_URL}</span>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Error Reporting Section */}
      <div>
        <Collapsible open={sentryOpen} onOpenChange={setSentryOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">Error Reporting</span>
              {sentryOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pt-3 pb-4 space-y-5">

              {/* Share error reports toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="sentry-enabled" className="text-sm font-medium">
                    Share error reports
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Help improve this app by automatically sending crash and error reports.
                  </p>
                </div>
                <Switch
                  id="sentry-enabled"
                  checked={config.sentryEnabled}
                  onCheckedChange={(checked) => {
                    updateConfig((current) => ({ ...current, sentryEnabled: checked }));
                  }}
                />
              </div>

              {/* Sentry DSN */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="sentry-dsn" className="text-sm font-medium">
                    Sentry DSN
                    {sentryDsn !== DEFAULT_SENTRY_DSN && (
                      <span className="ml-2 inline-block w-2 h-2 rounded-full bg-yellow-400" title="Modified from default" />
                    )}
                  </Label>
                  {sentryDsn !== DEFAULT_SENTRY_DSN && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      title="Restore to default"
                      onClick={async () => {
                        setSentryDsn(DEFAULT_SENTRY_DSN);
                        updateConfig((current) => ({ ...current, sentryDsn: DEFAULT_SENTRY_DSN }));
                        if (user) await updateSettings.mutateAsync({ sentryDsn: DEFAULT_SENTRY_DSN });
                        toast({ title: 'Sentry DSN restored to default' });
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Sentry Data Source Name (DSN) for error reporting. Leave empty to disable Sentry.
                </p>
                <Input
                  id="sentry-dsn"
                  value={sentryDsn}
                  onChange={(e) => setSentryDsn(e.target.value)}
                  onBlur={async () => {
                    const trimmed = sentryDsn.trim();
                    if (trimmed !== config.sentryDsn) {
                      updateConfig((current) => ({ ...current, sentryDsn: trimmed }));
                      if (user) await updateSettings.mutateAsync({ sentryDsn: trimmed });
                      toast({ title: trimmed ? 'Sentry DSN updated' : 'Sentry DSN cleared' });
                    }
                  }}
                  placeholder="https://examplePublicKey@o0.ingest.sentry.io/0"
                  className="font-mono text-base md:text-sm"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Danger Zone Section — only when logged in */}
      {user && (
        <div>
          <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="flex items-center gap-2 text-base font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Danger Zone
                </span>
                {dangerOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-destructive rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pt-3 pb-4 space-y-4">
                <div className="rounded-lg border border-destructive/30 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">Delete Account</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Permanently delete your data from the network, including your profile,
                      posts, and reactions. This action is irreversible.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setVanishDialogOpen(true)}
                  >
                    Delete Account
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <RequestToVanishDialog
            open={vanishDialogOpen}
            onOpenChange={setVanishDialogOpen}
          />
        </div>
      )}
    </div>
  );
}
