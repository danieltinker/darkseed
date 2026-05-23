import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { actorMiddleware } from "./middleware.js";
import { db } from "./db.js";
import { mountChainRoutes } from "./routes/chains.js";
import { mountNodeRoutes } from "./routes/nodes.js";
import { mountEvidenceRoutes } from "./routes/evidence.js";
import { mountBlobRoutes } from "./routes/blobs.js";
import { mountCommentRoutes } from "./routes/comments.js";
import { mountAuditRoutes } from "./routes/audit.js";
import { mountQueueRoutes } from "./routes/queue.js";
import { mountSimilarRoutes } from "./routes/similar.js";
import { mountLabelRoutes } from "./routes/labels.js";
import { mountExportRoutes } from "./routes/exports.js";
import { mountVerdictRoutes } from "./routes/verdict.js";
import { mountKbRoutes } from "./routes/kb.js";
import { mountReportRoutes } from "./routes/reports.js";
import { startReportWatcher } from "./watcher.js";

const app = new Hono();
app.use("*", logger());
app.use("*", cors({ origin: "*", allowHeaders: ["content-type", "x-actor-kind", "x-actor-id"] }));
app.use("*", actorMiddleware);

app.get("/api/health", (c) => {
  const n = (db().prepare("SELECT COUNT(*) AS n FROM chains").get() as { n: number }).n;
  return c.json({ ok: true, chains: n });
});

mountChainRoutes(app);
mountNodeRoutes(app);
mountEvidenceRoutes(app);
mountBlobRoutes(app);
mountCommentRoutes(app);
mountAuditRoutes(app);
mountQueueRoutes(app);
mountSimilarRoutes(app);
mountLabelRoutes(app);
mountExportRoutes(app);
mountVerdictRoutes(app);
mountKbRoutes(app);
mountReportRoutes(app);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] darkseed api listening on http://localhost:${info.port}`);
  startReportWatcher();
});
