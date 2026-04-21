const GITHUB_API = "https://api.github.com";

export interface DispatchOptions {
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Trigger a GitHub Actions workflow via `repository_dispatch`.
 *
 * Workflows must declare the matching event type:
 *   on:
 *     repository_dispatch:
 *       types: [content-creator]
 *
 * GitHub responds 204 No Content on success.
 *
 * Env vars consumed:
 *   GH_DISPATCH_TOKEN — fine-grained PAT with Actions:write on the target repo
 *   GITHUB_OWNER      — e.g. "giancostantini"
 *   GITHUB_REPO       — e.g. "dc-scale-agents"
 */
export async function dispatchAgentWorkflow({ eventType, payload }: DispatchOptions): Promise<void> {
  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error(
      "Missing env vars for dispatch. Need GH_DISPATCH_TOKEN, GITHUB_OWNER, GITHUB_REPO.",
    );
  }

  const url = `${GITHUB_API}/repos/${owner}/${repo}/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: payload,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${body}`);
  }
}
