"use client";

import { useState } from "react";
import { Award, Download, Gamepad2, Heart, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import type { QuizSummary, QuizTopic } from "@/lib/types";

const RANGES = [
  { key: "7", days: 7 },
  { key: "30", days: 30 },
  { key: "all", days: 0 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/**
 * ผลเกมตอบคำถามที่เล่นผ่าน marker ของแอป AR
 * ข้อมูลมาจาก data/quiz-results.jsonl ซึ่งเซิร์ฟเวอร์เป็นคนตรวจคะแนนแล้วเขียนเอง
 */
export function QuizPanel() {
  const { d, formatNumber, formatRelative } = useI18n();
  const [range, setRange] = useState<RangeKey>("7");

  const days = RANGES.find((item) => item.key === range)?.days ?? 0;
  const query = days > 0 ? `?days=${days}` : "";
  const { data } = usePolling<QuizSummary>(`/api/quiz/results${query}`, 30_000);

  const rangeLabel: Record<RangeKey, string> = {
    "7": d.quiz.range7,
    "30": d.quiz.range30,
    all: d.quiz.rangeAll,
  };

  /** 95000 -> "1 นาที" / "1m" — เกมหนึ่งรอบใช้เวลาไม่กี่นาที จึงพอแค่สองหน่วย */
  const duration = (ms: number): string => {
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}${d.quiz.unitSeconds}`;
    const minutes = Math.floor(totalSeconds / 60);
    const rest = totalSeconds % 60;
    return rest === 0
      ? `${minutes}${d.quiz.unitMinutes}`
      : `${minutes}${d.quiz.unitMinutes} ${rest}${d.quiz.unitSeconds}`;
  };

  const topicLabel = (topic: QuizTopic): string => d.quiz.topics[topic] ?? topic;

  const totals = data?.totals;
  const spread = data?.scoreSpread ?? [];
  const conservation = data?.conservationSpread ?? [];
  const hardest = data?.hardest ?? [];
  const recent = data?.recent ?? [];

  // แถบคะแนนเทียบกับช่องที่มีคนได้มากที่สุด จะได้เห็นรูปทรงการกระจายทันที
  const tallest = spread.reduce((max, item) => Math.max(max, item.plays), 0);
  const mostChosen = conservation.reduce((max, item) => Math.max(max, item.responses), 0);
  const played = (totals?.plays ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Gamepad2 className="size-3.5" />
          {d.quiz.title}
        </CardTitle>
        <CardDescription className="text-[11px]">{d.quiz.hint}</CardDescription>

        <CardAction className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(value) => setRange(value as RangeKey)}>
            <SelectTrigger size="sm" aria-label={d.quiz.title}>
              <SelectValue>{rangeLabel[range]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {rangeLabel[item.key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(
            [
              ["plays", d.quiz.downloadPlays],
              ["questions", d.quiz.downloadQuestions],
            ] as const
          ).map(([what, label]) => (
            <Button
              key={what}
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={`/api/quiz/export?what=${what}${days > 0 ? `&days=${days}` : ""}`} />}
            >
              <Download />
              {label}
            </Button>
          ))}
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            icon={<Gamepad2 className="size-3" />}
            label={d.quiz.plays}
            value={totals?.plays ?? 0}
          />
          <Stat
            icon={<Users className="size-3" />}
            label={d.quiz.players}
            value={totals?.players ?? 0}
          />
          <Stat
            icon={<Target className="size-3" />}
            label={d.quiz.avgScore}
            value={totals ? formatNumber(totals.avgScore, 1) : "—"}
          />
          <Stat
            label={d.quiz.accuracy}
            value={totals ? `${Math.round(totals.accuracy * 100)}%` : "—"}
            tone={totals && totals.questionsAnswered > 0 && totals.accuracy < 0.5 ? "warn" : undefined}
          />
          <Stat
            icon={<Award className="size-3" />}
            label={d.quiz.perfect}
            value={totals?.perfect ?? 0}
          />
          <Stat label={d.quiz.avgTime} value={duration(totals?.avgDurationMs ?? 0)} />
        </dl>

        {!played ? (
          <p className="text-[11px] text-muted-foreground">{d.quiz.noPlays}</p>
        ) : (
          <>
            {/* ---------- การกระจายคะแนน ---------- */}
            <section>
              <h3 className="mb-2 text-xs font-medium">{d.quiz.spreadTitle}</h3>
              <ul className="space-y-1">
                {spread.map((item) => (
                  <li key={item.score} className="flex items-center gap-2 text-xs">
                    <span className="tabular w-14 shrink-0 text-muted-foreground">
                      {d.quiz.scoreLabel} {item.score}
                    </span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{
                          width: `${tallest > 0 ? Math.max(3, (item.plays / tallest) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <span className="tabular w-16 shrink-0 text-right">
                      {item.plays} {d.quiz.playsLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* ---------- ความอยากอนุรักษ์ ---------- */}
            <section>
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                <Heart className="size-3" />
                {d.quiz.conservationTitle}
              </h3>
              <p className="mb-2 text-[11px] text-muted-foreground">{d.quiz.conservationHint}</p>

              {totals && totals.conservationResponses > 0 ? (
                <>
                  <div className="mb-2 flex items-baseline gap-4 text-xs">
                    <span>
                      <span className="text-muted-foreground">{d.quiz.conservationAvg} </span>
                      <span className="tabular text-sm font-medium">
                        {formatNumber(totals.conservationAvg ?? 0, 1)}
                      </span>
                      <span className="text-muted-foreground"> / 5</span>
                    </span>
                    <span className="text-muted-foreground">
                      {totals.conservationResponses} {d.quiz.conservationAnswers}
                    </span>
                  </div>

                  {/* แสดงครบ 0–5 เสมอ ระดับที่ไม่มีใครเลือกต้องเห็นว่าเป็นศูนย์ ไม่ใช่หายไป */}
                  <ul className="space-y-1">
                    {conservation.map((item) => (
                      <li key={item.score} className="flex items-center gap-2 text-xs">
                        <span className="tabular w-4 shrink-0 text-right text-muted-foreground">
                          {item.score}
                        </span>
                        <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{
                              width: `${
                                mostChosen > 0 ? Math.max(2, (item.responses / mostChosen) * 100) : 0
                              }%`,
                            }}
                          />
                        </span>
                        <span className="tabular w-8 shrink-0 text-right">{item.responses}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>{d.quiz.conservationLow}</span>
                    <span>{d.quiz.conservationHigh}</span>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">{d.quiz.conservationNone}</p>
              )}
            </section>

            {/* ---------- ข้อที่ตอบผิดบ่อย ---------- */}
            <section>
              <h3 className="mb-2 text-xs font-medium">{d.quiz.hardestTitle}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[22rem] text-xs">
                  <thead>
                    <tr className="text-[11px] text-muted-foreground">
                      <th className="py-1 text-left font-normal">{d.quiz.question}</th>
                      <th className="py-1 text-right font-normal">{d.quiz.asked}</th>
                      <th className="py-1 text-right font-normal">{d.quiz.correctCol}</th>
                      <th className="py-1 text-right font-normal">{d.quiz.accuracyCol}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hardest.map((stat) => (
                      <tr key={stat.questionId} className="border-t">
                        <td className="py-1 pr-2">
                          <span className="font-medium">{topicLabel(stat.topic)}</span>
                          {/* ส่วนหลัง : คือรหัสอุปกรณ์ ทำให้รู้ว่าเป็นคำถามของภาพไหน */}
                          <span className="text-muted-foreground">
                            {" "}
                            · {stat.questionId.split(":")[1] ?? stat.questionId}
                          </span>
                        </td>
                        <td className="tabular py-1 text-right">{stat.asked}</td>
                        <td className="tabular py-1 text-right">{stat.correct}</td>
                        <td
                          className={cn(
                            "tabular py-1 text-right font-medium",
                            stat.accuracy < 0.5 ? "text-warn" : undefined,
                          )}
                        >
                          {Math.round(stat.accuracy * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ---------- การเล่นล่าสุด ---------- */}
            <section>
              <h3 className="mb-2 text-xs font-medium">{d.quiz.recentTitle}</h3>
              <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {recent.map((result) => (
                  <li
                    key={result.id}
                    className="flex items-baseline justify-between gap-3 border-t py-1 text-xs first:border-t-0"
                  >
                    <span className="tabular font-medium">
                      {result.correct} / {result.total}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {duration(result.durationMs)} · {result.lang.toUpperCase()}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelative(result.ts)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "warn";
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className={cn("tabular font-medium", tone === "warn" ? "text-warn" : undefined)}>
        {value}
      </dd>
    </div>
  );
}
