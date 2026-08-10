"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LANGUAGES, type Language } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/LanguageProvider";

const LABELS: Record<Language, string> = { th: "ไทย", en: "EN" };

export function LanguageSwitch() {
  const { lang, setLang, d } = useI18n();

  return (
    <ToggleGroup
      value={[lang]}
      onValueChange={(value) => {
        // ToggleGroup เป็นแบบเลือกได้หลายค่า จึงบังคับให้เหลือค่าเดียว
        // กดภาษาอื่น = สลับไปภาษานั้น, กดภาษาเดิมซ้ำ (ได้ค่าว่าง) = คงเดิม
        const next = (value as Language[]).find((item) => item !== lang);
        if (next) setLang(next);
      }}
      aria-label={d.nav.language}
      size="sm"
      variant="outline"
    >
      {LANGUAGES.map((code) => (
        <ToggleGroupItem key={code} value={code} aria-label={LABELS[code]}>
          {LABELS[code]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
