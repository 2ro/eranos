import { Languages, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { prepareForTranslation, restoreTokens } from "@/lib/prepareTranslation";
import { cn } from "@/lib/utils";

const DEFAULT_TRANSLATE_WORKER_URL = "https://agora-translate.mk-cc1.workers.dev";

const LANG_MAP: Record<string, string> = {
  en: "EN-US",
  es: "ES",
  ar: "AR",
  zh: "ZH",
};

interface TranslationResponse {
  translations?: Array<{
    text?: string;
    detected_source_language?: string;
  }>;
  error?: string;
}

interface TranslateButtonProps {
  /** Original plaintext content to translate. */
  text: string;
  /** Optional list of plaintext fields to translate in one request. */
  texts?: string[];
  /** Called with translated text on success. */
  onTranslated: (translated: string, translatedTexts: string[]) => void;
  /** Called when the user wants to show the original content again. */
  onReset: () => void;
  /** Whether translated content is currently visible. */
  isTranslated: boolean;
  /** Hide label on narrow screens so the action row can collapse to an icon. */
  responsiveLabel?: boolean;
  className?: string;
}

export function TranslateButton({
  text,
  texts,
  onTranslated,
  onReset,
  isTranslated,
  responsiveLabel,
  className,
}: TranslateButtonProps) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleClick = async () => {
    if (isTranslated) {
      onReset();
      setError(false);
      return;
    }

    if (!text.trim()) return;

    setLoading(true);
    setError(false);

    try {
      const languagePrefix = i18n.language.split("-")[0].toLowerCase();
      const targetLang = LANG_MAP[languagePrefix] ?? "EN-US";
      const prepared = (texts && texts.length > 0 ? texts : [text]).map(prepareForTranslation);
      const translateUrl = import.meta.env.VITE_TRANSLATE_WORKER_URL ?? DEFAULT_TRANSLATE_WORKER_URL;

      const response = await fetch(translateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: prepared.map(({ textToTranslate }) => textToTranslate),
          target_lang: targetLang,
        }),
      });

      if (!response.ok) throw new Error(`Translation proxy error ${response.status}`);

      const data = await response.json() as TranslationResponse;
      const translated = data.translations?.map(({ text }) => text ?? "") ?? [];
      if (!translated[0]) throw new Error(data.error ?? "Empty translation response");

      const restored = translated.map((value, index) => restoreTokens(value, prepared[index]?.tokens ?? []));
      onTranslated(restored[0], restored);
    } catch (err) {
      console.error("Translation failed:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={(event) => {
        event.stopPropagation();
        void handleClick();
      }}
      disabled={loading || !text.trim()}
      aria-label={
        error
          ? t("translate.error")
          : isTranslated
            ? t("translate.showOriginal")
            : t("translate.translate")
      }
      className={cn(
        "h-7 gap-1.5 rounded-full px-2 text-xs transition-colors",
        isTranslated || error
          ? "text-primary hover:text-primary/80"
          : "text-muted-foreground hover:text-primary",
        className,
      )}
      title={
        error
          ? t("translate.error")
          : isTranslated
            ? t("translate.showOriginal")
            : t("translate.translate")
      }
    >
      {loading ? (
        <Loader2 className="size-[18px] animate-spin" />
      ) : isTranslated ? (
        <RotateCcw className="size-[18px]" />
      ) : (
        <Languages className="size-[18px] shrink-0" />
      )}
      <span className={cn(responsiveLabel && "hidden sm:inline")}>
        {loading
          ? t("translate.translating")
          : error
            ? t("translate.error")
            : isTranslated
              ? t("translate.showOriginal")
              : t("translate.translate")}
      </span>
    </Button>
  );
}
