import { useState } from "react";
import { Chevron, CheckIcon, Dropdown } from "./Menu";
import { languageName, type LanguageFocus } from "./languages";

/** "English → German ▾": the source is one select, the list is the languages to translate into, most work first. */
export function LanguageMenu({ locales, baseLocale, focus, onChange, todo, total }: { locales: string[]; baseLocale: string; focus: LanguageFocus; onChange: (focus: LanguageFocus) => void; todo: (locale: string) => number; total: number }) {
  const [filter, setFilter] = useState("");
  const label = focus.all ? "All languages" : focus.targets.map(languageName).join(", ") || "Choose a language";
  const matches = (locale: string) => `${locale} ${languageName(locale)}`.toLowerCase().includes(filter.trim().toLowerCase());
  // The new source can't also be a target; if it was the only one, translate into another language.
  const withSource = (source: string): LanguageFocus => {
    const targets = focus.targets.filter(value => value !== source);
    const fallback = locales.find(locale => locale !== source);
    return { source, targets: targets.length || !fallback ? targets : [fallback], all: focus.all || (!targets.length && !fallback) };
  };
  const toggle = (locale: string) => {
    // Leaving "review all" by picking a language starts a focused selection with just that one.
    if (focus.all) return onChange({ ...focus, targets: [locale], all: false });
    const targets = focus.targets.includes(locale) ? focus.targets.filter(value => value !== locale) : [...focus.targets, locale];
    if (targets.length) onChange({ ...focus, targets }); // At least one language stays selected.
  };
  const targets = locales.filter(locale => locale !== focus.source && matches(locale))
    .map(locale => ({ locale, left: todo(locale) }))
    .sort((a, b) => b.left - a.left || languageName(a.locale).localeCompare(languageName(b.locale)));
  return <Dropdown className="language-trigger" title="Choose languages" panelClassName="language-panel" onOpen={() => setFilter("")}
    label={<><span className="language-from">{languageName(focus.source)}</span><span aria-hidden="true" className="language-arrow">→</span><strong>{label}</strong><Chevron /></>}>
    {close => <>
      <label className="language-source"><span>From</span>
        <select value={focus.source} onChange={event => onChange(withSource(event.target.value))}>
          {locales.map(locale => <option key={locale} value={locale}>{languageName(locale)}{locale === baseLocale ? " · reference" : ""}</option>)}
        </select>
      </label>
      <input className="language-search" aria-label="Find a language" placeholder="Find a language…" value={filter} onChange={event => setFilter(event.target.value)} autoFocus />
      <div className="dropdown-heading">Translate into</div>
      <div className="language-list" role="group" aria-label="Target languages">
        {targets.map(({ locale, left }) => {
          const on = !focus.all && focus.targets.includes(locale), done = total ? Math.round(((total - left) / total) * 100) : 100;
          return <button key={locale} type="button" role="checkbox" aria-checked={on} className={on ? "language-item on" : "language-item"} onClick={() => toggle(locale)}>
            <span className={on ? "language-box on" : "language-box"} aria-hidden="true">{on && <CheckIcon />}</span>
            <span className="language-name">{languageName(locale)} <span className="language-code">{locale}</span></span>
            <span className="language-bar" aria-hidden="true"><span style={{ width: `${done}%` }} /></span>
            <span className={left ? "language-count todo" : "language-count"}>{left ? `${left} to do` : "done"}</span>
          </button>;
        })}
        {!targets.length && <p className="dropdown-empty">No language matches “{filter}”.</p>}
      </div>
      <div className="language-foot">
        <button type="button" className="link-button" aria-pressed={focus.all} onClick={() => { onChange({ ...focus, all: true }); close(); }}>Review all languages</button>
        <button type="button" className="primary" onClick={close}>Done</button>
      </div>
    </>}
  </Dropdown>;
}
