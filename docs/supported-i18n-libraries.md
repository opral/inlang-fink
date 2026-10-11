# Supported i18n libraries

Fink edits three formats:

| i18n library | inlang plugin |
| --- | --- |
| [Paraglide JS](https://paraglidejs.com) | inlang message format (`plugin.inlang.messageFormat`) |
| i18next, react-i18next, next-i18next | i18next (`plugin.inlang.i18next`) |
| next-intl | next-intl (`plugin.inlang.nextIntl`) |

Other plugins (the generic JSON plugin, ICU MessageFormat and others) aren't supported: Fink shows "Unsupported resource plugins" and doesn't open the project.

See [Supported formats](https://fink.inlang.com/docs/formats) in the Fink docs.
