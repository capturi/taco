// Helpers for composing JQL on top of the user's query.

export function defaultProjectKeyFromJql(jql: string, fallback = ''): string {
  const m = /\bproject\s*=\s*"?([A-Za-z][A-Za-z0-9_]*)"?/i.exec(jql);
  return m?.[1] ?? fallback;
}

export function buildDefaultJql(projectKey: string): string {
  if (!projectKey) return '';
  return `(project = ${projectKey}) AND (statusCategory != Done OR sprint in openSprints()) ORDER BY updated DESC`;
}

export function projectKeyFromIssueKey(issueKey: string): string {
  return issueKey.split('-')[0];
}


function escapeJqlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Appends `AND cf[<id>] in (<values>)`, preserving any trailing ORDER BY
// (which can't sit inside parentheses).
export function augmentJqlWithFieldIn(
  jql: string,
  fieldId: string,
  values: string[],
): string {
  if (values.length === 0) return jql;
  const numericFieldId = fieldId.replace(/^customfield_/, '');
  const valueList = values.map((v) => `"${escapeJqlString(v)}"`).join(', ');
  const clause = `cf[${numericFieldId}] in (${valueList})`;

  const orderBy = /\bORDER\s+BY\b/i.exec(jql);
  if (orderBy) {
    const before = jql.slice(0, orderBy.index).trim();
    const after = jql.slice(orderBy.index);
    return `(${before}) AND ${clause} ${after}`;
  }
  return `(${jql.trim()}) AND ${clause}`;
}
