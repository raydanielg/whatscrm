import { useMemo, useState } from "react";
import { Languages, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import {
  DEFAULT_LANGUAGE,
  languagesFor,
  translationCoverage,
  isRtlLanguage,
  type LanguageCode,
  type Translations,
} from "@/lib/i18n/languages";

interface Props {
  translations: Translations;
  onChange: (next: Translations) => void;
  showSubject?: boolean;
  bodyRows?: number;
}

/**
 * Translations editor: pick a language, then edit title/body for it. The
 * language list comes from Platform Settings → Localization (enabled
 * languages), with search and a completion meter for larger sets.
 */
export function TranslationsEditor({ translations, onChange, showSubject = false, bodyRows = 4 }: Props) {
  const { config } = usePlatformRuntime();
  const base = config.localization.fallbackLanguage || DEFAULT_LANGUAGE;

  const languages = useMemo(
    () => languagesFor(config.localization.enabledLanguages).filter((l) => l.code !== base),
    [config.localization.enabledLanguages, base],
  );

  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<LanguageCode>(languages[0]?.code ?? "es");
  const current = translations[lang] ?? {};

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (l) =>
        l.code.includes(q) ||
        l.label.toLowerCase().includes(q) ||
        l.native.toLowerCase().includes(q),
    );
  }, [languages, query]);

  const coverage = translationCoverage(translations, languages.map((l) => l.code));
  const pct = coverage.total ? Math.round((coverage.filled / coverage.total) * 100) : 100;

  const patch = (k: "title" | "body" | "subject", v: string) => {
    onChange({ ...translations, [lang]: { ...current, [k]: v } });
  };

  const activeLabel = languages.find((l) => l.code === lang)?.label ?? lang;

  return (
    <div className="space-y-3 rounded-control border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">Translations</span>
        </div>
        <span className="shrink-0 text-xs  text-muted-foreground">
          {coverage.filled}/{coverage.total} languages
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />

      {languages.length > 10 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search language"
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {visible.map((l) => {
          const t = translations[l.code];
          const filled = !!(t && (t.title || t.body || t.subject));
          const active = lang === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              title={l.native}
              className={`rounded-control border px-2 py-1 text-xs transition-colors ${
                active
                  ? "border-accent bg-accent/10 text-accent"
                  : filled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border hover:bg-muted"
              }`}
            >
              <span className="mr-1">{l.flag}</span>
              {l.label}
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground">No language matches that search.</p>
        )}
      </div>

      <div className="space-y-2" dir={isRtlLanguage(lang) ? "rtl" : "ltr"}>
        {showSubject && (
          <Input
            placeholder="Subject"
            value={current.subject ?? ""}
            onChange={(e) => patch("subject", e.target.value)}
            className="h-9 text-sm"
          />
        )}
        <Input
          placeholder="Title"
          value={current.title ?? ""}
          onChange={(e) => patch("title", e.target.value)}
          className="h-9 text-sm"
        />
        <Textarea
          placeholder="Body"
          value={current.body ?? ""}
          onChange={(e) => patch("body", e.target.value)}
          rows={bodyRows}
          className="text-sm"
        />
      </div>

      {(current.title || current.body || current.subject) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            const next = { ...translations };
            delete next[lang];
            onChange(next);
          }}
        >
          Clear {activeLabel}
        </Button>
      )}
    </div>
  );
}
