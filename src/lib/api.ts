import type {
  Dashboard,
  DjView,
  Gift,
  GiftKind,
  GiftSide,
  GiftSummary,
  JoinRequest,
  MyJoinRequest,
  NotifyStatus,
  PaymentMethod,
  PublicList,
  ReminderPreset,
  RunItem,
  SearchResult,
  Song,
  SongList,
  SongListKind,
  SongMeta,
  SubmitResult,
  Task,
  TaskFilters,
  TaskPriority,
  TaskStatus,
  TeamMember,
  Vendor,
  VendorSummary,
  WeddingFunction,
  WeddingSettings,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** fetch wrapper: sends the session cookie and the current wedding, and turns non-2xx into ApiError. */
export async function request<T>(path: string, options: RequestInit & { teamId?: string | null } = {}): Promise<T> {
  const { teamId, headers, ...init } = options;
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(teamId ? { "x-team-id": teamId } : {}),
      ...headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const payload: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (payload as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return payload as T;
}

const json = (body: unknown) => JSON.stringify(body);

function filtersToQuery(filters: TaskFilters): string {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.functionIds.length) p.set("functionIds", filters.functionIds.join(","));
  if (filters.assigneeIds.length) p.set("assigneeIds", filters.assigneeIds.join(","));
  if (filters.status.length) p.set("status", filters.status.join(","));
  if (filters.priority.length) p.set("priority", filters.priority.join(","));
  if (filters.due) p.set("due", filters.due);
  p.set("scope", filters.scope);
  p.set("showCompleted", String(filters.showCompleted));
  p.set("sort", filters.sort);
  return p.toString();
}

export type TaskInput = {
  title: string;
  description?: string | null;
  functionId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueAt?: string | null;
  notifyCreator?: boolean;
  isPersonal?: boolean;
  reminders?: { presets: ReminderPreset[]; custom: string[] };
};

export type FunctionInput = {
  name: string;
  color?: string;
  date?: string | null;
  startTime?: string | null;
  venue?: string | null;
  mapUrl?: string | null;
  dressCode?: string | null;
  notes?: string | null;
  archived?: boolean;
};

export type RunItemInput = {
  time?: string | null;
  title: string;
  ownerUserId?: string | null;
  ownerName?: string | null;
  notes?: string | null;
  done?: boolean;
};

export type SongEntry = {
  link?: string | null;
  title?: string | null;
  artist?: string | null;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
  performer?: string | null;
  cutStartSec?: number | null;
  cutEndSec?: number | null;
  notes?: string | null;
};

export type VendorInput = {
  name: string;
  category?: string;
  contactName?: string | null;
  phone?: string | null;
  totalAmount?: number;
  notes?: string | null;
};

export type PaymentInput = {
  amount: number;
  dueAt?: string | null;
  paid?: boolean;
  method?: PaymentMethod | null;
  note?: string | null;
  assigneeId?: string | null;
};

export type GiftInput = {
  giverName: string;
  relation?: string | null;
  side?: GiftSide | null;
  city?: string | null;
  kind?: GiftKind;
  amount?: number | null;
  description?: string | null;
  functionId?: string | null;
  clientId?: string;
};

export const api = {
  /* tasks */
  listTasks: (teamId: string, filters: TaskFilters) =>
    request<{ tasks: Task[] }>(`/api/tasks?${filtersToQuery(filters)}`, { teamId }).then((r) => r.tasks),
  getTask: (teamId: string, id: string) =>
    request<{ task: Task }>(`/api/tasks/${id}`, { teamId }).then((r) => r.task),
  createTask: (teamId: string, input: TaskInput) =>
    request<{ task: Task }>("/api/tasks", { method: "POST", body: json(input), teamId }).then((r) => r.task),
  updateTask: (teamId: string, id: string, input: Partial<TaskInput>) =>
    request<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", body: json(input), teamId }).then((r) => r.task),
  toggleTask: (teamId: string, id: string) =>
    request<{ task: Task }>(`/api/tasks/${id}/toggle`, { method: "POST", teamId }).then((r) => r.task),
  snoozeTask: (teamId: string, id: string, body: { minutes: number } | { until: "tomorrow" }) =>
    request<{ task: Task }>(`/api/tasks/${id}/snooze`, { method: "POST", body: json(body), teamId }).then((r) => r.task),
  deleteReminder: (teamId: string, taskId: string, reminderId: string) =>
    request<{ task: Task }>(`/api/tasks/${taskId}/reminders/${reminderId}`, { method: "DELETE", teamId }).then((r) => r.task),
  deleteTask: (teamId: string, id: string) => request<void>(`/api/tasks/${id}`, { method: "DELETE", teamId }),

  /* wedding */
  getSettings: (teamId: string) =>
    request<{ settings: WeddingSettings }>("/api/settings", { teamId }).then((r) => r.settings),
  updateSettings: (
    teamId: string,
    input: Partial<Pick<WeddingSettings, "coupleNames" | "weddingDate" | "runSheetPublic">> & { rotateRunSheetLink?: boolean },
  ) => request<{ settings: WeddingSettings }>("/api/settings", { method: "PATCH", body: json(input), teamId }).then((r) => r.settings),
  dashboard: (teamId: string) => request<Dashboard>("/api/dashboard", { teamId }),

  listFunctions: (teamId: string, includeArchived = false) =>
    request<{ functions: WeddingFunction[] }>(`/api/functions${includeArchived ? "?includeArchived=true" : ""}`, { teamId }).then(
      (r) => r.functions,
    ),
  createFunction: (teamId: string, input: FunctionInput) =>
    request<{ function: WeddingFunction }>("/api/functions", { method: "POST", body: json(input), teamId }).then((r) => r.function),
  updateFunction: (teamId: string, id: string, input: Partial<FunctionInput>) =>
    request<{ function: WeddingFunction }>(`/api/functions/${id}`, { method: "PATCH", body: json(input), teamId }).then((r) => r.function),
  deleteFunction: (teamId: string, id: string) => request<void>(`/api/functions/${id}`, { method: "DELETE", teamId }),
  listRunItems: (teamId: string, functionId: string) =>
    request<{ items: RunItem[] }>(`/api/functions/${functionId}/items`, { teamId }).then((r) => r.items),
  createRunItem: (teamId: string, functionId: string, input: RunItemInput) =>
    request<{ ok: true }>(`/api/functions/${functionId}/items`, { method: "POST", body: json(input), teamId }),
  updateRunItem: (teamId: string, functionId: string, itemId: string, input: Partial<RunItemInput>) =>
    request<{ ok: true }>(`/api/functions/${functionId}/items/${itemId}`, { method: "PATCH", body: json(input), teamId }),
  deleteRunItem: (teamId: string, functionId: string, itemId: string) =>
    request<void>(`/api/functions/${functionId}/items/${itemId}`, { method: "DELETE", teamId }),

  /* songs */
  listSongLists: (teamId: string) => request<{ lists: SongList[] }>("/api/song-lists", { teamId }).then((r) => r.lists),
  createSongList: (teamId: string, input: { kind: SongListKind; title?: string; description?: string | null }) =>
    request<{ list: SongList }>("/api/song-lists", { method: "POST", body: json(input), teamId }).then((r) => r.list),
  updateSongList: (
    teamId: string,
    id: string,
    input: Partial<Pick<SongList, "title" | "description" | "isOpen" | "showListToGuests">> & { rotateSubmitLink?: boolean; rotateDjLink?: boolean },
  ) => request<{ list: SongList }>(`/api/song-lists/${id}`, { method: "PATCH", body: json(input), teamId }).then((r) => r.list),
  deleteSongList: (teamId: string, id: string) => request<void>(`/api/song-lists/${id}`, { method: "DELETE", teamId }),
  listSongs: (teamId: string, listId: string) =>
    request<{ list: SongList; songs: Song[]; youtubeEnabled: boolean }>(`/api/song-lists/${listId}/songs`, { teamId }),
  findYoutubeLinks: (teamId: string, listId: string) =>
    request<{ checked: number; found: number }>(`/api/song-lists/${listId}/find-youtube`, { method: "POST", teamId }),
  addSongs: (teamId: string, listId: string, entries: SongEntry[]) =>
    request<{ results: SubmitResult[] }>(`/api/song-lists/${listId}/songs`, { method: "POST", body: json({ entries }), teamId }).then(
      (r) => r.results,
    ),
  reorderSongs: (teamId: string, listId: string, ids: string[]) =>
    request<{ ok: true }>(`/api/song-lists/${listId}/order`, { method: "PUT", body: json({ ids }), teamId }),
  updateSong: (
    teamId: string,
    id: string,
    input: Partial<Pick<Song, "title" | "artist" | "hidden" | "performer" | "cutStartSec" | "cutEndSec" | "notes">> & {
      link?: string;
      dismissDuplicate?: boolean;
    },
  ) => request<{ song: Song }>(`/api/songs/${id}`, { method: "PATCH", body: json(input), teamId }),
  mergeSong: (teamId: string, id: string, intoId: string) =>
    request<{ ok: true }>(`/api/songs/${id}/merge`, { method: "POST", body: json({ intoId }), teamId }),
  deleteSong: (teamId: string, id: string) => request<void>(`/api/songs/${id}`, { method: "DELETE", teamId }),

  /* vendors */
  listVendors: (teamId: string) => request<{ vendors: Vendor[]; summary: VendorSummary }>("/api/vendors", { teamId }),
  createVendor: (teamId: string, input: VendorInput) =>
    request<{ vendor: Vendor }>("/api/vendors", { method: "POST", body: json(input), teamId }),
  updateVendor: (teamId: string, id: string, input: Partial<VendorInput>) =>
    request<{ vendor: Vendor }>(`/api/vendors/${id}`, { method: "PATCH", body: json(input), teamId }),
  deleteVendor: (teamId: string, id: string) => request<void>(`/api/vendors/${id}`, { method: "DELETE", teamId }),
  addPayment: (teamId: string, vendorId: string, input: PaymentInput) =>
    request<{ ok: true }>(`/api/vendors/${vendorId}/payments`, { method: "POST", body: json(input), teamId }),
  updatePayment: (teamId: string, vendorId: string, paymentId: string, input: Partial<PaymentInput>) =>
    request<{ ok: true }>(`/api/vendors/${vendorId}/payments/${paymentId}`, { method: "PATCH", body: json(input), teamId }),
  deletePayment: (teamId: string, vendorId: string, paymentId: string) =>
    request<void>(`/api/vendors/${vendorId}/payments/${paymentId}`, { method: "DELETE", teamId }),

  /* gifts */
  listGifts: (teamId: string, params: { q?: string; functionId?: string; side?: string }) => {
    const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<{ gifts: Gift[]; canSeeAll: boolean }>(`/api/gifts?${p}`, { teamId });
  },
  giftSummary: (teamId: string) => request<GiftSummary>("/api/gifts/summary", { teamId }),
  giftNames: (teamId: string, q: string) =>
    request<{ names: Array<{ giverName: string; city: string | null; relation: string | null; side: GiftSide | null }> }>(
      `/api/gifts/names?q=${encodeURIComponent(q)}`,
      { teamId },
    ).then((r) => r.names),
  addGift: (teamId: string, input: GiftInput) =>
    request<{ id: string; duplicate?: boolean }>("/api/gifts", { method: "POST", body: json(input), teamId }),
  updateGift: (teamId: string, id: string, input: Partial<GiftInput>) =>
    request<{ ok: true }>(`/api/gifts/${id}`, { method: "PATCH", body: json(input), teamId }),
  deleteGift: (teamId: string, id: string) => request<void>(`/api/gifts/${id}`, { method: "DELETE", teamId }),

  /* notifications */
  notifyStatus: () => request<NotifyStatus>("/api/notify/status"),
  subscribePush: (sub: PushSubscriptionJSON) =>
    request<{ ok: true }>("/api/notify/push/subscribe", { method: "POST", body: json(sub) }),
  unsubscribePush: (endpoint: string) =>
    request<{ ok: true }>("/api/notify/push/unsubscribe", { method: "POST", body: json({ endpoint }) }),
  telegramLink: () => request<{ url: string; expiresAt: string }>("/api/notify/telegram/link", { method: "POST" }),
  telegramUnlink: () => request<{ ok: true }>("/api/notify/telegram/unlink", { method: "POST" }),
  testNotify: () => request<{ push: number; telegram: number }>("/api/notify/test", { method: "POST" }),

  /* team */
  listMembers: (teamId: string) =>
    request<{ members: TeamMember[] }>("/api/teams/members", { teamId }).then((r) => r.members),
  removeMember: (teamId: string, userId: string) => request<void>(`/api/teams/members/${userId}`, { method: "DELETE", teamId }),
  setMemberRole: (teamId: string, userId: string, role: "admin" | "member") =>
    request<{ ok: true }>(`/api/teams/members/${userId}`, { method: "PATCH", body: json({ role }), teamId }),
  getTeamCode: (teamId: string) => request<{ code: string }>("/api/teams/code", { teamId }).then((r) => r.code),
  rotateTeamCode: (teamId: string) =>
    request<{ code: string }>("/api/teams/code/rotate", { method: "POST", teamId }).then((r) => r.code),
  listJoinRequests: (teamId: string) =>
    request<{ requests: JoinRequest[] }>("/api/teams/requests", { teamId }).then((r) => r.requests),
  acceptJoinRequest: (teamId: string, id: string) =>
    request<{ ok: true }>(`/api/teams/requests/${id}/accept`, { method: "POST", teamId }),
  rejectJoinRequest: (teamId: string, id: string) =>
    request<{ ok: true }>(`/api/teams/requests/${id}/reject`, { method: "POST", teamId }),
  joinTeam: (code: string) =>
    request<{ request: MyJoinRequest }>("/api/teams/join", { method: "POST", body: json({ code }) }).then((r) => r.request),
  myJoinRequests: () => request<{ requests: MyJoinRequest[] }>("/api/teams/my-requests").then((r) => r.requests),
  cancelJoinRequest: (id: string) => request<void>(`/api/teams/my-requests/${id}`, { method: "DELETE" }),
};

/** No login: the guest song form and the DJ page. */
export const publicApi = {
  list: (slug: string) => request<PublicList>(`/api/public/lists/${slug}`),
  preview: (slug: string, url: string) =>
    request<{ ok: true; meta: SongMeta } | { ok: false; message: string }>(
      `/api/public/lists/${slug}/preview?url=${encodeURIComponent(url)}`,
    ),
  search: (slug: string, q: string) =>
    request<{ results: SearchResult[]; source: "spotify" | "itunes" | null }>(
      `/api/public/lists/${slug}/search?q=${encodeURIComponent(q)}`,
    ),
  submit: (slug: string, body: { name: string; note?: string; website?: string; entries: SongEntry[] }) =>
    request<{ results: SubmitResult[] }>(`/api/public/lists/${slug}/submit`, { method: "POST", body: json(body) }),
  dj: (slug: string) => request<DjView>(`/api/public/dj/${slug}`),
};
