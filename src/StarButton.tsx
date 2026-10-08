import { useEffect, useState } from "react";

const REPOSITORY = "opral/inlang-fink";
const KEY = "fink:stars";

/** A "Star on GitHub" call to action for the Fink repository, with the current star count when GitHub returns it. */
export function StarButton() {
  const [stars, setStars] = useState<number | undefined>(() => { try { const cached = Number(sessionStorage.getItem(KEY)); return cached > 0 ? cached : undefined; } catch { return undefined; } });
  useEffect(() => {
    if (stars !== undefined) return;
    const controller = new AbortController();
    // Unauthenticated and best effort: without a count, the button still links to the repository.
    fetch(`https://api.github.com/repos/${REPOSITORY}`, { signal: controller.signal, headers: { Accept: "application/vnd.github+json" } })
      .then(response => response.ok ? response.json() : undefined)
      .then((repo?: { stargazers_count?: number }) => {
        if (typeof repo?.stargazers_count !== "number") return;
        setStars(repo.stargazers_count);
        try { sessionStorage.setItem(KEY, String(repo.stargazers_count)); } catch { /* optional */ }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [stars]);
  return <a className="star-button" href={`https://github.com/${REPOSITORY}`} target="_blank" rel="noreferrer" aria-label={stars === undefined ? "Star Fink on GitHub" : `Star Fink on GitHub, ${stars} stars`}>
    <span className="star-label">
      <svg className="icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" /></svg>
      <span className="star-text">Star on GitHub</span>
    </span>
    {stars !== undefined && <span className="star-count">{stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10_000 ? 0 : 1)}k` : stars}</span>}
  </a>;
}
