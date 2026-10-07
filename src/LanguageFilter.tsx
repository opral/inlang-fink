import SlSelect from "@shoelace-style/shoelace/dist/react/select/index.js";
import SlOption from "@shoelace-style/shoelace/dist/react/option/index.js";
import type SelectElement from "@shoelace-style/shoelace/dist/components/select/select.component.js";

type Props = {
  locales: string[];
  baseLocale: string;
  selected: string[];
  onChange: (locales: string[]) => void;
};

// Use the same multi-select as Fink v2. Shoelace handles keyboard navigation,
// outside-click dismissal, viewport positioning, and a scrollable option list.
export function LanguageFilter({ locales, baseLocale, selected, onChange }: Props) {
  return (
    <SlSelect
      className="language-filter"
      label="Filter languages"
      placeholder="Filter languages"
      size="small"
      multiple
      clearable
      hoist
      maxOptionsVisible={2}
      value={selected}
      onSlChange={event => {
        const value = (event.target as SelectElement).value;
        onChange(Array.isArray(value) ? value : value ? [value] : []);
      }}
    >
      {locales.map(locale => (
        <SlOption key={locale} value={locale}>
          {locale}
          {locale === baseLocale && <span slot="suffix" className="language-reference-tag">ref</span>}
        </SlOption>
      ))}
    </SlSelect>
  );
}
