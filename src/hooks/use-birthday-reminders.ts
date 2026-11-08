import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getBirthdayReminderSettings,
  upsertBirthdayReminderSettings,
  runBirthdayRemindersNow,
  getUpcomingBirthdays,
} from "@/lib/birthday/reminders.functions";

export function useBirthdayReminderSettings(workspaceId: string | undefined) {
  const fetcher = useServerFn(getBirthdayReminderSettings);
  return useQuery({
    queryKey: ["birthday-reminder-settings", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => fetcher({ data: { workspace_id: workspaceId! } }),
  });
}

export function useUpsertBirthdayReminderSettings() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertBirthdayReminderSettings);
  return useMutation({
    mutationFn: async (input: {
      workspace_id: string;
      enabled: boolean;
      lead_days: number[];
      email_enabled: boolean;
      inapp_enabled: boolean;
    }) => fn({ data: input }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["birthday-reminder-settings", vars.workspace_id] });
    },
  });
}

export function useRunBirthdayRemindersNow() {
  const qc = useQueryClient();
  const fn = useServerFn(runBirthdayRemindersNow);
  return useMutation({
    mutationFn: async (workspace_id: string) => fn({ data: { workspace_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useUpcomingBirthdays(workspaceId: string | undefined, days = 30) {
  const fn = useServerFn(getUpcomingBirthdays);
  return useQuery({
    queryKey: ["upcoming-birthdays", workspaceId, days],
    enabled: !!workspaceId,
    queryFn: async () => fn({ data: { workspace_id: workspaceId!, days } }),
  });
}
