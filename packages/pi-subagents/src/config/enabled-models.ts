/**
 * enabled-models.ts — read Pi's `enabledModels` allowlist and resolve it to the
 * concrete `provider/modelId` keys a spawn's model is checked against.
 *
 * Pi's own settings are layered: project `<cwd>/.pi/settings.json` wholly
 * replaces the global `<agentDir>/settings.json` value for the field, matching
 * Pi's `SettingsManager` merge. We read the files directly rather than importing
 * Pi's manager so the scope check works on the Pi versions this package peers
 * (some predate the `ExtensionContext.scopedModels` snapshot).
 *
 * Only exact `provider/modelId` entries are honored — the form Pi's
 * `/scoped-models` picker writes. Bare ids, globs, and `:thinking` suffixes are
 * dropped; when nothing matches, the scope check is a no-op.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Narrow registry view — only what scope resolution needs. */
export interface ModelScopeRegistry {
  getAll(): { provider: string; id: string }[];
  getAvailable?(): { provider: string; id: string }[];
}

/** Paths to Pi's settings.json files: [project, global] (project wins). */
function settingsPaths(cwd: string): [project: string, global: string] {
  return [join(cwd, ".pi", "settings.json"), join(getAgentDir(), "settings.json")];
}

/** `enabledModels` from one settings file; undefined when missing/absent/corrupt. */
function readField(path: string): string[] | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (Array.isArray(raw?.enabledModels)) {
      return raw.enabledModels.filter((value: unknown): value is string => typeof value === "string");
    }
  } catch {
    // Corrupt file — treated as absent, mirroring the settings loader.
  }
  return undefined;
}

/** Project-local `enabledModels` over global; undefined when neither file sets it. */
export function readEnabledModels(cwd: string): string[] | undefined {
  const [project, global] = settingsPaths(cwd);
  return readField(project) ?? readField(global);
}

/**
 * Resolve `enabledModels` patterns to the lowercase `provider/modelId` keys that
 * are actually available on this machine.
 *
 * Returns undefined when there is nothing to enforce — no patterns, no registry,
 * or no pattern matched an available model — so the caller treats scope as open.
 */
export function resolveEnabledModels(
  patterns: string[] | undefined,
  registry: ModelScopeRegistry | undefined,
): Set<string> | undefined {
  if (!registry || !patterns || patterns.length === 0) return undefined;

  const available = registry.getAvailable?.() ?? registry.getAll();
  const allowed = new Set<string>();
  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    const slash = trimmed.indexOf("/");
    if (slash === -1) continue; // bare model id — not supported
    const provider = trimmed.slice(0, slash).toLowerCase();
    const id = trimmed.slice(slash + 1).toLowerCase();
    const match = available.find(
      (model) => model.provider.toLowerCase() === provider && model.id.toLowerCase() === id,
    );
    if (match) allowed.add(modelKey(match));
  }

  return allowed.size > 0 ? allowed : undefined;
}

/** True when `model` is in the allowed set. */
export function isModelInScope(
  model: { provider: string; id: string },
  allowed: ReadonlySet<string>,
): boolean {
  return allowed.has(modelKey(model));
}

/** Canonical lowercase `provider/id` key. */
function modelKey(model: { provider: string; id: string }): string {
  return `${model.provider}/${model.id}`.toLowerCase();
}
