import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getTaskReminderSettings,
  upsertTaskReminderSettings,
  runTaskRemindersNow,
} from "@/lib/tasks/reminders.functions";

export function useTaskReminderSettings() {
  const fn = useServerFn(getTaskReminderSettings);
  return useQuery({
    queryKey: ["task-reminder-settings"],
    queryFn: async () => fn(),
  });
}

export function useUpsertTaskReminderSettings() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertTaskReminderSettings);
  return useMutation({
    mutationFn: async (input: {
      enabled: boolean;
      lead_minutes: number[];
      notify_overdue: boolean;
      overdue_repeat_minutes: number;
      inapp_enabled: boolean;
      email_enabled: boolean;
    }) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-reminder-settings"] }),
  });
}

export function useRunTaskRemindersNow() {
  const qc = useQueryClient();
  const fn = useServerFn(runTaskRemindersNow);
  return useMutation({
    mutationFn: async () => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
