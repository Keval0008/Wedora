"use client";

import { AlarmClock, IndianRupee, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DueAndReminders, storedPresets } from "@/components/tasks/due-and-reminders";
import { useFunctions, useMembers, useTaskMutations } from "@/components/tasks/use-tasks";
import { useTeam } from "@/components/team-context";
import { Button, Input, Label, Select, Sheet, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type ReminderPreset,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";

/** Detail editor: side panel on desktop, bottom drawer on phones. */
export function TaskSheet({
  task,
  currentUserId,
  onClose,
}: {
  task: Task | null;
  currentUserId: string;
  onClose: () => void;
}) {
  const { teamId } = useTeam();
  const { data: functions = [] } = useFunctions();
  const { data: members = [] } = useMembers();
  const { update, remove, snooze } = useTaskMutations();

  /**
   * The panel edits its own copy. Saving refreshes the list in the background,
   * and that refresh hands back the task as it was before the edit landed, so
   * reading straight from the prop would make a just-picked value flick back.
   */
  const [draft, setDraft] = useState<Task | null>(task);
  const [presets, setPresets] = useState<ReminderPreset[]>(task ? storedPresets(task.reminders) : []);

  const openId = task?.id ?? null;
  useEffect(() => {
    // Replace the copy only when a different task is opened, never on a refetch.
    setDraft(task);
    setPresets(task ? storedPresets(task.reminders) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on which task is open
  }, [openId]);

  // A refetch brings new reminder rows (sent ones, snoozes): show those.
  useEffect(() => {
    if (task && draft && task.id === draft.id && task.reminders !== draft.reminders) {
      setDraft({ ...draft, reminders: task.reminders });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only follow server reminder changes
  }, [task?.reminders]);

  if (!task || !draft) return null;

  const readOnly = draft.isPersonal && draft.createdById !== currentUserId;
  const customTimes = draft.reminders.filter((r) => !r.preset && !r.sentAt).map((r) => r.remindAt);

  const edit = (changes: Partial<Task>, patch: Parameters<typeof update.mutate>[0]) => {
    setDraft({ ...draft, ...changes });
    update.mutate(patch, { onSuccess: (fresh) => setDraft((d) => (d && d.id === fresh.id ? { ...d, reminders: fresh.reminders } : d)) });
  };

  const commitText = () => {
    const title = draft.title.trim();
    if (!title) return;
    const description = draft.description ?? "";
    if (title !== task.title || description !== (task.description ?? "")) {
      update.mutate({ id: draft.id, title, description: description || null });
    }
  };

  const assignedToSomeoneElse = draft.assigneeId && draft.assigneeId !== currentUserId;

  return (
    <Sheet
      open={Boolean(task)}
      onClose={() => {
        commitText();
        onClose();
      }}
      title={draft.isPersonal ? "Personal task" : draft.vendorPaymentId ? "Payment task" : "Task"}
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            disabled={readOnly || Boolean(draft.vendorPaymentId)}
            title={draft.vendorPaymentId ? "Delete the payment on the Vendors page instead" : undefined}
            onClick={() => {
              remove.mutate(draft.id);
              onClose();
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            onClick={() => {
              commitText();
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="task-title">Title</Label>
          <Input
            id="task-title"
            value={draft.title}
            disabled={readOnly}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onBlur={commitText}
          />
        </div>

        {draft.vendorPaymentId && (
          <Link
            href="/vendors"
            className="flex items-center gap-2 rounded-[8px] border border-marigold/40 bg-marigold-soft px-3 py-2 text-[13px] text-ink-soft"
          >
            <IndianRupee className="size-4 text-marigold" />
            Made from a vendor payment. Ticking it done marks the payment paid.
          </Link>
        )}

        <DueAndReminders
          idPrefix="task"
          dueAt={draft.dueAt}
          presets={presets}
          reminders={draft.reminders}
          disabled={readOnly}
          onDueChange={(dueAt) => edit({ dueAt }, { id: draft.id, dueAt })}
          onPresetsChange={(next) => {
            setPresets(next);
            update.mutate(
              { id: draft.id, reminders: { presets: next, custom: customTimes } },
              { onSuccess: (fresh) => setDraft((d) => (d && d.id === fresh.id ? { ...d, reminders: fresh.reminders } : d)) },
            );
          }}
          onRemoveReminder={(id) =>
            void api.deleteReminder(teamId!, draft.id, id).then((fresh) => setDraft((d) => (d ? { ...d, reminders: fresh.reminders } : d)))
          }
        />

        {draft.dueAt && !readOnly && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
              <AlarmClock className="size-3.5" /> Also
            </span>
            {[
              { label: "in 1 hour", body: { minutes: 60 } },
              { label: "in 3 hours", body: { minutes: 180 } },
              { label: "tomorrow 9 AM", body: { until: "tomorrow" as const } },
            ].map((s) => (
              <Button
                key={s.label}
                size="sm"
                variant="ghost"
                className="h-7 border border-dashed border-rule-strong"
                onClick={() =>
                  snooze.mutate(
                    { id: draft.id, ...s.body },
                    { onSuccess: (fresh) => setDraft((d) => (d && d.id === fresh.id ? { ...d, reminders: fresh.reminders } : d)) },
                  )
                }
              >
                {s.label}
              </Button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {!draft.isPersonal && (
            <>
              <div>
                <Label htmlFor="task-assignee">Assignee</Label>
                <Select
                  id="task-assignee"
                  value={draft.assigneeId ?? ""}
                  disabled={readOnly}
                  ariaLabel="Assignee"
                  onChange={(v) => {
                    const m = members.find((x) => x.userId === v);
                    edit(
                      { assigneeId: v || null, assigneeName: m?.user.name ?? null, assigneeImage: m?.user.image ?? null },
                      { id: draft.id, assigneeId: v || null },
                    );
                  }}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...members.map((m) => ({ value: m.userId, label: m.user.name, note: m.userId === currentUserId ? "you" : undefined })),
                  ]}
                />
              </div>

              <div>
                <Label htmlFor="task-function">Function</Label>
                <Select
                  id="task-function"
                  value={draft.functionId ?? ""}
                  disabled={readOnly}
                  ariaLabel="Function"
                  onChange={(v) => {
                    const f = functions.find((x) => x.id === v);
                    edit(
                      { functionId: v || null, functionName: f?.name ?? null, functionColor: f?.color ?? null },
                      { id: draft.id, functionId: v || null },
                    );
                  }}
                  options={[{ value: "", label: "General" }, ...functions.map((f) => ({ value: f.id, label: f.name, dot: f.color }))]}
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="task-status">Status</Label>
            <Select
              id="task-status"
              value={draft.status}
              disabled={readOnly}
              ariaLabel="Status"
              onChange={(v) => edit({ status: v as TaskStatus }, { id: draft.id, status: v as TaskStatus })}
              options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            />
          </div>

          <div>
            <Label htmlFor="task-priority">Priority</Label>
            <Select
              id="task-priority"
              value={draft.priority}
              disabled={readOnly}
              ariaLabel="Priority"
              onChange={(v) => edit({ priority: v as TaskPriority }, { id: draft.id, priority: v as TaskPriority })}
              options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p], dot: `var(--${p})` }))}
            />
          </div>
        </div>

        {assignedToSomeoneElse && !readOnly && (
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={draft.notifyCreator}
              onChange={(e) => edit({ notifyCreator: e.target.checked }, { id: draft.id, notifyCreator: e.target.checked })}
            />
            Remind me too, not only {draft.assigneeName ?? "the assignee"}
          </label>
        )}

        <div>
          <Label htmlFor="task-desc">Notes</Label>
          <Textarea
            id="task-desc"
            value={draft.description ?? ""}
            disabled={readOnly}
            placeholder="Shop address, phone number, what to check…"
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            onBlur={commitText}
          />
        </div>

        {readOnly && (
          <p className="rounded-[8px] border border-rule bg-sunken px-3 py-2 text-[13px] text-ink-muted">
            This is someone else&apos;s personal task, so it can&apos;t be edited.
          </p>
        )}
      </div>
    </Sheet>
  );
}
