// The locale every formatted number passes through. "en-US" (1,234.56) is what the app has always used and what the
// tests assume, so it stays the default; the Settings page switches it to fr-FR (1 234,56). Settings calls the setter
// once at startup and whenever the choice changes, which is why this is a module value and not React state: the
// formatters below are plain functions called from everywhere, including code that never sees a hook.
let locale = "en-US";

export const setNumberLocale = (l: string) => { locale = l; };
export const numberLocale = () => locale;
