import type { ZodType } from "zod";

/** Error with an HTTP status; thrown from routes and turned into JSON by app.onError. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 500 | 502 | 503,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (m = "Bad request") => new HttpError(400, m);
export const unauthorized = (m = "Not signed in") => new HttpError(401, m);
export const forbidden = (m = "Not allowed") => new HttpError(403, m);
export const notFound = (m = "Not found") => new HttpError(404, m);
export const conflict = (m = "Conflict") => new HttpError(409, m);
export const tooMany = (m = "Too many requests, try again in a few minutes") => new HttpError(429, m);

/** Validates `value` or throws a 400 with the first problem. */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw badRequest(`${where}${issue?.message ?? "Invalid input"}`);
  }
  return result.data;
}

/** Reads a JSON body, treating an empty or broken one as {}. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
