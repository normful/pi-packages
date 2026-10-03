import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkModelScope, type ModelScopeInput, modelScopeFor } from "#src/config/model-scope";

const allowed = new Set(["anthropic/claude-opus-4-6"]);

describe("checkModelScope", () => {
  it("is ok when the policy is off", () => {
    expect(
      checkModelScope({
        model: { provider: "google", id: "gemma-4-31b-it" },
        scope: { enabled: false, allowed },
        callerSupplied: true,
        agentLabel: "a",
      }),
    ).toEqual({ kind: "ok" });
  });

  it("is ok with no allowlist to enforce", () => {
    expect(
      checkModelScope({
        model: { provider: "google", id: "gemma-4-31b-it" },
        scope: { enabled: true, allowed: undefined },
        callerSupplied: true,
        agentLabel: "a",
      }),
    ).toEqual({ kind: "ok" });
  });

  it("is ok with no resolved model", () => {
    expect(
      checkModelScope({
        model: undefined,
        scope: { enabled: true, allowed },
        callerSupplied: true,
        agentLabel: "a",
      }),
    ).toEqual({ kind: "ok" });
  });

  it("is ok when the model is in scope", () => {
    expect(
      checkModelScope({
        model: { provider: "Anthropic", id: "Claude-Opus-4-6" },
        scope: { enabled: true, allowed },
        callerSupplied: true,
        agentLabel: "a",
      }),
    ).toEqual({ kind: "ok" });
  });

  it("errors for a caller-supplied out-of-scope model and lists the allowlist", () => {
    const verdict = checkModelScope({
      model: { provider: "google", id: "gemma-4-31b-it" },
      scope: { enabled: true, allowed },
      callerSupplied: true,
      agentLabel: "a",
      modelInput: "gemma",
    });

    expect(verdict.kind).toBe("error");
    if (verdict.kind !== "error") return;
    expect(verdict.message).toContain('Model not in scope: "gemma"');
    expect(verdict.message).toContain("anthropic/claude-opus-4-6");
  });

  it("warns, rather than errors, for a frontmatter-pinned or inherited model", () => {
    expect(
      checkModelScope({
        model: { provider: "google", id: "gemma-4-31b-it" },
        scope: { enabled: true, allowed },
        callerSupplied: false,
        agentLabel: "Explore",
      }),
    ).toEqual({
      kind: "warn",
      message: 'Agent "Explore" is using an out-of-scope model "google/gemma-4-31b-it".',
    });
  });
});

describe("modelScopeFor", () => {
  let globalDir: string;
  let projectDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    globalDir = mkdtempSync(join(tmpdir(), "pi-mscope-global-"));
    projectDir = mkdtempSync(join(tmpdir(), "pi-mscope-project-"));
    originalEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = globalDir;
  });

  afterEach(() => {
    if (originalEnv == null) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalEnv;
    rmSync(globalDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("returns a disabled scope without touching the filesystem when the flag is off", () => {
    expect(modelScopeFor("/nonexistent", undefined, false)).toEqual({
      enabled: false,
      allowed: undefined,
    });
  });

  it("resolves an enabled scope to undefined when nothing is configured", () => {
    const scope: ModelScopeInput = modelScopeFor(projectDir, { getAll: () => [], getAvailable: () => [] }, true);
    expect(scope).toEqual({ enabled: true, allowed: undefined });
  });

  it("resolves the allowlist from Pi's settings when enabled", () => {
    mkdirSync(join(projectDir, ".pi"), { recursive: true });
    writeFileSync(
      join(projectDir, ".pi", "settings.json"),
      JSON.stringify({ enabledModels: ["anthropic/claude-opus-4-6"] }),
    );
    const registry = { getAll: () => [{ provider: "anthropic", id: "claude-opus-4-6" }] };

    expect(modelScopeFor(projectDir, registry, true)).toEqual({
      enabled: true,
      allowed: new Set(["anthropic/claude-opus-4-6"]),
    });
  });
});
