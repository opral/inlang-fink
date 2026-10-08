import posthog from "posthog-js/dist/module.slim.no-external";

// Anonymous usage counts for the inlang PostHog project (shared by all inlang apps; `app` tells
// them apart). Only the events below are sent: no autocapture, pageviews, recordings, surveys or
// flags, and never message text, keys, file names or GitHub logins (logins are hashed).
//
// Events follow PostHog's category:object_action naming:
// - app:session_start            Fink opens (active users, retention)
// - project:project_view         a project finishes loading (project, team and catalog size)
// - changes:commit_create        a push to GitHub succeeds
// - cloud:interest_button_click  interest in something not built yet (machine translation)
const TOKEN = "phc_xTDR5yXmkYykE7mct3fgxqDSFcJdg4nELhqWwEkUzdLH";
/** Production only; previews and local builds stay out of the data. */
const PRODUCTION = ["fink.inlang.com", "fink.opral.workers.dev"];
declare const __APP_VERSION__: string;

export type TelemetryEvent =
  | { event: "app:session_start"; properties: { is_signed_in: boolean } }
  | { event: "project:project_view"; properties: { project_id: string; message_count: number; language_count: number; collaborator_count?: number } }
  | { event: "changes:commit_create"; properties: { message_count: number; language_count: number } }
  | { event: "cloud:interest_button_click"; properties: { topic: "machine_translation"; step: "open" | "form" } };

let enabled = false;

export function initTelemetry() {
  let forced = false;
  try { forced = localStorage.getItem("fink:telemetry") === "on"; } catch { /* storage unavailable */ }
  enabled = PRODUCTION.includes(location.hostname) || forced;
  if (!enabled) return;
  posthog.init(TOKEN, {
    // Through Fink's Worker (worker/index.ts), so ad blockers don't drop the counts.
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    capture_exceptions: false,
    capture_performance: false,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    persistence: "localStorage",
    person_profiles: "identified_only",
    // A handful of events per visit: send each right away. (With remote config off, the batch
    // queue would otherwise only flush when the page is hidden.)
    request_batching: false,
    before_send: withoutUrlDetails,
    // Bot traffic is dropped in production; the forced mode (local checks, tests) runs in automated browsers.
    opt_out_useragent_filter: forced,
  });
  posthog.register({ app: "fink", app_version: __APP_VERSION__ });
}

/** Fink's URLs name the repository (?repo=…&project=…): keep only origin and path in every URL property. */
function withoutUrlDetails<T extends { properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> } | null>(event: T): T {
  for (const bag of [event?.properties, event?.$set, event?.$set_once])
    for (const [key, value] of Object.entries(bag ?? {}))
      if (typeof value === "string" && /^https?:\/\//.test(value)) {
        try { const url = new URL(value); bag![key] = url.origin + url.pathname; } catch { delete bag![key]; }
      }
  return event;
}

/** Whether events are sent (production, or forced locally); skip work that only telemetry needs otherwise. */
export const telemetryEnabled = () => enabled;

export function capture<T extends TelemetryEvent>(event: T["event"], properties: T["properties"]) {
  if (enabled) posthog.capture(event, properties);
}

/** A stable, non-reversible ID for content that must not leave the browser (logins, repositories). */
export async function hashId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`inlang:${value.toLowerCase()}`));
  return Array.from(new Uint8Array(digest).slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Signed-in users count once across devices; signed-out users stay anonymous. */
export async function identify(login: string | undefined) {
  if (!enabled) return;
  if (login) posthog.identify(await hashId(`github:${login}`));
  else if (posthog.get_property("$user_state") === "identified") posthog.reset();
}
