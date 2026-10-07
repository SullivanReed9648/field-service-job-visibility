import { createServer } from "node:http";
import { z } from "zod";
import { chooseFollowup } from "./dispatch_followup.js";
import { InfraiError, infrai } from "./infrai_field_ops.js";

const workOrderPhoto = z.object({
  workOrderId: z.string().min(1),
  photoUrl: z.string().url(),
  technicianId: z.string().min(1),
});

type Items = { items?: unknown[] };
const count = (value: unknown): number => Array.isArray(value) ? value.length : (value as Items).items?.length ?? 0;

async function visibilitySnapshot() {
  const queue = process.env.INFRAI_QUEUE ?? "field-photo-review";
  const jobId = process.env.INFRAI_JOB_ID;
  if (!jobId) throw new Error("Set INFRAI_JOB_ID to inspect the field-photo cron runs.");
  const [deadLetters, runs, errorGroups] = await Promise.all([
    infrai.queue.dlq.list(queue),
    infrai.cron.runs.list(jobId),
    infrai.errors.groups(),
  ]);
  const failedRuns = (Array.isArray(runs) ? runs : (runs as Items).items ?? [])
    .filter((run) => (run as { status?: string }).status === "failed").length;
  return { deadLetters: count(deadLetters), failedRuns, errorGroups: count(errorGroups) };
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

async function handlePhoto(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) {
  try {
    const parsed = workOrderPhoto.safeParse(await readJson(request));
    if (!parsed.success) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "workOrderId, photoUrl, and technicianId are required." }));
      return;
    }
    const queue = process.env.INFRAI_QUEUE ?? "field-photo-review";
    await infrai.queue.publish(queue, parsed.data);
    const followup = chooseFollowup(await visibilitySnapshot());
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ workOrderId: parsed.data.workOrderId, ...followup }));
  } catch (error) {
    const status = error instanceof InfraiError && error.status < 500 ? error.status : 502;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to process photo." }));
  }
}

if (process.argv.includes("--snapshot")) {
  visibilitySnapshot().then((snapshot) => console.log(JSON.stringify(chooseFollowup(snapshot), null, 2)));
} else {
  createServer((request, response) => {
    if (request.method === "POST" && request.url === "/work-order-photos") void handlePhoto(request, response);
    else { response.writeHead(404); response.end(); }
  }).listen(Number(process.env.PORT ?? 3000));
}
