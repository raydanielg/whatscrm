import { getHarnessAdmin } from "./harness.server";

export async function listScopedTables() {
  const { url, serviceKey } = getHarnessAdmin();
  const res = await fetch(`${url}/rest/v1/rpc/rls_harness_list_scoped_tables`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: "{}",
  });

  if (!res.ok) {
    return null;
  }

  const rows = (await res.json()) as Array<{
    table_name: string;
    scope_column: string;
  }>;
  return rows;
}
