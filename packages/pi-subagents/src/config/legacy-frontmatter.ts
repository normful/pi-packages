/**
 * legacy-frontmatter.ts — normalize the tintinweb-dialect frontmatter keys that
 * rpiv-mono's agent files still carry.
 *
 * The gotgenes fork reads a narrower `tools:` than its tintinweb ancestor and no
 * longer knows the extension-lifecycle keys at all. This module is the one pure
 * seam every agent file passes through, so a legacy file loads without changing
 * the shape of a file that never used the legacy keys.
 *
 * Five keys are recognized here and one is read through:
 *   - `name:`      is a no-op — the registry keys every agent by filename. A
 *                  declaration that disagrees is logged in debug, never re-keyed.
 *   - `tools:`     entries written as `ext:<pkg>/<tool>` selectors are stripped
 *                  to the bare registered name the extension actually registers.
 *   - `disallowed_tools:` names the tools to subtract from the effective
 *                  `tools:` set, restoring the tintinweb denylist.
 *   - `extensions:` is accepted but inert — children already inherit every
 *                  extension the operator's `excludedExtensionPackages` leaves.
 *   - `isolated:`  (with its coupled `skills:`) resolves to a boolean the
 *                  session assembler turns into a skills-off/extensions-off,
 *                  non-inheriting child.
 */

import { debugLog } from "#src/debug";

/** The loader-facing view of one agent file's legacy frontmatter. */
export interface NormalizedFrontmatter {
  /**
   * `tools:` entries with any leading `ext:<pkg>/` selector stripped, or
   * `undefined` when the key is absent. Entries that were already bare names
   * pass through untouched. Feed this to `listField`, which preserves the
   * omitted/`none`/empty semantics.
   */
  toolNames?: string[];
  /**
   * `disallowed_tools:` entries with any leading `ext:<pkg>/` selector stripped,
   * or `undefined` when the key is absent. The loader subtracts these from the
   * effective `tools:` set.
   */
  disallowedToolNames?: string[];
  /**
   * `isolated: true` when the file declares it, `false` when it declares it as
   * anything else, and `undefined` when the key is absent — mirroring the
   * `inherit_context:` / `run_in_background:` convention.
   */
  isolated?: boolean;
}

/**
 * Normalize one agent file's raw frontmatter.
 *
 * Pure: reads only its arguments, and the sole side effect is a debug line.
 *
 * @param frontmatter  The `parseFrontmatter()` result's `frontmatter` record.
 * @param agentName    The filename-derived name the registry will key on.
 */
export function normalizeLegacyFrontmatter(
  frontmatter: Record<string, unknown>,
  agentName: string,
): NormalizedFrontmatter {
  warnOnChallengedName(frontmatter.name, agentName);

  // `extensions:` (and a `skills:` that travels with `isolated:`) is recognized
  // but inert: children already inherit every extension the operator's
  // `excludedExtensionPackages` settings leave in place, and `isolated` below
  // is the only lever that turns the inherited set off. Read, not errored.
  return {
    toolNames: normalizeTools(frontmatter.tools),
    disallowedToolNames: normalizeTools(frontmatter.disallowed_tools),
    isolated: frontmatter.isolated != null ? frontmatter.isolated === true : undefined,
  };
}

/**
 * Subtract a `disallowed_tools:` denylist from an effective tool set.
 *
 * The tintinweb dialect keeps `tools:` as an allowlist and `disallowed_tools:`
 * as a denylist applied on top of it. Order between the two is irrelevant, so
 * the subtraction happens after the allowlist has been resolved (including the
 * "no `tools:` key means every built-in" default). A name absent from the
 * allowlist is a no-op, so a denylist entry never introduces a tool.
 */
export function withoutDisallowedTools(
  toolNames: readonly string[],
  disallowedToolNames: readonly string[] | undefined,
): string[] {
  if (!disallowedToolNames || disallowedToolNames.length === 0) return [...toolNames];
  const denied = new Set(disallowedToolNames);
  return toolNames.filter((name) => !denied.has(name));
}

/**
 * Re-read a `tools:` value as a list of registered tool names.
 *
 * The tintinweb dialect names an extension tool by a package-qualified
 * selector — `ext:rpiv-web-tools/web_search` — while the fork's registry and
 * the SDK allowlist know the bare name the extension registers. A leading
 * `ext:<pkg>/` is stripped; every other entry passes through by identity.
 *
 * The scalar/sequence distinction is resolved the same way `parseListField`
 * resolves it, so the result is shaped exactly as the loader expects and its
 * own parsing is unchanged.
 */
function normalizeTools(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const entries = Array.isArray(value)
    ? value.map((entry) => String(entry).trim())
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- value is narrowed past null/undefined; String() is the intended coercion, mirroring parseListField
    : String(value).trim().split(",").map((entry) => entry.trim());
  return entries.filter(Boolean).map(stripExtensionSelector);
}

/** `ext:<pkg>/<tool>` → `<tool>`; anything else by identity. */
function stripExtensionSelector(entry: string): string {
  const selector = /^ext:[^/]+\/(.+)$/.exec(entry);
  return selector ? selector[1] : entry;
}

/**
 * Emit a debug line when a file's `name:` disagrees with its filename.
 *
 * `name:` is otherwise a no-op: the registry keys every agent by
 * `basename(file, ".md")`, which is what the override hierarchy depends on. A
 * mismatch is almost always an author error, so it is worth one debug line —
 * never a re-key.
 */
function warnOnChallengedName(declared: unknown, agentName: string): void {
  if (typeof declared !== "string") return;
  const claimed = declared.trim();
  if (claimed && claimed !== agentName) {
    debugLog(
      `agent ${agentName} frontmatter name`,
      `declared "${claimed}", keeping filename-derived name "${agentName}"`,
    );
  }
}
