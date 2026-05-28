// Maps Jira's agile-API epic color keys (color_1..color_14) to display hex codes.
// Approximated from Atlassian's design palette; not exact but visually consistent.

export const EPIC_COLORS: Record<string, string> = {
  color_1: '#998dd9', // light purple
  color_2: '#79f2c0', // light green
  color_3: '#79e2f2', // light blue
  color_4: '#ffe380', // light yellow
  color_5: '#ffab9e', // light red
  color_6: '#fdb8db', // pink
  color_7: '#dfe1e6', // grey
  color_8: '#5243aa', // dark purple
  color_9: '#0052cc', // blue
  color_10: '#bf2600', // dark red
  color_11: '#00b8d9', // cyan
  color_12: '#006644', // dark green
  color_13: '#ff5630', // orange
  color_14: '#36b37e', // green
};

export function epicColorHex(colorKey: string | undefined): string | undefined {
  if (!colorKey) return undefined;
  return EPIC_COLORS[colorKey];
}
