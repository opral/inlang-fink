export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
export function cookie(request: Request, name: string): string | undefined { return request.headers.get("Cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1); }
export function setCookie(request: Request, name: string, value: string, maxAge: number): string { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`; }
export async function seal(value: object, secret: string): Promise<string> {
  if (secret.length < 32) throw new HttpError(503, "GitHub login is not configured (SESSION_SECRET).");
  const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", encoder.encode(secret)), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value))));
  return `${encode(iv)}.${encode(ciphertext)}`;
}
export async function unseal<T extends { purpose: string; expires: number }>(value: string | undefined, secret: string, purpose: string): Promise<T> {
  if (!value || secret.length < 32) throw new HttpError(401, "Sign in to GitHub to continue.");
  try {
    const [iv, ciphertext] = value.split(".");
    const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", encoder.encode(secret)), "AES-GCM", false, ["decrypt"]);
    const result: T = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, key, decode(ciphertext))));
    if (result.purpose !== purpose || result.expires <= Date.now()) throw new Error("expired");
    return result;
  } catch { throw new HttpError(401, "Your GitHub session expired. Sign in again."); }
}
export type Session = { purpose: "session"; expires: number; token: string };
export async function tokenFor(request: Request, env: Env): Promise<string | undefined> {
  if (!cookie(request, "fink_session")) return undefined;
  return (await unseal<Session>(cookie(request, "fink_session"), env.SESSION_SECRET, "session")).token;
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) throw new HttpError(403, "Cross-origin writes are not allowed.");
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new HttpError(415, "Use application/json.");
}
