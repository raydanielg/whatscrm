import * as Contacts from 'expo-contacts';

export type SimpleContact = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phones: string[];
  emails: string[];
  company?: string;
};

export async function ensureContactsPermission() {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') throw new Error('Contacts permission denied');
}

export async function listContacts(opts?: { search?: string; limit?: number }): Promise<SimpleContact[]> {
  await ensureContactsPermission();
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.FirstName, Contacts.Fields.LastName, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Company],
    name: opts?.search,
    pageSize: opts?.limit ?? 200,
  });
  return data.map((c) => ({
    id: c.id ?? Math.random().toString(36),
    name: c.name ?? [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown',
    firstName: c.firstName ?? undefined,
    lastName: c.lastName ?? undefined,
    phones: (c.phoneNumbers ?? []).map((p) => p.number ?? '').filter(Boolean),
    emails: (c.emails ?? []).map((e) => e.email ?? '').filter(Boolean),
    company: c.company ?? undefined,
  }));
}

export async function createContact(input: { firstName?: string; lastName?: string; phone?: string; email?: string; company?: string }) {
  await ensureContactsPermission();
  const contact: Contacts.Contact = {
    contactType: Contacts.ContactTypes.Person,
    [Contacts.Fields.FirstName]: input.firstName,
    [Contacts.Fields.LastName]: input.lastName,
    [Contacts.Fields.Company]: input.company,
    [Contacts.Fields.PhoneNumbers]: input.phone ? [{ label: 'mobile', number: input.phone }] : undefined,
    [Contacts.Fields.Emails]: input.email ? [{ label: 'work', email: input.email }] : undefined,
  } as any;
  return Contacts.addContactAsync(contact);
}
