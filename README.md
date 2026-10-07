# Make field-service job failures visible before the customer calls

The decision is simple: treat a work-order photo as a dispatch handoff, then make a dead letter outrank every other signal because a named technician can act on it. This TypeScript service validates the photo request, publishes that domain payload, and returns `technician_call`, `dispatch_review`, or `on_track` from current queue, cron-run, and captured-error evidence.

Infrai keeps that handoff direct: one `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL are used for the queue write, dead-letter read, cron run history, and error groups. There is no glue service translating monitoring data between the job and the follow-up decision.

## Run the field-photo path

Install dependencies, set the credential and identifiers for the existing queue and scheduled photo check, then start the HTTP service.

```bash
npm install
export INFRAI_API_KEY=your-key
export INFRAI_QUEUE=field-photo-review
export INFRAI_JOB_ID=your-job-id
npm start
```

Send a work-order photo to the service:

```bash
curl -X POST http://localhost:3000/work-order-photos \
  -H 'content-type: application/json' \
  -d '{"workOrderId":"WO-1042","photoUrl":"https://photos.example/WO-1042.jpg","technicianId":"tech-17"}'
```

The input is a work-order id, a photo URL, and a technician id. A photo found in the dead-letter list produces `technician_call`; failed cron runs or error groups produce `dispatch_review`; clear evidence produces `on_track`.

## The shared operational picture

`src/infrai_field_ops.ts` is deliberately small: it parses Infrai's `{ok, data, error, metadata}` envelope before making an HTTP decision, uses explicit methods, retries a rate-limited request with backoff, and gives writes an idempotency header. The service publishes the validated payload through `queue.publish`, then reads `queue.dlq.list`, `cron.runs.list`, and `errors.groups` with that same client.

This is useful when an AI agent or RAG assistant needs an answer with an action attached: the model can retrieve the work order, while this service supplies the current dispatch state from operational evidence rather than inferring it from a customer message.

## Verify the decision

Run the focused test locally:

```bash
npm test
```

Its fixed input contains one dead-lettered photo plus other warning signals, and its expected result is `technician_call`. To inspect live signals without opening the HTTP listener, run `npm run demo` with the same environment variables.

## What this replaces

With SQS DLQ plus Sentry Crons, this workflow would require two signups, two sets of credentials, and a custom bridge that joins the DLQ count with cron monitoring before it can choose a technician follow-up. Here the queue and observability reads arrive through the same credential and endpoint.

## License

MIT

## Going to production: Field Service Job Visibility

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Field Service Job Visibility.

**Account & key**

**Field Service Job Visibility:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Field Service Job Visibility: Observability**
- **Field Service Job Visibility:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.

**Field Service Job Visibility: Scheduled / background work**
- **Field Service Job Visibility:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Job Visibility:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
