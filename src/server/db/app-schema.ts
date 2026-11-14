import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { organization, user } from "./auth-schema";

/** Every timestamp column is UTC (the pool pins the session time zone). */
const createdAt = () =>
  datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const updatedAt = () =>
  datetime("updated_at", { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date());
const orgId = () =>
  varchar("organization_id", { length: 36 })
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const taskStatuses = ["todo", "in_progress", "done"] as const;
export const taskPriorities = ["low", "medium", "high", "urgent"] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export type TaskPriority = (typeof taskPriorities)[number];

/* ======================================================= wedding & functions */

/** One row per wedding (organization): the countdown and the public run-sheet link. */
export const weddingSettings = mysqlTable("wedding_settings", {
  organizationId: varchar("organization_id", { length: 36 })
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  coupleNames: varchar("couple_names", { length: 200 }),
  /** IST calendar date, "YYYY-MM-DD". */
  weddingDate: varchar("wedding_date", { length: 10 }),
  runSheetSlug: varchar("run_sheet_slug", { length: 16 }).notNull().unique(),
  runSheetPublic: boolean("run_sheet_public").notNull().default(false),
  updatedAt: updatedAt(),
});

/** A wedding function (Mehndi, Sangeet, Hast Melap…). Tasks are grouped by it. */
export const weddingFunction = mysqlTable(
  "wedding_function",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: orgId(),
    name: varchar("name", { length: 120 }).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#b4232c"),
    /** IST calendar date, "YYYY-MM-DD". */
    date: varchar("date", { length: 10 }),
    /** IST clock time, "HH:MM". */
    startTime: varchar("start_time", { length: 5 }),
    venue: varchar("venue", { length: 200 }),
    mapUrl: varchar("map_url", { length: 600 }),
    dressCode: varchar("dress_code", { length: 200 }),
    notes: text("notes"),
    sortOrder: int("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("function_org_idx").on(t.organizationId, t.archived)],
);

/** One line of a function's timeline. */
export const runItem = mysqlTable(
  "run_item",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: orgId(),
    functionId: varchar("function_id", { length: 36 })
      .notNull()
      .references(() => weddingFunction.id, { onDelete: "cascade" }),
    /** IST clock time, "HH:MM". */
    time: varchar("time", { length: 5 }),
    title: varchar("title", { length: 200 }).notNull(),
    ownerUserId: varchar("owner_user_id", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    /** For owners without an account ("Mama", "Pandit ji"). */
    ownerName: varchar("owner_name", { length: 100 }),
    notes: text("notes"),
    sortOrder: int("sort_order").notNull().default(0),
    done: boolean("done").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("run_item_function_idx").on(t.functionId, t.sortOrder)],
);

/* ===================================================================== tasks */

export const task = mysqlTable(
  "task",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: orgId(),
    functionId: varchar("function_id", { length: 36 }).references(() => weddingFunction.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", taskStatuses).notNull().default("todo"),
    priority: mysqlEnum("priority", taskPriorities).notNull().default("medium"),
    assigneeId: varchar("assignee_id", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** When it is due, to the minute (UTC). */
    dueAt: datetime("due_at", { fsp: 3 }),
    /** Also send reminders to the creator, not only the assignee. */
    notifyCreator: boolean("notify_creator").notNull().default(false),
    isPersonal: boolean("is_personal").notNull().default(false),
    /** Set when the task was made for a vendor payment's due date. */
    vendorPaymentId: varchar("vendor_payment_id", { length: 36 }),
    completedAt: datetime("completed_at", { fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("task_org_status_idx").on(t.organizationId, t.status),
    index("task_org_function_idx").on(t.organizationId, t.functionId),
    index("task_assignee_idx").on(t.organizationId, t.assigneeId),
    index("task_personal_idx").on(t.organizationId, t.createdById, t.isPersonal),
    index("task_due_idx").on(t.organizationId, t.dueAt),
    index("task_payment_idx").on(t.vendorPaymentId),
  ],
);

export type Task = typeof task.$inferSelect;

export const reminderPresets = ["at", "15m", "1h", "morning", "1d"] as const;
export type ReminderPreset = (typeof reminderPresets)[number];

/** A moment to alert about a task. The tick endpoint sends due ones exactly once. */
export const reminder = mysqlTable(
  "reminder",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    taskId: varchar("task_id", { length: 36 })
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    /** Relative to the due time; null for a custom time or a snooze. */
    preset: mysqlEnum("preset", reminderPresets),
    remindAt: datetime("remind_at", { fsp: 3 }).notNull(),
    /** Claimed (and then sent or skipped) at this time. */
    sentAt: datetime("sent_at", { fsp: 3 }),
    /** Claimed but not sent: the task was done, or the reminder was too late. */
    skipped: boolean("skipped").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("reminder_due_idx").on(t.sentAt, t.remindAt),
    index("reminder_task_idx").on(t.taskId),
  ],
);

export type Reminder = typeof reminder.$inferSelect;

/* ============================================================ notifications */

/** One browser or phone that accepted push notifications. */
export const pushSubscription = mysqlTable(
  "push_subscription",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: varchar("endpoint", { length: 700 }).notNull().unique(),
    p256dh: varchar("p256dh", { length: 200 }).notNull(),
    auth: varchar("auth", { length: 100 }).notNull(),
    userAgent: varchar("user_agent", { length: 300 }),
    createdAt: createdAt(),
  },
  (t) => [index("push_user_idx").on(t.userId)],
);

/** A person's Telegram chat, linked through a one-time /start code. */
export const telegramLink = mysqlTable("telegram_link", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id", { length: 40 }).unique(),
  linkCode: varchar("link_code", { length: 40 }).unique(),
  linkExpiresAt: datetime("link_expires_at", { fsp: 3 }),
  updatedAt: updatedAt(),
});

/** Inserting a key claims a once-only job, such as one day's digest. */
export const jobState = mysqlTable("job_state", {
  key: varchar("key", { length: 100 }).primaryKey(),
  createdAt: createdAt(),
});

/* ===================================================================== songs */

export const songListKinds = ["baraat", "sangeet", "other"] as const;
export type SongListKind = (typeof songListKinds)[number];

export const songList = mysqlTable(
  "song_list",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: orgId(),
    kind: mysqlEnum("kind", songListKinds).notNull().default("baraat"),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description"),
    /** Public link guests use to suggest songs: /s/<submitSlug>. */
    submitSlug: varchar("submit_slug", { length: 16 }).notNull().unique(),
    /** Read-only link for the DJ: /dj/<djSlug>. */
    djSlug: varchar("dj_slug", { length: 16 }).notNull().unique(),
    isOpen: boolean("is_open").notNull().default(true),
    showListToGuests: boolean("show_list_to_guests").notNull().default(true),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("song_list_org_idx").on(t.organizationId)],
);

export type SongList = typeof songList.$inferSelect;

/**
 * One song on a list, however many people suggested it. A song can carry both a
 * Spotify and a YouTube id once two links for it have been merged.
 */
export const song = mysqlTable(
  "song",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    listId: varchar("list_id", { length: 36 })
      .notNull()
      .references(() => songList.id, { onDelete: "cascade" }),
    spotifyId: varchar("spotify_id", { length: 32 }),
    youtubeId: varchar("youtube_id", { length: 16 }),
    title: varchar("title", { length: 300 }).notNull(),
    artist: varchar("artist", { length: 300 }),
    thumbnailUrl: varchar("thumbnail_url", { length: 600 }),
    durationSec: int("duration_sec"),
    /** Normalized title used to spot the same song across platforms. */
    normKey: varchar("norm_key", { length: 300 }).notNull(),
    /** A near match the owner has not merged or dismissed yet. */
    possibleDupOf: varchar("possible_dup_of", { length: 36 }),
    hidden: boolean("hidden").notNull().default(false),
    sortOrder: int("sort_order").notNull().default(0),
    // Sangeet performances
    performer: varchar("performer", { length: 120 }),
    cutStartSec: int("cut_start_sec"),
    cutEndSec: int("cut_end_sec"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("song_list_spotify_uidx").on(t.listId, t.spotifyId),
    uniqueIndex("song_list_youtube_uidx").on(t.listId, t.youtubeId),
    index("song_list_norm_idx").on(t.listId, t.normKey),
    index("song_list_order_idx").on(t.listId, t.sortOrder),
  ],
);

export type Song = typeof song.$inferSelect;

/** Each suggestion. The count per song is its "requested by N". */
export const songSubmission = mysqlTable(
  "song_submission",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    songId: varchar("song_id", { length: 36 })
      .notNull()
      .references(() => song.id, { onDelete: "cascade" }),
    listId: varchar("list_id", { length: 36 })
      .notNull()
      .references(() => songList.id, { onDelete: "cascade" }),
    submitterName: varchar("submitter_name", { length: 80 }).notNull(),
    rawUrl: varchar("raw_url", { length: 600 }),
    note: varchar("note", { length: 500 }),
    /** Salted hash of the guest's IP: the rate limit for the public form. */
    ipHash: varchar("ip_hash", { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("submission_song_idx").on(t.songId),
    index("submission_rate_idx").on(t.ipHash, t.createdAt),
  ],
);

/* =================================================================== vendors */

export const vendor = mysqlTable(
  "vendor",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: orgId(),
    name: varchar("name", { length: 150 }).notNull(),
    category: varchar("category", { length: 40 }).notNull().default("other"),
    contactName: varchar("contact_name", { length: 120 }),
    phone: varchar("phone", { length: 20 }),
    /** The agreed total, in whole rupees. */
    totalAmount: int("total_amount").notNull().default(0),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("vendor_org_idx").on(t.organizationId)],
);

export const paymentMethods = ["cash", "upi", "bank", "card", "other"] as const;

/** An instalment: paid when `paidAt` is set, otherwise due (optionally on `dueAt`). */
export const vendorPayment = mysqlTable(
  "vendor_payment",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: orgId(),
    vendorId: varchar("vendor_id", { length: 36 })
      .notNull()
      .references(() => vendor.id, { onDelete: "cascade" }),
    amount: int("amount").notNull(),
    dueAt: datetime("due_at", { fsp: 3 }),
    paidAt: datetime("paid_at", { fsp: 3 }),
    method: mysqlEnum("method", paymentMethods),
    note: varchar("note", { length: 300 }),
    createdById: varchar("created_by_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("payment_vendor_idx").on(t.vendorId)],
);

export type VendorPayment = typeof vendorPayment.$inferSelect;

/** Up to 16 MB of bytes; mysql2 reads and writes it as a Buffer. */
const mediumBlob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "mediumblob",
});

