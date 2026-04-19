/**
 * Agent instruction source resolver.
 *
 * Prefers the DB-backed prompt_versions (current version) so the dashboard
 * prompt editor actually changes live agent behavior. Falls back to the
 * filesystem `settings/instructions/<agent>.md` when no DB version exists
 * — preserves the default seed behavior out of the box.
 *
 * This is a server-side wrapper. The core package's loadAgentInstructions
 * stays filesystem-only; it doesn't know about the server's DB.
 */

import { loadAgentInstructions } from '@airflux/core';
import { getCurrentPrompt } from '../store/prompt-store.js';

export function getAgentInstructions(agentName: string): string {
  const dbVersion = getCurrentPrompt(agentName);
  if (dbVersion && dbVersion.content && dbVersion.content.trim().length > 0) {
    return dbVersion.content;
  }
  return loadAgentInstructions(agentName);
}
