"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  dictionaries,
  LOCALE_TAG,
  type Dictionary,
  type Language,
} from "@/i18n/dictionaries";

export const LANGUAGE_COOKIE = "lang";

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  toggle: () => void;
  d: Dictionary;
  locale: string;
  formatNumber: (value: number, digits?: number) => string;
  formatTime: (ts: number | string) => string;
  formatDateTime: (ts: number | string) => string;
  formatWeekday: (ts: number | string) => string;
  formatRelative: (ts: number | null) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Language;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Language>(initialLang);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    document.documentElement.lang = next;
    // เก็บใน cookie เพื่อให้ SSR รอบหน้า render ภาษาเดิมตั้งแต่แรก ไม่กระพริบ
    document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const locale = LOCALE_TAG[lang];
    return {
      lang,
      setLang,
      toggle: () => setLang(lang === "th" ? "en" : "th"),
      d: dictionaries[lang],
      locale,
      formatNumber: (value, digits = 1) =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(value),
      formatTime: (ts) =>
        new Intl.DateTimeFormat(locale, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(ts)),
      formatDateTime: (ts) =>
        new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(ts)),
      formatWeekday: (ts) =>
        new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(
          new Date(ts),
        ),
      formatRelative: (ts) => {
        if (!ts) return dictionaries[lang].common.never;
        const diffSeconds = Math.round((ts - Date.now()) / 1000);
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
        const abs = Math.abs(diffSeconds);
        if (abs < 60) return rtf.format(diffSeconds, "second");
        if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
        if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
        return rtf.format(Math.round(diffSeconds / 86400), "day");
      },
    };
  }, [lang, setLang]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useI18n(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useI18n must be used inside <LanguageProvider>");
  }
  return context;
}
