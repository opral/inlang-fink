import { useState } from "react";
import { Chevron, CheckIcon, Dropdown } from "./Menu";
import { languageName, type LanguageFocus } from "./languages";

/** "English → Russian ▾": choose the source and the languages to translate into. */
export function LanguageMenu({ locales, baseLocale, focus, onChange, todo }: { locales: string[]; baseLocale: string; focus: LanguageFocus; onChange: (focus: LanguageFocus) => void; todo: (locale: string) => number }) {
  const [filter, setFilter] = useState("");
  const [choosingSource, setChoosingSource] = useState(false);
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
  return <Dropdown className="language-trigger" title="Choose languages" panelClassName="language-panel" onOpen={() => { setFilter(""); setChoosingSource(false); }}
    label={<><span className="language-from">{languageName(focus.source)}</span><span aria-hidden="true" className="language-arrow">→</span><strong>{label}</strong><Chevron /></>}>
    {close => <>
      <input className="branch-filter" aria-label="Find a language" placeholder="Find a language…" value={filter} onChange={event => setFilter(event.target.value)} autoFocus />
      <div className="dropdown-heading">Translate from</div>
      {choosingSource
        ? <div className="language-list" role="group" aria-label="Source language">{locales.filter(matches).map(locale => <button key={locale} type="button" className="menu-item" aria-current={locale === focus.source ? "true" : undefined} onClick={() => { onChange(withSource(locale)); setChoosingSource(false); }}>
            <span className="menu-check">{locale === focus.source && <CheckIcon />}</span><span className="menu-text">{languageName(locale)} <span className="language-code">{locale}</span></span>{locale === baseLocale && <span className="menu-hint">reference</span>}
          </button>)}</div>
        : <button type="button" className="menu-item" onClick={() => setChoosingSource(true)}><span className="menu-check" /><span className="menu-text">{languageName(focus.source)} <span className="language-code">{focus.source}</span>{focus.source === baseLocale && <span className="menu-hint"> · reference</span>}</span><span className="menu-hint">Change</span></button>}
      <div className="dropdown-heading">Translate into</div>
      <div className="language-list" role="group" aria-label="Target languages">
        {locales.filter(locale => locale !== focus.source && matches(locale)).map(locale => {
          const count = todo(locale), on = !focus.all && focus.targets.includes(locale);
          return <button key={locale} type="button" role="checkbox" aria-checked={on} className={on ? "menu-item on" : "menu-item"} onClick={() => toggle(locale)}>
            <span className={on ? "language-box on" : "language-box"} aria-hidden="true">{on && <CheckIcon />}</span>
            <span className="menu-text">{languageName(locale)} <span className="language-code">{locale}</span></span>
            <span className={count ? "language-count todo" : "language-count"}>{count ? `${count} to do` : "done"}</span>
          </button>;
        })}
      </div>
      <p className="dropdown-note"><button type="button" className="link-button" aria-pressed={focus.all} onClick={() => { onChange({ ...focus, all: true }); close(); }}>Review all languages</button></p>
    </>}
  </Dropdown>;
}
