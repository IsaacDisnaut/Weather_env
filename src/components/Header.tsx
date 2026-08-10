"use client";

import Link from "next/link";
import { CloudSunRain } from "lucide-react";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useI18n } from "@/i18n/LanguageProvider";

export function Header({ siteName }: { siteName: string }) {
  const { d } = useI18n();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-350 items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl border bg-card text-primary">
            <CloudSunRain className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">{d.appName}</span>
            <span className="block text-xs text-muted-foreground">{siteName}</span>
          </span>
        </Link>

        <div className="ml-auto">
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
}
