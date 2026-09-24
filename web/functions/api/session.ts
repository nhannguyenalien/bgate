import { clearSessionCookie, createSession, Env, json, safeEqual, sessionCookie, validSession } from "../_lib/auth";

type Context = { request: Request; env: Env };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const authenticated = await validSession(request, env);
  return json({ authenticated }, authenticated ? 200 : 401);
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "auth not configured" }, 503);
  let body: { username?: string; password?: string };
  try { body = await request.json(); } catch { return json({ error: "invalid request" }, 400); }
  const validUser = await safeEqual(String(body.username || ""), env.ADMIN_USERNAME);
  const validPassword = await safeEqual(String(body.password || ""), env.ADMIN_PASSWORD);
  if (!validUser || !validPassword) return json({ error: "invalid credentials" }, 401);
  const token = await createSession(env.ADMIN_USERNAME, env.SESSION_SECRET);
  return json({ authenticated: true }, 200, { "set-cookie": sessionCookie(token) });
}

export function onRequestDelete(): Response {
  return json({ authenticated: false }, 200, { "set-cookie": clearSessionCookie() });
}
