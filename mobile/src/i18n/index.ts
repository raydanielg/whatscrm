import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { useAppStore } from '@/stores/appStore';

const common = {
  signIn: { en: 'Sign in', es: 'Iniciar sesión', fr: 'Se connecter', pt: 'Entrar', de: 'Anmelden', ar: 'تسجيل الدخول' },
  signOut: { en: 'Sign out', es: 'Cerrar sesión', fr: 'Se déconnecter', pt: 'Sair', de: 'Abmelden', ar: 'تسجيل الخروج' },
  dashboard: { en: 'Dashboard', es: 'Panel', fr: 'Tableau de bord', pt: 'Painel', de: 'Übersicht', ar: 'لوحة التحكم' },
  inbox: { en: 'Inbox', es: 'Bandeja', fr: 'Boîte', pt: 'Caixa', de: 'Posteingang', ar: 'صندوق الوارد' },
  offline: {
    en: 'Offline — changes will sync when you reconnect',
    es: 'Sin conexión — los cambios se sincronizarán al reconectar',
    fr: 'Hors ligne — les modifications se synchroniseront',
    pt: 'Offline — as alterações serão sincronizadas',
    de: 'Offline — Änderungen werden synchronisiert',
    ar: 'غير متصل — ستتم المزامنة عند الاتصال',
  },
};

function buildResources() {
  const langs = ['en', 'es', 'fr', 'pt', 'de', 'ar'] as const;
  const out: Record<string, { translation: Record<string, string> }> = {};
  for (const l of langs) {
    const t: Record<string, string> = {};
    for (const [key, values] of Object.entries(common)) {
      t[key] = (values as Record<string, string>)[l] ?? (values as any).en;
    }
    out[l] = { translation: t };
  }
  return out;
}

const stored = useAppStore.getState().language;
const initial = stored || Localization.getLocales()[0]?.languageCode || 'en';

void i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: buildResources(),
});

export const SUPPORTED_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ar', label: 'العربية' },
];

export function setLanguage(code: string) {
  useAppStore.getState().setLanguage(code);
  void i18n.changeLanguage(code);
}

export default i18n;
