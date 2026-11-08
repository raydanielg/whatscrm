# Reusable Layouts

Token-only layouts composed from `./primitives`. Full spec:
`docs/architecture/LAYOUT_SYSTEM.md`.

- `AuthLayout` — sign-in / sign-up / recovery (centered or split).
- `DashboardLayout` — analytics home (title + filters + metrics + body).
- `CRMLayout` — two-pane list + detail.
- `InboxLayout` — three-pane folders / list / reader.
- `SettingsLayout` — sub-nav + narrow content column.
- `ReportsLayout` — wide container + sticky filters.
- `MarketingLayout` / `MarketingSection` — public marketing shells.
- `AutomationLayout` — toolbar + canvas + inspector.
- `AdminLayout` — org-admin table workspace.
- `SuperAdminLayout` — platform console with privilege banner.

Primitives: `AppFrame`, `Container`, `Section`, `ListDetail`, `ThreePane`,
`CanvasInspector`, `SubnavContent`, `SubHeader`, `StickyActionBar`,
`MetricsGrid`, `Bento`, `CardGrid`, `SplitScreen`.
