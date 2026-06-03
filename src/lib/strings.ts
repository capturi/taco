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

// The part after the first '.' in a component name, or the whole name if none.
export function componentDomainRest(componentName: string): string {
  const idx = componentName.indexOf('.');
  return idx === -1 ? componentName : componentName.slice(idx + 1);
}

// Map each domain's kebab name to its configured icon, so a `<domain>.<rest>`
// component can be decorated with its domain emoji via componentDomainPrefix.
export function domainIconsByPrefix(
  domains: ReadonlyArray<{ id: string; name: string }>,
  icons: Record<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of domains) {
    const icon = icons[d.id];
    if (icon) map.set(toKebab(d.name), icon);
  }
  return map;
}
