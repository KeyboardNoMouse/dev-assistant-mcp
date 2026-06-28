import type { ToolPlugin, MCPToolResult } from "./types.js";
import { withCorrelation } from "../observability/correlationContext.js";

/**
 * ToolRegistry — replaces the flat `tools` array.
 *
 * Supports dynamic registration, middleware hooks, and ordered resolution.
 * All tool modules register themselves; index.ts just imports and mounts the registry.
 */
export class ToolRegistry {
  private readonly plugins = new Map<string, ToolPlugin>();
  private readonly beforeHooks: Array<(name: string, args: unknown) => void> = [];
  private readonly afterHooks: Array<(name: string, result: MCPToolResult, durationMs: number) => void> = [];

  register(plugin: ToolPlugin): this {
    if (this.plugins.has(plugin.definition.name)) {
      throw new Error(`Tool "${plugin.definition.name}" is already registered.`);
    }
    this.plugins.set(plugin.definition.name, plugin);
    return this;
  }

  registerMany(plugins: ToolPlugin[]): this {
    for (const p of plugins) this.register(p);
    return this;
  }

  resolve(name: string): ToolPlugin | undefined {
    return this.plugins.get(name);
  }

  listDefinitions() {
    return Array.from(this.plugins.values()).map((p) => p.definition);
  }

  /**
   * Call a tool by name, running all registered before/after hooks.
   * Wrapped in a correlation context (see observability/correlationContext.ts)
   * so every log line and metric recorded anywhere inside the tool's
   * execution — including nested workflow step calls — automatically
   * carries a traceable ID, without the tool itself knowing anything
   * about correlation IDs.
   */
  async call(name: string, args: unknown): Promise<MCPToolResult> {
    return withCorrelation(async () => {
      const plugin = this.plugins.get(name);
      if (!plugin) {
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      for (const hook of this.beforeHooks) hook(name, args);

      const startedAt = Date.now();
      const result = await plugin.handler(args);
      const durationMs = Date.now() - startedAt;

      for (const hook of this.afterHooks) hook(name, result, durationMs);

      return result;
    });
  }

  /** Register a hook that runs before every tool call. */
  before(fn: (name: string, args: unknown) => void): this {
    this.beforeHooks.push(fn);
    return this;
  }

  /** Register a hook that runs after every tool call. Receives the call duration in ms. */
  after(fn: (name: string, result: MCPToolResult, durationMs: number) => void): this {
    this.afterHooks.push(fn);
    return this;
  }

  get size(): number {
    return this.plugins.size;
  }
}

/** Global singleton registry — all tool modules register into this. */
export const registry = new ToolRegistry();
