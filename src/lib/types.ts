export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const REMINDER_PRESETS = ["1d", "morning", "1h", "15m", "at"] as const;
export type ReminderPreset = (typeof REMINDER_PRESETS)[number];

export const PRESET_LABEL: Record<ReminderPreset, string> = {
  "1d": "1 day before",
  morning: "8 AM that day",
  "1h": "1 hour before",
  "15m": "15 min before",
  at: "At the time",
};

export type Reminder = {
  id: string;
  preset: ReminderPreset | null;
  remindAt: string;
  sentAt: string | null;
  skipped: boolean;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  notifyCreator: boolean;
  isPersonal: boolean;
  vendorPaymentId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  functionId: string | null;
  functionName: string | null;
  functionColor: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage: string | null;
  reminders: Reminder[];
};

export type WeddingFunction = {
  id: string;
  name: string;
  color: string;
  date: string | null;
  startTime: string | null;
  venue: string | null;
  mapUrl: string | null;
  dressCode: string | null;
  notes: string | null;
  archived: boolean;
  sortOrder: number;
  openCount: number;
};

export type RunItem = {
  id: string;
  functionId: string;
  time: string | null;
  title: string;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerUserName: string | null;
  notes: string | null;
  sortOrder: number;
  done: boolean;
};

export type WeddingSettings = {
  organizationId: string;
  coupleNames: string | null;
  weddingDate: string | null;
  runSheetSlug: string;
  runSheetPublic: boolean;
};

export type TeamMember = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; username: string | null; image?: string | null };
};

export type JoinRequest = {
  id: string;
  createdAt: string;
  user: { id: string; name: string; username: string | null };
};

export type MyJoinRequest = {
  id: string;
  teamId: string;
  teamName: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
};

export type Team = { id: string; name: string; slug: string; logo?: string | null };

/* ------------------------------------------------------------------- songs */

export type SongListKind = "baraat" | "sangeet" | "other";

export const LIST_KIND_LABEL: Record<SongListKind, string> = {
  baraat: "Baraat",
  sangeet: "Sangeet",
  other: "Other",
};

export type SongList = {
  id: string;
  kind: SongListKind;
  title: string;
  description: string | null;
  submitSlug: string;
  djSlug: string;
  isOpen: boolean;
  showListToGuests: boolean;
  createdAt: string;
  songCount?: number;
  dupCount?: number;
};

export type Song = {
  id: string;
  listId: string;
  spotifyId: string | null;
  youtubeId: string | null;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  normKey: string;
  possibleDupOf: string | null;
  hidden: boolean;
  sortOrder: number;
  performer: string | null;
  cutStartSec: number | null;
  cutEndSec: number | null;
  notes: string | null;
  createdAt: string;
  votes: number;
  submitters: string[];
  submissions: Array<{ submitterName: string; rawUrl: string | null; note: string | null; createdAt: string }>;
};

export type SubmitResult = {
  input: string;
  status: "added" | "voted" | "taken" | "error";
  title?: string;
  artist?: string | null;
  thumbnailUrl?: string | null;
  message: string;
};

export type SongMeta = {
  platform: "spotify" | "youtube";
  id: string;
  url: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
};

export type SearchResult = {
  source: "spotify" | "itunes";
  title: string;
  artist: string | null;
  album: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  link: string | null;
};

export type PublicList = {
  title: string;
  description: string | null;
  kind: SongListKind;
  isOpen: boolean;
  showListToGuests: boolean;
  coupleNames: string | null;
  songs: Array<{ id: string; title: string; artist: string | null; thumbnailUrl: string | null; performer: string | null; votes: number }>;
};

export type DjView = {
  title: string;
  kind: SongListKind;
  coupleNames: string | null;
  songs: Array<{
    id: string;
    title: string;
    artist: string | null;
    thumbnailUrl: string | null;
    spotifyId: string | null;
    youtubeId: string | null;
    durationSec: number | null;
    performer: string | null;
    cutStartSec: number | null;
    cutEndSec: number | null;
    notes: string | null;
    votes: number;
  }>;
};

/* ----------------------------------------------------------------- vendors */

