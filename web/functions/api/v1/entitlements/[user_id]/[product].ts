import { Env, json } from "../../../../_lib/auth";
import { database } from "../../../../_lib/db";
import { requireApiKey } from "../../../../_lib/security";

type Context = { request: Request; env: Env; params: { user_id: string; product: string } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  if (!await requireApiKey(request, env.INTERNAL_API_KEY)) return json({ error: "unauthorized" }, 401);
  const rows = await database(env)`SELECT active FROM entitlements WHERE user_id = ${params.user_id} AND product = ${params.product} LIMIT 1`;
  return json({ user_id: params.user_id, product: params.product, active: Boolean(rows[0]?.active) });
}
