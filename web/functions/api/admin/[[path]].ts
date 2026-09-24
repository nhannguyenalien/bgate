import { Env, json, validSession } from "../../_lib/auth";

type Context = { request: Request; env: Env; params: { path?: string | string[] } };

export async function onRequest({ request, env, params }: Context): Promise<Response> {
  if (!(await validSession(request, env))) return json({ error: "unauthorized" }, 401);
  if (!env.API_BASE_URL || !env.INTERNAL_API_KEY) return json({ error: "API proxy not configured" }, 503);

  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const incoming = new URL(request.url);
  const base = env.API_BASE_URL.replace(/\/$/, "");
  const target = new URL(`${base}/v1/admin/${parts.map(encodeURIComponent).join("/")}`);
  target.search = incoming.search;
  const response = await fetch(target, {
    method: "GET",
    headers: { "x-api-key": env.INTERNAL_API_KEY, accept: "application/json" },
  });
  return new Response(response.body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" },
  });
}
