import { Brand } from "@/components/brand";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ALL_OFF,
  ALL_ON,
  COOKIE_CATEGORY_META,
  COOKIE_PREFERENCES_OPEN_EVENT,
  readCookieConsent,
  recordCookieConsent,
  type CookieCategories,
} from "@/lib/compliance/cookie-consent";

/**
 * Global cookie consent banner + preferences center.
 *
 * The banner appears until a decision is stored. The preferences dialog can be
 * reopened at any time (footer link, cookie policy page, or by dispatching
 * `openCookiePreferences()`) so visitors can change categories and re-save.
 */
export function CookieConsentBanner() {
  const [bannerVisible, setBannerVisible] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CookieCategories>({ ...ALL_OFF });

  useEffect(() => {
    const stored = readCookieConsent();
    if (stored) setCategories(stored.categories);
    else setBannerVisible(true);

    const onOpen = () => {
      setCategories(readCookieConsent()?.categories ?? { ...ALL_OFF });
      setPrefsOpen(true);
    };
    window.addEventListener(COOKIE_PREFERENCES_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COOKIE_PREFERENCES_OPEN_EVENT, onOpen);
  }, []);

  const save = useCallback(async (next: CookieCategories) => {
    setSaving(true);
    try {
      const stored = await recordCookieConsent(next);
      setCategories(stored.categories);
    } finally {
      setSaving(false);
      setBannerVisible(false);
      setPrefsOpen(false);
    }
  }, []);

  return (
    <>
      {bannerVisible && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded border border-border bg-surface/95 p-4 shadow-lg backdrop-blur-xl sm:flex-row sm:items-center">
            <Cookie className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="flex-1 text-sm text-muted-foreground">
              We use cookies to keep you signed in and to understand how <Brand /> is used. Read our{" "}
              <Link to="/legal/cookie-policy" className="underline hover:text-foreground">
                Cookie Policy
              </Link>
              .
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setCategories(readCookieConsent()?.categories ?? { ...ALL_OFF });
                  setPrefsOpen(true);
                }}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Customize
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void save({ ...ALL_OFF })}
              >
                Decline
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void save({ ...ALL_ON })}>
                Accept all
              </Button>
            </div>
          </div>
        </div>
      )}

      <CookiePreferencesDialog
        open={prefsOpen}
        onOpenChange={setPrefsOpen}
        categories={categories}
        setCategories={setCategories}
        saving={saving}
        onSave={save}
      />
    </>
  );
}

function CookiePreferencesDialog({
  open,
  onOpenChange,
  categories,
  setCategories,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CookieCategories;
  setCategories: (c: CookieCategories) => void;
  saving: boolean;
  onSave: (c: CookieCategories) => Promise<void> | void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cookie preferences</DialogTitle>
          <DialogDescription>
            Choose which cookies <Brand /> may use. You can change this at any time from the Cookie
            Policy page or the footer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {COOKIE_CATEGORY_META.map((cat) => (
            <div
              key={cat.id}
              className="flex items-start justify-between gap-4 rounded border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{cat.label}</p>
                <p className="text-xs text-muted-foreground">{cat.description}</p>
              </div>
              <Switch
                checked={cat.required ? true : categories[cat.id]}
                disabled={cat.required || saving}
                aria-label={`${cat.label} cookies`}
                onCheckedChange={(checked) =>
                  setCategories({ ...categories, [cat.id]: checked })
                }
              />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => void onSave({ ...ALL_OFF })}
            >
              Reject all
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => void onSave({ ...ALL_ON })}
            >
              Accept all
            </Button>
          </div>
          <Button size="sm" disabled={saving} onClick={() => void onSave(categories)}>
            Save preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
