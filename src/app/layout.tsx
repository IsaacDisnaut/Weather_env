import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { LANGUAGE_COOKIE, LanguageProvider } from "@/i18n/LanguageProvider";
import { LANGUAGES, type Language } from "@/i18n/dictionaries";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: `Weather & Sensor Dashboard · ${siteConfig.name}`,
  description:
    "Realtime MQTT sensor dashboard with weather forecast, earthquake alerts and Node-RED export",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get(LANGUAGE_COOKIE)?.value;
  const lang: Language = LANGUAGES.includes(cookieLang as Language)
    ? (cookieLang as Language)
    : "th";

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={cn("font-sans", geist.variable)}
    >
      <body className="min-h-screen">
        <LanguageProvider initialLang={lang}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
