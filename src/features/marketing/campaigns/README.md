# Campaigns

Broadcast campaigns, templates, scheduling, delivery reports.

## Structure

```
marketing/campaigns/
├── components/   Feature-scoped React components
├── hooks/        Feature-scoped hooks
├── api/          Server functions & query definitions
├── types/        TypeScript types for this domain
├── utils/        Pure helpers
└── constants/    Feature constants (statuses, labels, limits)
```

## Boundaries

- Import only from `@/shared/*`, `@/integrations/*`, or this feature's own tree.
- Never import from a sibling feature — lift shared code into `shared/`.
- All Supabase access goes through `api/` server functions.
