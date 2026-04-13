/**
 * Domain glossary resolver.
 * Maps aliases, abbreviations, and Korean terms to canonical forms.
 */

export interface GlossaryTerm {
  canonical: string;
  aliases: string[];
  description: string;
}

export interface GlossaryConfig {
  terms: Record<string, GlossaryTerm>;
}

export interface ResolvedTerm {
  input: string;
  canonical: string;
  key: string;
  description: string;
}

export class DomainGlossary {
  private aliasMap = new Map<string, { key: string; term: GlossaryTerm }>();

  constructor(config: GlossaryConfig) {
    for (const [key, term] of Object.entries(config.terms)) {
      // Map the key itself
      this.aliasMap.set(key.toLowerCase(), { key, term });
      // Map canonical name
      this.aliasMap.set(term.canonical.toLowerCase(), { key, term });
      // Map all aliases
      for (const alias of term.aliases) {
        this.aliasMap.set(alias.toLowerCase(), { key, term });
      }
    }
  }

  resolve(input: string): ResolvedTerm | null {
    const entry = this.aliasMap.get(input.toLowerCase());
    if (!entry) return null;
    return {
      input,
      canonical: entry.term.canonical,
      key: entry.key,
      description: entry.term.description,
    };
  }

  resolveAll(text: string): ResolvedTerm[] {
    const results: ResolvedTerm[] = [];
    const seen = new Set<string>();

    // Check each term/alias against the text
    for (const [alias, entry] of this.aliasMap) {
      if (seen.has(entry.key)) continue;
      if (text.toLowerCase().includes(alias)) {
        seen.add(entry.key);
        results.push({
          input: alias,
          canonical: entry.term.canonical,
          key: entry.key,
          description: entry.term.description,
        });
      }
    }

    return results;
  }

  listTerms(): { key: string; canonical: string; description: string }[] {
    const seen = new Set<string>();
    const result: { key: string; canonical: string; description: string }[] = [];

    for (const [, entry] of this.aliasMap) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      result.push({
        key: entry.key,
        canonical: entry.term.canonical,
        description: entry.term.description,
      });
    }

    return result;
  }
}
