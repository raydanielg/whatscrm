import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Globe, MapPin, MessageCircle, Download, Linkedin, Instagram } from 'lucide-react';
import { useVCardBySlug, downloadVCardFile, registerVCardView } from '@/hooks/use-vcards';
import { getPublicCardAccent } from '@/lib/themes/public-accent.functions';
import { DEFAULT_ACCENT } from '@/lib/themes/accent-color';

export const Route = createFileRoute('/v/$slug')({
  component: PublicVCard,
  head: () => ({
    meta: [
      { title: 'Digital Business Card' },
      { name: 'description', content: 'View contact details and save this digital business card straight to your phone.' },
      { property: 'og:title', content: 'Digital Business Card' },
      { property: 'og:description', content: 'View contact details and save this digital business card straight to your phone.' },
      { property: 'og:type', content: 'profile' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
});

function PublicVCard() {
  const { slug } = Route.useParams();
  const { data: card, isLoading } = useVCardBySlug(slug);

  // Keep the shared page on the tenant's current brand accent: re-checked on a
  // short interval, on tab focus and on reconnect, so an accent saved in
  // Settings lands on cards that are already open — no reload, no cache clear.
  const { data: tenantAccent } = useQuery({
    queryKey: ['public-card-accent', slug],
    enabled: !!slug,
    queryFn: () => getPublicCardAccent({ data: { slug } }),
    select: (r) => r.accent,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });

  useEffect(() => {
    if (card?.id) registerVCardView(card.id);
  }, [card?.id]);

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading card</div>;
  }

  if (!card || !card.is_public) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">Card not available</h1>
          <p className="text-sm text-muted-foreground">This digital business card doesn’t exist or is no longer shared.</p>
        </div>
      </div>
    );
  }

  const accent = tenantAccent ?? card.theme?.accent ?? DEFAULT_ACCENT;
  const waNumber = (card.whatsapp ?? '').replace(/[^\d]/g, '');

  return (
    <main className="min-h-screen bg-muted/40 py-8 px-4">
      <article className="mx-auto max-w-md overflow-hidden rounded-control bg-card shadow-sm">
        <div className="h-24" style={{ background: accent }} />
        <div className="px-6 pb-6 -mt-10 space-y-4">
          <div className="h-20 w-20 rounded-full border-4 border-card bg-muted overflow-hidden flex items-center justify-center text-2xl font-semibold">
            {card.avatar_url
              ? <img src={card.avatar_url} alt={`${card.full_name} profile photo`} className="h-full w-full object-cover" />
              : card.full_name.charAt(0).toUpperCase()}
          </div>
          <header>
            <h1 className="text-xl font-semibold">{card.full_name}</h1>
            <p className="text-sm text-muted-foreground">{[card.job_title, card.company].filter(Boolean).join(' · ')}</p>
          </header>
          {card.bio && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{card.bio}</p>}

          <div className="space-y-2 text-sm">
            {card.phone && (
              <a href={`tel:${card.phone}`} className="flex items-center gap-3 rounded border p-3 hover:bg-accent">
                <Phone className="h-4 w-4" style={{ color: accent }} />{card.phone}
              </a>
            )}
            {card.whatsapp && (
              <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded border p-3 hover:bg-accent">
                <MessageCircle className="h-4 w-4" style={{ color: accent }} />WhatsApp
              </a>
            )}
            {card.email && (
              <a href={`mailto:${card.email}`} className="flex items-center gap-3 rounded border p-3 hover:bg-accent">
                <Mail className="h-4 w-4" style={{ color: accent }} />{card.email}
              </a>
            )}
            {card.website && (
              <a href={card.website} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded border p-3 hover:bg-accent">
                <Globe className="h-4 w-4" style={{ color: accent }} />{card.website}
              </a>
            )}
            {card.address && (
              <div className="flex items-center gap-3 rounded border p-3">
                <MapPin className="h-4 w-4" style={{ color: accent }} />{card.address}
              </div>
            )}
          </div>

          {(card.socials?.linkedin || card.socials?.instagram) && (
            <div className="flex gap-2">
              {card.socials?.linkedin && (
                <Button variant="outline" size="sm" asChild>
                  <a href={card.socials.linkedin} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4 " />LinkedIn</a>
                </Button>
              )}
              {card.socials?.instagram && (
                <Button variant="outline" size="sm" asChild>
                  <a href={card.socials.instagram} target="_blank" rel="noreferrer"><Instagram className="h-4 w-4 " />Instagram</a>
                </Button>
              )}
            </div>
          )}

          <Button className="w-full" style={{ background: accent }} onClick={() => downloadVCardFile(card)}>
            <Download className="h-4 w-4 mr-2" />Save to contacts
          </Button>
        </div>
      </article>
    </main>
  );
}
