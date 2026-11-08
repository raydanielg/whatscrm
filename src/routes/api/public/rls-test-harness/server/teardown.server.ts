import { getHarnessAdmin } from "./harness.server";

export async function teardownHarness(userIds: string[]) {
  const { admin } = getHarnessAdmin();
  const errors: Array<{ id: string; message: string }> = [];
  
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id, true);
    if (error) errors.push({ id, message: error.message });
  }
  
  return { 
    deleted: userIds.length - errors.length, 
    errors 
  };
}
