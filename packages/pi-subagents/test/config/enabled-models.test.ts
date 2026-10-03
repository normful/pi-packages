import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isModelInScope,
  readEnabledModels,
  resolveEnabledModels,
} from "#src/config/enabled-models";

const registry = {
  getAll: () => [
    { provider: "anthropic", id: "claude-sonnet-4-6" },
    { provider: "anthropic", id: "claude-opus-4-6" },
    { provider: "google", id: "gemma-4-31b-it" },
  ],
};

describe("readEnabledModels", () => {
  let globalDir: string;
  let projectDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    globalDir = mkdtempSync(join(tmpdir(), "pi-scope-global-"));
    projectDir = mkdtempSync(join(tmpdir(), "pi-scope-project-"));
    originalEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = globalDir;
  });

  afterEach(() => {
    if (originalEnv == null) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalEnv;
    rmSync(globalDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  function writeGlobal(obj: unknown) {
    writeFileSync(join(globalDir, "settings.json"), JSON.stringify(obj));
  }
  function writeProject(obj: unknown) {
    mkdirSync(join(projectDir, ".pi"), { recursive: true });
    writeFileSync(join(projectDir, ".pi", "settings.json"), JSON.stringify(obj));
  }

  it("is undefined when neither file sets enabledModels", () => {
    expect(readEnabledModels(projectDir)).toBeUndefined();
  });

  it("reads the global file", () => {
    writeGlobal({ enabledModels: ["anthropic/claude-opus-4-6"] });
    expect(readEnabledModels(projectDir)).toEqual(["anthropic/claude-opus-4-6"]);
  });

  it("reads the project file", () => {
    writeProject({ enabledModels: ["anthropic/claude-sonnet-4-6"] });
    expect(readEnabledModels(projectDir)).toEqual(["anthropic/claude-sonnet-4-6"]);
  });

  it("lets the project list wholly replace the global one", () => {
    writeGlobal({ enabledModels: ["anthropic/claude-opus-4-6"] });
    writeProject({ enabledModels: ["anthropic/claude-sonnet-4-6"] });
    expect(readEnabledModels(projectDir)).toEqual(["anthropic/claude-sonnet-4-6"]);
  });

  it("ignores a corrupt file", () => {
    writeFileSync(join(globalDir, "settings.json"), "not json {{");
    expect(readEnabledModels(projectDir)).toBeUndefined();
  });

  it("keeps only the string entries", () => {
    writeGlobal({ enabledModels: ["anthropic/claude-opus-4-6", 5, null, {}] });
    expect(readEnabledModels(projectDir)).toEqual(["anthropic/claude-opus-4-6"]);
  });
});

describe("resolveEnabledModels", () => {
  it("is undefined without patterns", () => {
    expect(resolveEnabledModels(undefined, registry)).toBeUndefined();
    expect(resolveEnabledModels([], registry)).toBeUndefined();
  });

  it("is undefined without a registry", () => {
    expect(resolveEnabledModels(["anthropic/claude-opus-4-6"], undefined)).toBeUndefined();
  });

  it("resolves exact provider/modelId keys, case-insensitively", () => {
    expect(resolveEnabledModels(["Anthropic/CLAUDE-Opus-4-6"], registry)).toEqual(
      new Set(["anthropic/claude-opus-4-6"]),
    );
  });

  it("drops bare ids, globs and unknown models", () => {
    const allowed = resolveEnabledModels(
      ["opus", "*sonnet*", "anthropic/nope", "anthropic/claude-opus-4-6"],
      registry,
    );
    expect(allowed).toEqual(new Set(["anthropic/claude-opus-4-6"]));
  });

  it("is undefined when nothing matches", () => {
    expect(resolveEnabledModels(["nope/nope"], registry)).toBeUndefined();
  });

  it("resolves against the available subset, not the full catalogue", () => {
    const withAvailable = {
      getAll: () => [{ provider: "anthropic", id: "claude-opus-4-6" }],
      getAvailable: () => [{ provider: "anthropic", id: "claude-sonnet-4-6" }],
    };
    expect(resolveEnabledModels(["anthropic/claude-sonnet-4-6"], withAvailable)).toEqual(
      new Set(["anthropic/claude-sonnet-4-6"]),
    );
    expect(resolveEnabledModels(["anthropic/claude-opus-4-6"], withAvailable)).toBeUndefined();
  });
});

describe("isModelInScope", () => {
  it("matches the provider/id key case-insensitively", () => {
    const allowed = new Set(["anthropic/claude-opus-4-6"]);
    expect(isModelInScope({ provider: "Anthropic", id: "Claude-Opus-4-6" }, allowed)).toBe(true);
    expect(isModelInScope({ provider: "anthropic", id: "claude-sonnet-4-6" }, allowed)).toBe(false);
  });
});
