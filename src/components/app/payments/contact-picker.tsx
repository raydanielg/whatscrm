import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Autocomplete, type AutocompleteOption } from '@/shared/components/autocomplete';
import { useCurrentWorkspace } from '@/hooks/use-workspace';

export type PickedContact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

/** Contact picker: loads recent contacts, uses cmdk's built-in fuzzy filter. */
export function ContactPicker({
  value,
  onPick,
  placeholder = 'Select contact',
}: {
  value?: string | null;
  onPick: (c: PickedContact | null) => void;
  placeholder?: string;
}) {
  const { active } = useCurrentWorkspace();
  const [rows, setRows] = useState<PickedContact[]>([]);

  useEffect(() => {
    if (!active?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, display_name, name, first_name, last_name, email, phone, phones, emails')
        .eq('workspace_id', active.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (cancelled) return;
      setRows(
        (data ?? []).map((r) => {
          const rr = r as unknown as Record<string, unknown>;
          const phones = Array.isArray(rr.phones) ? (rr.phones as Array<{ number?: string }>) : [];
          const emails = Array.isArray(rr.emails) ? (rr.emails as Array<{ email?: string }>) : [];
          return {
            id: String(rr.id),
            name:
              (rr.display_name as string) ||
              (rr.name as string) ||
              [rr.first_name, rr.last_name].filter(Boolean).join(' ') ||
              null,
            email: (rr.email as string) || emails[0]?.email || null,
            phone: (rr.phone as string) || phones[0]?.number || null,
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  const options = useMemo<AutocompleteOption[]>(
    () =>
      rows.map((r) => ({
        value: r.id,
        label: `${r.name || 'Unnamed'}${r.email ? ` · ${r.email}` : ''}${r.phone ? ` · ${r.phone}` : ''}`,
        description: undefined,
      })),
    [rows],
  );

  return (
    <Autocomplete
      options={options}
      value={value ?? null}
      onValueChange={(v) => {
        if (!v) return onPick(null);
        onPick(rows.find((x) => x.id === v) ?? null);
      }}
      placeholder={placeholder}
      searchPlaceholder="Type to filter"
      emptyText="No contacts"
    />
  );
}
