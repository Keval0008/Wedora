import "server-only";
import tls from "node:tls";

let installed = false;

/**
 * mysql2 upgrades its socket to TLS with `tls.connect({ checkServerIdentity, … })`.
 * Cloudflare Workers' node:tls throws ERR_OPTION_NOT_IMPLEMENTED for that one
 * option, so no TLS connection (TiDB Cloud needs one) could ever open.
 *
 * Workers always verify the server certificate and its hostname themselves (a
 * wrong servername fails the handshake), so dropping the Node-only hook keeps
 * the connection just as safe. Only called on Workers; Node is left alone.
 */
export function allowMysqlTlsOnWorkers(): void {
  if (installed) return;
  installed = true;
  const target = tls as unknown as { connect: (...args: unknown[]) => unknown };
  const original = target.connect;
  try {
    target.connect = function connect(this: unknown, ...args: unknown[]) {
      const [options] = args;
      if (options && typeof options === "object" && "checkServerIdentity" in options) {
        const { checkServerIdentity: _dropped, ...rest } = options as Record<string, unknown>;
        args[0] = rest;
      }
      return Reflect.apply(original, this, args);
    };
  } catch (error) {
    console.error("[db] could not adapt node:tls for Workers; TLS database connections will fail:", error);
  }
}
