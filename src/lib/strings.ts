// Kebab-case a display name for matching against component prefixes.
// "Voice" → "voice", "Product Insights" → "product-insights", "AI / ML" → "ai-ml".
export function toKebab(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Components follow `<domain-kebab>.<rest>` — pulls the prefix or '' if missing.
export function componentDomainPrefix(componentName: string): string {
  const idx = componentName.indexOf('.');
  return idx === -1 ? '' : componentName.slice(0, idx);
}
