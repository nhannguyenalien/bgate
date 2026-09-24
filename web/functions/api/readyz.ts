import { Env, json } from "../_lib/auth";
import { database } from "../_lib/db";

type Context = { env: Env };

export async function onRequestGet({ env }: Context): Promise<Response> {
  try {
    const sql = database(env);
    await sql`SELECT 1 AS ready`;
    return json({ status: "ready", database: "connected" });
  } catch {
    return json({ status: "not_ready", database: "unavailable" }, 503);
  }
}
