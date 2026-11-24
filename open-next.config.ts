import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page and API route is dynamic (they read cookies or the database), so
// there is nothing for an incremental cache to store. The defaults are enough.
export default defineCloudflareConfig();
