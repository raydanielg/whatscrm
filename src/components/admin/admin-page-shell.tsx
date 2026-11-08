import { ReactNode } from "react";

export function AdminPageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

export function AdminEmptyState({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="rounded-control border border-dashed border-border bg-surface p-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-control bg-accent/10 text-accent grid place-items-center">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-display font-semibold mt-4">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>
    </div>
  );
}
