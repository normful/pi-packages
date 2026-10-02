import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeLegacyFrontmatter } from "#src/config/legacy-frontmatter";

describe("normalizeLegacyFrontmatter — tools selectors", () => {
  it("strips a leading `ext:<pkg>/` from a comma-separated scalar", () => {
    const { toolNames } = normalizeLegacyFrontmatter(
      { tools: "ext:rpiv-web-tools/web_search, read" },
      "webtools",
    );

    expect(toolNames).toEqual(["web_search", "read"]);
  });

  it("strips a leading `ext:<pkg>/` from a YAML sequence", () => {
    const { toolNames } = normalizeLegacyFrontmatter(
      { tools: ["ext:rpiv-web-tools/web_search", "ext:rpiv-mcp/query", "grep"] },
      "webtools",
    );

    expect(toolNames).toEqual(["web_search", "query", "grep"]);
  });

  it("leaves bare tool names untouched", () => {
    const { toolNames } = normalizeLegacyFrontmatter({ tools: ["read", "bash"] }, "plain");

    expect(toolNames).toEqual(["read", "bash"]);
  });

  it("keeps the comma inside a quoted selector's trailing name", () => {
    const { toolNames } = normalizeLegacyFrontmatter(
      { tools: ["ext:rpiv-tools/odd,name"] },
      "odd",
    );

    expect(toolNames).toEqual(["odd,name"]);
  });

  it("is undefined when the key is absent", () => {
    expect(normalizeLegacyFrontmatter({}, "a").toolNames).toBeUndefined();
  });

  it("collapses the empty forms the loader turns into no tools", () => {
    expect(normalizeLegacyFrontmatter({ tools: "" }, "a").toolNames).toEqual([]);
    expect(normalizeLegacyFrontmatter({ tools: [] }, "a").toolNames).toEqual([]);
  });
});

describe("normalizeLegacyFrontmatter — isolated", () => {
  it("reads `isolated: true`", () => {
    expect(normalizeLegacyFrontmatter({ isolated: true }, "a").isolated).toBe(true);
  });

  it("reads a non-true value as an explicit false", () => {
    expect(normalizeLegacyFrontmatter({ isolated: false }, "a").isolated).toBe(false);
    expect(normalizeLegacyFrontmatter({ isolated: "yes" }, "a").isolated).toBe(false);
  });

  it("is undefined when the key is absent", () => {
    expect(normalizeLegacyFrontmatter({}, "a").isolated).toBeUndefined();
  });

  it("does not read the coupled `skills:` key into the result", () => {
    const normalized = normalizeLegacyFrontmatter(
      { isolated: true, skills: false },
      "a",
    );

    expect(normalized).toEqual({ toolNames: undefined, isolated: true });
  });
});

describe("normalizeLegacyFrontmatter — accepted no-ops", () => {
  it("ignores `extensions:` entirely", () => {
    const normalized = normalizeLegacyFrontmatter(
      { extensions: "rpiv-web-tools", tools: "read" },
      "a",
    );

    expect(normalized).toEqual({ toolNames: ["read"], isolated: undefined });
    expect(normalized).not.toHaveProperty("extensions");
  });

  it("ignores a matching `name:` without throwing", () => {
    const normalized = normalizeLegacyFrontmatter({ name: "same" }, "same");

    expect(normalized).toEqual({ toolNames: undefined, isolated: undefined });
  });
});

describe("normalizeLegacyFrontmatter — name mismatch debug line", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs a disagreement in debug and never re-keys", () => {
    vi.stubEnv("PI_SUBAGENTS_DEBUG", "1");

    const normalized = normalizeLegacyFrontmatter({ name: "declared" }, "filename");

    expect(console.warn).toHaveBeenCalledWith(
      "[pi-subagents:debug] agent filename frontmatter name:",
      expect.stringContaining('declared "declared"'),
    );
    expect(normalized).toEqual({ toolNames: undefined, isolated: undefined });
  });

  it("stays silent when the declared name matches the filename", () => {
    vi.stubEnv("PI_SUBAGENTS_DEBUG", "1");

    normalizeLegacyFrontmatter({ name: "  filename  " }, "filename");

    expect(console.warn).not.toHaveBeenCalled();
  });
});
