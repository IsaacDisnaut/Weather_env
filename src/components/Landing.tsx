"use client";

import Link from "next/link";
import { ArrowRight, CloudSun, FileSpreadsheet, Globe2, LineChart } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/LanguageProvider";

export function Landing({ siteName }: { siteName: string }) {
  const { d } = useI18n();

  const features = [
    {
      Icon: LineChart,
      title: d.landing.features.realtime,
      text: d.landing.features.realtimeText,
    },
    {
      Icon: CloudSun,
      title: d.landing.features.weather,
      text: d.landing.features.weatherText,
    },
    { Icon: Globe2, title: d.landing.features.quake, text: d.landing.features.quakeText },
    {
      Icon: FileSpreadsheet,
      title: d.landing.features.excel,
      text: d.landing.features.excelText,
    },
  ];

  return (
    <div className="min-h-screen">
      <Header siteName={siteName} />

      <main className="mx-auto max-w-5xl px-4 py-16">
        <h1 className="text-3xl font-semibold sm:text-4xl">{d.appName}</h1>
        <p className="mt-3 text-lg text-primary">{d.landing.tagline}</p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {d.landing.description}
        </p>

        <Button
          className="mt-7"
          size="lg"
          nativeButton={false}
          render={<Link href="/dashboard" />}
        >
          {d.landing.cta}
          <ArrowRight />
        </Button>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {features.map(({ Icon, title, text }) => (
            <Card key={title}>
              <CardHeader>
                <Icon className="size-6 text-primary" />
                <CardTitle className="mt-2 text-sm">{title}</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {text}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0" />
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
