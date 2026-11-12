// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

const update = { mutate: vi.fn() };
const remove = { mutate: vi.fn() };
const snooze = { mutate: vi.fn() };

// The panel only needs functions, members and the mutations; skip react-query.
vi.mock("@/components/tasks/use-tasks", () => ({
  useFunctions: () => ({
    data: [{ id: "f1", name: "Sangeet", color: "#b4232c", archived: false, openCount: 0 }],
  }),
  useMembers: () => ({
    data: [{ id: "m1", userId: "u2", role: "member", user: { id: "u2", name: "Riya", username: "riya" } }],
  }),
  useTaskMutations: () => ({ update, remove, snooze }),
}));
vi.mock("@/components/team-context", () => ({ useTeam: () => ({ teamId: "team1" }) }));

const { TaskSheet } = await import("./task-sheet");

const task: Task = {
  id: "t1",
  title: "Ship the invoice fix",
  description: null,
  status: "todo",
  priority: "medium",
  dueAt: null,
  notifyCreator: false,
  isPersonal: false,
  vendorPaymentId: null,
  completedAt: null,
  createdAt: "2026-09-16T10:00:00.000Z",
  updatedAt: "2026-09-16T10:00:00.000Z",
  createdById: "u1",
  functionId: null,
  functionName: null,
  functionColor: null,
  assigneeId: null,
  assigneeName: null,
  assigneeImage: null,
  reminders: [],
};

afterEach(cleanup);
beforeEach(() => {
  update.mutate.mockClear();
  remove.mutate.mockClear();
});

describe("TaskSheet", () => {
  it("shows a newly picked status straight away", async () => {
    const user = userEvent.setup();
    render(<TaskSheet task={task} currentUserId="u1" onClose={() => {}} />);

    const status = screen.getByRole("combobox", { name: "Status" });
    expect(status.textContent).toContain("To do");

    await user.click(status);
    await user.click(screen.getByRole("option", { name: /In progress/ }));

    expect(update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", status: "in_progress" }),
      expect.anything(),
    );
    expect(screen.getByRole("combobox", { name: "Status" }).textContent).toContain("In progress");
  });

  it("shows a newly picked function straight away", async () => {
    const user = userEvent.setup();
    render(<TaskSheet task={task} currentUserId="u1" onClose={() => {}} />);

    const fn = screen.getByRole("combobox", { name: "Function" });
    expect(fn.textContent).toContain("General");

    await user.click(fn);
    await user.click(screen.getByRole("option", { name: /Sangeet/ }));

    expect(update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", functionId: "f1" }),
      expect.anything(),
    );
    expect(screen.getByRole("combobox", { name: "Function" }).textContent).toContain("Sangeet");
  });

  it("asks for a due date before offering reminders", () => {
    render(<TaskSheet task={task} currentUserId="u1" onClose={() => {}} />);
    expect(screen.getByText("Set a due date to get reminders.")).toBeTruthy();
  });

  it("offers reminder presets once the task has a due time", () => {
    const due = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString();
    render(<TaskSheet task={{ ...task, dueAt: due }} currentUserId="u1" onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "1 hour before" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "At the time" })).toBeTruthy();
  });

  it("keeps every character typed into Notes", async () => {
    const user = userEvent.setup();
    render(<TaskSheet task={task} currentUserId="u1" onClose={() => {}} />);

    const notes = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    await user.click(notes);
    await user.keyboard("Call the bank");

    expect(notes.value).toBe("Call the bank");
    expect(document.activeElement).toBe(notes);
  });

  it("keeps showing a fresher value when the task list refreshes with stale data", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TaskSheet task={task} currentUserId="u1" onClose={() => {}} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Priority" }));
    await user.click(screen.getByRole("option", { name: /Urgent/ }));
    expect(screen.getByRole("combobox", { name: "Priority" }).textContent).toContain("Urgent");

    // A background refetch hands the same task object back, still saying "medium".
    rerender(<TaskSheet task={{ ...task }} currentUserId="u1" onClose={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Priority" }).textContent).toContain("Urgent");
  });
});
