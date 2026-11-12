"use client";

import { CornerDownLeft, Lock, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_PRESETS } from "@/components/tasks/due-and-reminders";
import { useMembers, useFunctions, useTaskMutations } from "@/components/tasks/use-tasks";
import { Button, DateField, Select, TimeField } from "@/components/ui";
import { useSession } from "@/lib/auth-client";
import { cn, combineDateTime } from "@/lib/format";
import { PERSONAL_FUNCTION_ID } from "@/lib/types";

/**
 * Title on top; function, assignee and due time below it. Choosing "Personal"
 * makes the task private and assigns it to you.
 */
export function QuickAdd({ defaultPersonal = false }: { defaultPersonal?: boolean }) {
  const { data: session } = useSession();
  const { data: functions = [] } = useFunctions();
  const { data: members = [] } = useMembers();
  const { create } = useTaskMutations();

  const [title, setTitle] = useState("");
  const [functionId, setFunctionId] = useState(defaultPersonal ? PERSONAL_FUNCTION_ID : "");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("10:00");
  const inputRef = useRef<HTMLInputElement>(null);

  const isPersonal = functionId === PERSONAL_FUNCTION_ID;

  // Follow the current view: the Personal list adds personal tasks by default.
  useEffect(() => {
    setFunctionId(defaultPersonal ? PERSONAL_FUNCTION_ID : "");
  }, [defaultPersonal]);

  // "N" anywhere on the page jumps into the title box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (typing) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    create.mutate({
      title: trimmed,
      isPersonal,
      // A personal task carries no function and is always your own.
      functionId: isPersonal ? null : functionId || null,
      assigneeId: isPersonal ? null : assigneeId || null,
      dueAt: combineDateTime(dueDate, dueTime),
      // A dated task reminds an hour before and at the time; change it in the task.
      reminders: dueDate ? { presets: DEFAULT_PRESETS, custom: [] } : undefined,
    });

    setTitle("");
    setDueDate("");
    inputRef.current?.focus();
  };

  return (
    <div className="border-b border-rule bg-paper/95 px-3 py-2.5 backdrop-blur md:px-4">
      <div
        className={cn(
          "flex items-center gap-2 rounded-[10px] border bg-raised px-3 transition-colors",
          title ? "border-signal" : "border-rule-strong",
        )}
      >
        {isPersonal ? (
          <Lock className="size-4 shrink-0 text-signal" />
        ) : (
          <Plus className="size-4 shrink-0 text-ink-muted" />
        )}
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") setTitle("");
          }}
          placeholder={isPersonal ? "Add a personal task…" : "Add a task — e.g. Collect sherwani from tailor"}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted/70"
          aria-label="Task title"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          value={functionId}
          onChange={setFunctionId}
          ariaLabel="Function"
          size="sm"
          wrapperClassName="min-w-0 flex-1 sm:flex-none sm:w-44"
          options={[
            { value: PERSONAL_FUNCTION_ID, label: "Personal", note: "private" },
            { value: "", label: "General" },
            ...functions.map((p) => ({ value: p.id, label: p.name, dot: p.color })),
          ]}
        />

        <Select
          value={isPersonal ? "" : assigneeId}
          onChange={setAssigneeId}
          disabled={isPersonal}
          ariaLabel="Assignee"
          title={isPersonal ? "Personal tasks are always yours" : "Assignee"}
          size="sm"
          wrapperClassName="min-w-0 flex-1 sm:flex-none sm:w-44"
          options={
            isPersonal
              ? [{ value: "", label: session?.user.name ?? "You" }]
              : [
                  { value: "", label: "Unassigned" },
                  ...members.map((m) => ({
                    value: m.userId,
                    label: m.user.name,
                    note: m.userId === session?.user.id ? "you" : undefined,
                  })),
                ]
          }
        />

        <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
          <div className="min-w-0 flex-1 sm:w-40 sm:flex-none [&_button]:h-9">
            <DateField value={dueDate} onChange={setDueDate} placeholder="Due date" />
          </div>
          <div className={cn("w-28 shrink-0 [&_button]:h-9", !dueDate && "pointer-events-none opacity-40")}>
            <TimeField value={dueTime} onChange={setDueTime} />
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={!title.trim() || create.isPending}
          className="ml-auto h-9 shrink-0 px-3.5"
        >
          Add
          <CornerDownLeft className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
