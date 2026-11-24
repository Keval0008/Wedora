import "server-only";
import { HTTPException } from "hono/http-exception";
import { router } from "./hono";
import { getAuth } from "./lib/auth";
import { HttpError } from "./lib/http";
import { dashboardRouter } from "./routes/dashboard";
import { functionsRouter, settingsRouter } from "./routes/functions";
import { giftsRouter } from "./routes/gifts";
import { cronRouter, telegramRouter } from "./routes/machine";
import { notifyRouter } from "./routes/notify";
import { publicRouter } from "./routes/public";
import { songListsRouter, songsRouter } from "./routes/songs";
import { tasksRouter } from "./routes/tasks";
import { teamsRouter } from "./routes/teams";
import { vendorsRouter } from "./routes/vendors";

/** The whole API, mounted at /api by src/app/api/[[...route]]/route.ts. */
export const app = router().basePath("/api");

// Better Auth owns everything under /api/auth.
app.on(["GET", "POST"], "/auth/*", (c) => getAuth().handler(c.req.raw));

app.get("/health", (c) => c.json({ ok: true }));

app.route("/settings", settingsRouter);
app.route("/functions", functionsRouter);
app.route("/tasks", tasksRouter);
app.route("/teams", teamsRouter);
app.route("/song-lists", songListsRouter);
app.route("/songs", songsRouter);
app.route("/vendors", vendorsRouter);
app.route("/gifts", giftsRouter);
app.route("/dashboard", dashboardRouter);
app.route("/notify", notifyRouter);
app.route("/public", publicRouter);
app.route("/cron", cronRouter);
app.route("/telegram", telegramRouter);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  // The message goes first on its own: some log viewers only show the stack.
  console.error(`[api] unhandled error: ${err.name}: ${err.message}`, err);
  // Read NODE_ENV directly: getEnv() throws when the error *is* a bad environment.
  const prod = process.env.NODE_ENV === "production";
  return c.json({ error: prod ? "Something went wrong" : String(err) }, 500);
});