/**
 * A photo of a delivery slip or payment proof. Kept in the database (shrunk
 * on the phone first, ~200–400 KB) so it is private to the wedding without a
 * separate file store.
 */
export const paymentAttachment = mysqlTable(
  "payment_attachment",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: orgId(),
    paymentId: varchar("payment_id", { length: 36 })
      .notNull()
      .references(() => vendorPayment.id, { onDelete: "cascade" }),
    mimeType: varchar("mime_type", { length: 40 }).notNull(),
    size: int("size").notNull(),
    data: mediumBlob("data").notNull(),
    uploadedById: varchar("uploaded_by_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("attachment_payment_idx").on(t.paymentId)],
);

/* ============================================================ chandla register */

export const giftKinds = ["cash", "gift", "gold", "silver", "other"] as const;
export const giftSides = ["groom", "bride"] as const;

export const gift = mysqlTable(
  "gift",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: orgId(),
    functionId: varchar("function_id", { length: 36 }).references(() => weddingFunction.id, {
      onDelete: "set null",
    }),
    giverName: varchar("giver_name", { length: 150 }).notNull(),
    relation: varchar("relation", { length: 80 }),
    side: mysqlEnum("side", giftSides),
    city: varchar("city", { length: 80 }),
    kind: mysqlEnum("kind", giftKinds).notNull().default("cash"),
    /** Whole rupees; null for a gift without a value. */
    amount: int("amount"),
    description: varchar("description", { length: 300 }),
    recordedById: varchar("recorded_by_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Set by the offline outbox so a retried entry is never saved twice. */
    clientId: varchar("client_id", { length: 40 }).unique(),
    createdAt: createdAt(),
  },
  (t) => [
    index("gift_org_idx").on(t.organizationId, t.createdAt),
    index("gift_name_idx").on(t.organizationId, t.giverName),
  ],
);

/* ===================================================== joining a wedding team */

/** Each wedding has one short code that family members type to ask to join. */
export const teamCode = mysqlTable("team_code", {
  organizationId: varchar("organization_id", { length: 36 })
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 12 }).notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const joinRequestStatuses = ["pending", "accepted", "rejected"] as const;

export const joinRequest = mysqlTable(
  "join_request",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    organizationId: orgId(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", joinRequestStatuses).notNull().default("pending"),
    decidedById: varchar("decided_by_id", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: datetime("decided_at", { fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("join_request_team_idx").on(t.organizationId, t.status),
    index("join_request_user_idx").on(t.userId, t.status),
  ],
);
