export const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
export const clientApi = (region: string) => `https://mt-client-api-v1.${region}.agiliumtrade.ai`;

// deno-lint-ignore no-explicit-any
export type Body = Record<string, any> | null;

export async function metaFetch(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "auth-token": token, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body: Body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

export function errorText(body: Body, status: number) {
  const msg = typeof body?.message === "string" ? body.message : `MetaApi error ${status}`;
  return msg.slice(0, 300);
}
