import type { Context, MiddlewareHandler } from "hono";
import type { Actor } from "./types.js";

declare module "hono" {
  interface ContextVariableMap {
    actor: Actor;
  }
}

// Reads X-Actor-Kind / X-Actor-Id headers; defaults to anonymous user.
export const actorMiddleware: MiddlewareHandler = async (c, next) => {
  const kindHeader = c.req.header("x-actor-kind");
  const idHeader = c.req.header("x-actor-id");
  const kind: Actor["kind"] = kindHeader === "agent" ? "agent" : "user";
  const id = idHeader && idHeader.trim() ? idHeader.trim().slice(0, 64) : "anonymous";
  c.set("actor", { kind, id });
  await next();
};

export function actor(c: Context): Actor {
  return c.get("actor") as Actor;
}
