import { cookie, HttpError, requireSameOrigin, seal, setCookie, tokenFor, unseal, type Session } from "./auth";
import { boundedJson, github, push, repoBase, validPath, type PushInput } from "./github";
import { extractSource, isSourcePath } from "./source";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
type LoginState = { purpose: "oauth"; expires: number; nonce: string; origin: string; verifier: string };
type Relay = { purpose: "relay"; expires: number; nonce: string; session: string; origin: string };
function callbackOrigin(request: Request, env: Env) { return env.GITHUB_CALLBACK_ORIGIN || new URL(request.url).origin; }
function allowedOrigin(origin: string, request: Request, env: Env) {
  if (origin === callbackOrigin(request, env)) return true;
  const url = new URL(origin);
  if (url.protocol === "https:" && (url.hostname === "fink.inlang.com" || (!!env.WORKERS_SUBDOMAIN && url.hostname === `fink.${env.WORKERS_SUBDOMAIN}.workers.dev`))) return true;
  return url.protocol === "https:" && !!env.WORKERS_SUBDOMAIN && new RegExp(`^fink-pr-[0-9]+\\.${String(env.WORKERS_SUBDOMAIN).replace(/\./g, "\\.")}\\.workers\\.dev$`).test(url.hostname);
}
async function auth(request: Request, env: Env, url: URL): Promise<Response | undefined> {
  if (url.pathname === "/api/auth/login") {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new HttpError(503, "GitHub App credentials have not been configured.");
    if (!allowedOrigin(url.origin, request, env)) throw new HttpError(403, "This preview cannot use GitHub login.");
    const nonce = crypto.randomUUID();
    const verifier = crypto.randomUUID() + crypto.randomUUID();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const state = await seal({ purpose: "oauth", expires: Date.now() + 10 * 60_000, nonce, origin: url.origin, verifier }, env.SESSION_SECRET);
    const target = new URL("https://github.com/login/oauth/authorize");
    target.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${callbackOrigin(request, env)}/api/auth/callback`, state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
    return new Response(null, { status: 302, headers: { Location: target.href, "Set-Cookie": setCookie(request, "fink_oauth", nonce, 600), "Cache-Control": "no-store" } });
  }
  if (url.pathname === "/api/auth/callback") {
    const state = await unseal<LoginState>(url.searchParams.get("state") ?? undefined, env.SESSION_SECRET, "oauth");
    if (!allowedOrigin(state.origin, request, env)) throw new HttpError(403, "Invalid callback origin.");
    const code = url.searchParams.get("code"); if (!code || code.length > 1000) throw new HttpError(400, "GitHub authorization was cancelled.");
    const response = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, code_verifier: state.verifier, redirect_uri: `${callbackOrigin(request, env)}/api/auth/callback` }) });
    const result = await boundedJson<{ access_token?: string; expires_in?: number }>(response);
    if (!response.ok || !result.access_token) throw new HttpError(401, "GitHub token exchange failed.");
    const session = await seal({ purpose: "session", expires: Date.now() + Math.min(result.expires_in ?? 28_800, 28_800) * 1000, token: result.access_token }, env.SESSION_SECRET);
    const relay = await seal({ purpose: "relay", expires: Date.now() + 60_000, nonce: state.nonce, session, origin: state.origin }, env.SESSION_SECRET);
    return new Response(null, { status: 302, headers: { Location: `${state.origin}/#auth=${relay}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  if (url.pathname === "/api/auth/complete" && request.method === "POST") {
    requireSameOrigin(request);
    const input = await boundedJson<{ relay: string }>(request);
    const relay = await unseal<Relay>(input.relay, env.SESSION_SECRET, "relay");
    if (relay.origin !== url.origin || relay.nonce !== cookie(request, "fink_oauth")) throw new HttpError(403, "GitHub login state did not match. Try signing in again.");
    const session = await unseal<Session>(relay.session, env.SESSION_SECRET, "session");
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    headers.append("Set-Cookie", setCookie(request, "fink_session", relay.session, Math.floor((session.expires - Date.now()) / 1000)));
    headers.append("Set-Cookie", setCookie(request, "fink_oauth", "", 0));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    requireSameOrigin(request);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": setCookie(request, "fink_session", "", 0), "Cache-Control": "no-store" } });
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      const authResult = await auth(request, env, url); if (authResult) return authResult;
      const token = await tokenFor(request, env);
      if (url.pathname === "/api/user" && request.method === "GET") return json(token ? await github("/user", token) : null);
      if (url.pathname === "/api/github/push" && request.method === "POST") {
        requireSameOrigin(request); if (!token) throw new HttpError(401, "Sign in before pushing.");
        return json(await push(await boundedJson<PushInput>(request), token));
      }
      if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
      const base = repoBase(url.searchParams.get("owner") ?? "", url.searchParams.get("repo") ?? "");
      if (url.pathname === "/api/github/branches") {
        const branches = [];
        for (let page = 1; page <= 10; page++) {
          const batch = await github<{ name: string }[]>(`${base}/branches?per_page=100&page=${page}`, token);
          branches.push(...batch.map(b => b.name)); if (batch.length < 100) return json(branches);
        }
        throw new HttpError(413, "Repository has more than 1,000 branches.");
      }
      if (url.pathname === "/api/github/tree") {
        const branch = url.searchParams.get("branch") || (await github<{ default_branch: string }>(base, token)).default_branch;
        const commit = await github<{ sha: string; commit: { tree: { sha: string } } }>(`${base}/commits/${encodeURIComponent(branch)}`, token);
        const tree = await github<{ truncated: boolean; tree: { path: string; type: string; mode: string }[] }>(`${base}/git/trees/${commit.commit.tree.sha}?recursive=1`, token);
        if (tree.truncated) throw new HttpError(413, "GitHub returned an incomplete repository tree. Choose a smaller repository.");
        const paths = tree.tree.filter(entry => entry.type === "blob" && entry.mode !== "120000").map(entry => entry.path);
        return json({ branch, head: commit.sha, tree: commit.commit.tree.sha, paths, projects: paths.filter(path => path.endsWith(".inlang/settings.json")).map(path => path.slice(0, -14)) });
      }
      if (url.pathname === "/api/github/source") {
                const ref = url.searchParams.get("ref") ?? "", scope = url.searchParams.get("path") ?? "";
        if (!/^[0-9a-f]{40}$/.test(ref) || (scope && !validPath(scope))) throw new HttpError(400, "Invalid source request.");
        const archive = await fetch(`https://api.github.com${base}/tarball/${ref}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "inlang-fink", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        if (!archive.ok || !archive.body) {
          await archive.body?.cancel();
          throw new HttpError(archive.status === 404 ? 404 : [401, 403, 429].includes(archive.status) ? archive.status : 502, archive.status === 404 ? "Repository or commit not found. Check GitHub App access." : `GitHub archive request failed (${archive.status}). Check permissions and rate limits.`);
        }
        const files = await extractSource(archive.body, path => isSourcePath(path, scope));
        // Signed-in requests may include private code: never cache it. Public source is pinned to a commit.
        return Response.json({ files }, { headers: { "Cache-Control": token ? "no-store" : "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
      }
      if (url.pathname === "/api/github/commits") {
        const branch = url.searchParams.get("branch") ?? "", path = url.searchParams.get("path") ?? "";
        if (!branch || branch.length > 255 || (path && !validPath(path))) throw new HttpError(400, "Invalid history request.");
        const commits = await github<{ sha: string; html_url: string; author: { login: string; avatar_url: string } | null; commit: { message: string; author: { name: string; date: string } | null } }[]>(`${base}/commits?${new URLSearchParams({ sha: branch, per_page: "30", ...(path ? { path } : {}) })}`, token);
        return json(commits.map(commit => ({ sha: commit.sha, url: commit.html_url, message: commit.commit.message.slice(0, 1000), author: commit.author?.login ?? commit.commit.author?.name ?? "Unknown", avatar: commit.author?.avatar_url, date: commit.commit.author?.date })));
      }
      if (url.pathname === "/api/github/file") {
        const path = url.searchParams.get("path") ?? "";
        if (!validPath(path) || !path.endsWith(".json")) throw new HttpError(400, "Only JSON project files can be read.");
        const ref = url.searchParams.get("branch") ?? "";
        const file = await github<{ encoding: string; content: string; size: number }>(`${base}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, token);
        if (file.encoding !== "base64" || file.size > 1024 * 1024 || typeof file.content !== "string") throw new HttpError(413, "Resource files must be at most 1 MiB.");
        return json({ content: new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), char => char.charCodeAt(0))) });
      }
      return json({ error: "API route not found." }, 404);
    } catch (error) {
      return json({ error: error instanceof HttpError ? error.message : "The request failed. Try again." }, error instanceof HttpError ? error.status : 500);
    }
  },
} satisfies ExportedHandler<Env>;
