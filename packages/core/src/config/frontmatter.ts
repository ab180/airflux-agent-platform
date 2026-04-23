import { parse as parseYaml } from 'yaml';

/**
 * Parse a markdown-with-YAML-frontmatter string.
 *
 * Format:
 *   ---
 *   key: value
 *   ---
 *   body text
 *
 * Frontmatter is optional — missing delimiter means `data = {}` and the
 * whole input becomes body. Malformed YAML inside a present frontmatter
 * block throws.
 */
export interface ParsedFrontmatter<T> {
  data: T;
  body: string;
}

const DELIM = '---';

export function parseFrontmatter<T = Record<string, unknown>>(raw: string): ParsedFrontmatter<T> {
  if (!raw.startsWith(DELIM)) {
    return { data: {} as T, body: raw };
  }
  const lines = raw.split(/\r?\n/);
  if (lines[0].trim() !== DELIM) {
    return { data: {} as T, body: raw };
  }
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === DELIM) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return { data: {} as T, body: raw };
  }
  const yamlBlock = lines.slice(1, closeIdx).join('\n');
  const body = lines.slice(closeIdx + 1).join('\n');

  const parsed = yamlBlock.trim() === '' ? {} : parseYaml(yamlBlock);
  if (parsed !== null && typeof parsed !== 'object') {
    throw new Error('Frontmatter must be a YAML mapping');
  }
  return { data: (parsed ?? {}) as T, body };
}
