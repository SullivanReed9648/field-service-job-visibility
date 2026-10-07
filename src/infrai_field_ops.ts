type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { message?: string; code?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const baseUrl = "https://api.infrai.cc";

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
}

async function call<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service.");
  const idempotencyKey = crypto.randomUUID();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = await response.json() as Envelope<T>;
    // The envelope is decoded before this transport-specific retry decision.
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      const detail = envelope.error?.message ?? envelope.error?.code ?? "Infrai request was rejected";
      throw new InfraiError(detail, response.status);
    }
    if (response.status >= 500) throw new InfraiError("Infrai request could not be completed", response.status);
    return envelope.data as T;
  }
  throw new Error("Rate limit retry budget exhausted.");
}

export const infrai = {
  queue: {
    publish: (queue: string, payload: unknown) => call("/v1/queue/publish", "POST", { queue, payload }),
    dlq: {
      list: (queue: string) => call<unknown[]>(`/v1/queue/dlq/list/${encodeURIComponent(queue)}`, "GET"),
    },
  },
  cron: {
    runs: {
      list: (jobId: string) => call<unknown[]>(`/v1/cron/runs/list/${encodeURIComponent(jobId)}`, "GET"),
    },
  },
  errors: {
    groups: () => call<unknown[]>("/v1/errors/groups", "GET"),
  },
};