export const VENDOR_CATEGORIES = [
  { value: "venue", label: "Venue / Wadi" },
  { value: "caterer", label: "Caterer" },
  { value: "decorator", label: "Decorator" },
  { value: "dj", label: "DJ / Sound" },
  { value: "band", label: "Band / Dhol" },
  { value: "photographer", label: "Photo & Video" },
  { value: "mehndi", label: "Mehndi artist" },
  { value: "makeup", label: "Makeup" },
  { value: "pandit", label: "Pandit / Maharaj" },
  { value: "tent", label: "Mandap / Tent" },
  { value: "florist", label: "Flowers" },
  { value: "transport", label: "Transport" },
  { value: "clothes", label: "Clothes / Tailor" },
  { value: "jeweller", label: "Jeweller" },
  { value: "invites", label: "Invites & gifts" },
  { value: "other", label: "Other" },
] as const;

export const PAYMENT_METHODS = ["cash", "upi", "bank", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank transfer",
  card: "Card",
  other: "Other",
};

export type VendorPayment = {
  id: string;
  vendorId: string;
  amount: number;
  dueAt: string | null;
  paidAt: string | null;
  method: PaymentMethod | null;
  note: string | null;
  taskId: string | null;
  assigneeId: string | null;
  /** Photos of the delivery slip or payment proof. */
  attachments: Array<{ id: string; size: number }>;
};

export type Vendor = {
  id: string;
  name: string;
  category: string;
  contactName: string | null;
  phone: string | null;
  totalAmount: number;
  notes: string | null;
  payments: VendorPayment[];
  totals: { paid: number; scheduled: number; balance: number; unscheduled: number; overpaid: number };
};

export type VendorSummary = {
  committed: number;
  paid: number;
  balance: number;
  byCategory: Record<string, { committed: number; paid: number; balance: number }>;
};

/* ------------------------------------------------------------------- gifts */

export const GIFT_KINDS = ["cash", "gift", "gold", "silver", "other"] as const;
export type GiftKind = (typeof GIFT_KINDS)[number];
export const GIFT_KIND_LABEL: Record<GiftKind, string> = {
  cash: "Cash",
  gift: "Gift",
  gold: "Gold",
  silver: "Silver",
  other: "Other",
};
export type GiftSide = "groom" | "bride";

export type Gift = {
  id: string;
  giverName: string;
  relation: string | null;
  side: GiftSide | null;
  city: string | null;
  kind: GiftKind;
  amount: number | null;
  description: string | null;
  functionId: string | null;
  functionName: string | null;
  recordedById: string;
  recordedByName: string | null;
  createdAt: string;
};

export type GiftSummary = {
  total: { entries: number; cash: number; valued: number };
  byFunction: Array<{ functionId: string | null; functionName: string | null; entries: number; cash: number; valued: number }>;
  bySide: Array<{ side: GiftSide | null; entries: number; cash: number }>;
};

/* --------------------------------------------------------------- dashboard */

export type Dashboard = {
  settings: WeddingSettings;
  today: Task[];
  upcoming: Task[];
  reminders: Array<{ id: string; remindAt: string; taskId: string; title: string }>;
  payments: Array<{ id: string; amount: number; dueAt: string | null; vendorId: string; vendorName: string }>;
  functions: Array<Omit<WeddingFunction, "openCount">>;
  songs: Array<{ id: string; title: string; kind: SongListKind; count: number }>;
};

export type NotifyStatus = {
  push: { configured: boolean; publicKey: string | null; devices: number };
  telegram: { configured: boolean; linked: boolean; botUsername: string | null };
};

/* ---------------------------------------------------------------- filters */

export type TaskFilters = {
  q: string;
  functionIds: string[];
  assigneeIds: string[];
  status: TaskStatus[];
  priority: TaskPriority[];
  due: "overdue" | "today" | "week" | "none" | null;
  scope: "all" | "mine" | "personal" | "created";
  showCompleted: boolean;
  sort: "due" | "priority" | "created" | "updated";
  groupBy: "none" | "function" | "assignee" | "status";
};

export const DEFAULT_FILTERS: TaskFilters = {
  q: "",
  functionIds: [],
  assigneeIds: [],
  status: [],
  priority: [],
  due: null,
  scope: "all",
  showCompleted: false,
  sort: "due",
  groupBy: "function",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

/** Single letters for the calendar's day header; index matches getDay(). */
export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** The function dropdown puts "Personal" first, as if it were a function. */
export const PERSONAL_FUNCTION_ID = "personal";
