import { createFileRoute } from '@tanstack/react-router';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { MarketplaceOpsConsole } from '@/components/admin/marketplace/marketplace-ops-console';

export const Route = createFileRoute('/_authenticated/_super-admin/admin/marketplace-ops')({
  head: () => ({
    meta: [
      { title: 'Super Admin — Marketplace Operations' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: () => (
    <AdminPageShell
      title="Marketplace Operations"
      description="Analytics, moderation, approvals, security scans, and compatibility checks for plugins and themes."
    >
      <MarketplaceOpsConsole />
    </AdminPageShell>
  ),
});
