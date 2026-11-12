"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTeam } from "@/components/team-context";
import { api, type FunctionInput, type TaskInput } from "@/lib/api";
import type { Task, TaskFilters } from "@/lib/types";

export function useFunctions(includeArchived = false) {
  const { teamId } = useTeam();
  return useQuery({
    queryKey: ["functions", teamId, includeArchived],
    queryFn: () => api.listFunctions(teamId!, includeArchived),
    enabled: Boolean(teamId),
  });
}

export function useMembers() {
  const { teamId } = useTeam();
  return useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api.listMembers(teamId!),
    enabled: Boolean(teamId),
  });
}

export function useTasks(filters: TaskFilters) {
  const { teamId } = useTeam();
  return useQuery({
    queryKey: ["tasks", teamId, filters],
    queryFn: () => api.listTasks(teamId!, filters),
    enabled: Boolean(teamId),
    placeholderData: (previous) => previous,
  });
}

/** Lists that show tasks, so every change refreshes them all. */
export function useInvalidateTaskViews() {
  const { teamId } = useTeam();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["tasks", teamId] });
    void qc.invalidateQueries({ queryKey: ["functions", teamId] });
    void qc.invalidateQueries({ queryKey: ["dashboard", teamId] });
    void qc.invalidateQueries({ queryKey: ["vendors", teamId] });
  };
}

/** Create / update / toggle / delete, all invalidating the same views. */
export function useTaskMutations() {
  const { teamId } = useTeam();
  const qc = useQueryClient();
  const invalidate = useInvalidateTaskViews();

  const create = useMutation({
    mutationFn: (input: TaskInput) => api.createTask(teamId!, input),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...input }: Partial<TaskInput> & { id: string }) => api.updateTask(teamId!, id, input),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (task: Task) => api.toggleTask(teamId!, task.id),
    // Optimistic: the checkbox must feel instant.
    onMutate: async (task) => {
      await qc.cancelQueries({ queryKey: ["tasks", teamId] });
      const snapshots = qc.getQueriesData<Task[]>({ queryKey: ["tasks", teamId] });
      for (const [key, list] of snapshots) {
        if (!list) continue;
        qc.setQueryData<Task[]>(
          key,
          list.map((t) => (t.id === task.id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t)),
        );
      }
      return { snapshots };
    },
    onError: (e: Error, _task, context) => {
      for (const [key, list] of context?.snapshots ?? []) qc.setQueryData(key, list);
      toast.error(e.message);
    },
    onSuccess: (updated) => {
      if (updated.status === "done") {
        toast(`Done: ${updated.title}`, { action: { label: "Undo", onClick: () => toggle.mutate(updated) } });
      }
    },
    onSettled: invalidate,
  });

  const snooze = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ({ minutes: number } | { until: "tomorrow" })) =>
      api.snoozeTask(teamId!, id, body),
    onSuccess: () => {
      invalidate();
      toast("Reminder added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTask(teamId!, id),
    onSuccess: () => {
      invalidate();
      toast("Task deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { create, update, toggle, snooze, remove };
}

export function useFunctionMutations() {
  const { teamId } = useTeam();
  const invalidate = useInvalidateTaskViews();
  const qc = useQueryClient();
  const refresh = () => {
    invalidate();
    void qc.invalidateQueries({ queryKey: ["runItems", teamId] });
  };

  const create = useMutation({
    mutationFn: (input: FunctionInput) => api.createFunction(teamId!, input),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: Partial<FunctionInput> & { id: string }) => api.updateFunction(teamId!, id, input),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteFunction(teamId!, id),
    onSuccess: () => {
      refresh();
      toast("Function deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { create, update, remove };
}
