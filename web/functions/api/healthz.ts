import { json } from "../_lib/auth";

export function onRequestGet(): Response {
  return json({ status: "ok", service: "bgate-pages" });
}
