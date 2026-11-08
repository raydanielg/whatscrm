import type { ReactNode } from "react";

/**
 * Show a `DataTable` on `md+` viewports, `DataCards` below. Consumers pass
 * the ready-rendered elements — this keeps typing per-row.
 */
export function ResponsiveDataView({
  table,
  cards,
}: {
  table: ReactNode;
  cards: ReactNode;
}) {
  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden">{cards}</div>
    </>
  );
}
