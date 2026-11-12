import { app } from "@/server/app";

// Every API call reads cookies or the database; nothing here can be prerendered.
export const dynamic = "force-dynamic";

const handler = (req: Request) => app.fetch(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
