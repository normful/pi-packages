/**
 * model-scope.ts — the `scopeModels` policy, applied when a spawn's model is
 * resolved.
 *
 * Opt-in (see `SubagentsSettings.scopeModels`). When on, a model the caller
 * names that falls outside Pi's `enabledModels` scope is refused, while an
 * out-of-scope model pinned in agent frontmatter or inherited from the parent
 * only warns: the orchestrator can read and react to an error, but the user
 * chose the frontmatter model or the parent's model, so the spawn proceeds.
 */

import {
  isModelInScope,
  type ModelScopeRegistry,
  readEnabledModels,
  resolveEnabledModels,
} from "#src/config/enabled-models";

/** Resolved scope inputs for one spawn, computed once at the tool boundary. */
export interface ModelScopeInput {
  enabled: boolean;
  /** Lowercase `provider/modelId` allowlist, or undefined when unscoped. */
  allowed: ReadonlySet<string> | undefined;
}

/** One spawn's verdict against the configured scope. */
export type ModelScopeVerdict =
  | { kind: "ok" }
  | { kind: "error"; message: string }
  | { kind: "warn"; message: string };

/**
 * Resolve the scope inputs for a spawn from Pi's settings.
 *
 * Reads no file when `enabled` is false, so the default configuration pays
 * nothing for the policy.
 */
export function modelScopeFor(
  cwd: string,
  registry: ModelScopeRegistry | undefined,
  enabled: boolean,
): ModelScopeInput {
  if (!enabled) return { enabled: false, allowed: undefined };
  return { enabled: true, allowed: resolveEnabledModels(readEnabledModels(cwd), registry) };
}

/**
 * Check a spawn's effective model against the scope.
 *
 * `callerSupplied` distinguishes an out-of-scope model the orchestrator named
 * (refuse, and it will pick another) from one the agent file pinned or the
 * parent supplied (warn, and run).
 */
export function checkModelScope(args: {
  model: { provider: string; id: string } | undefined;
  scope: ModelScopeInput;
  callerSupplied: boolean;
  agentLabel: string;
  modelInput?: string;
}): ModelScopeVerdict {
  const { model, scope, callerSupplied, agentLabel, modelInput } = args;
  if (!scope.enabled || !model || !scope.allowed) return { kind: "ok" };
  if (isModelInScope(model, scope.allowed)) return { kind: "ok" };

  if (callerSupplied) {
    const list = [...scope.allowed].sort().map((entry) => `  ${entry}`).join("\n");
    return {
      kind: "error",
      message: `Model not in scope: "${modelInput}".\n\nAllowed models (from enabledModels):\n${list}`,
    };
  }

  const label = modelInput ?? `${model.provider}/${model.id}`;
  return {
    kind: "warn",
    message: `Agent "${agentLabel}" is using an out-of-scope model "${label}".`,
  };
}
