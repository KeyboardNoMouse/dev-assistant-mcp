import { z } from "zod";
import type { MCPToolResult } from "./types.js";

/**
 * Unified error handler for all MCP tool handlers.
 * Eliminates 15 copies of the same try/catch pattern.
 *
 * Usage:
 *   } catch (error) {
 *     return handleToolError(error);
 *   }
 */
export function handleToolError(error: unknown): MCPToolResult {
  if (error instanceof z.ZodError) {
    const messages = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return {
      content: [{ type: "text", text: `Invalid input: ${messages}` }],
      isError: true,
    };
  }

  if (error instanceof ToolError) {
    return {
      content: [{ type: "text", text: error.message }],
      isError: true,
    };
  }

  if (error instanceof Error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: "An unknown error occurred." }],
    isError: true,
  };
}

/**
 * Typed error for tool-level failures.
 * Throw this instead of returning isError manually for cleaner control flow.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Wrap a tool handler in a standard try/catch so individual tools
 * don't need to repeat the error boundary boilerplate.
 *
 * Usage:
 *   handler: withErrorBoundary(async (args) => { ... })
 */
export function withErrorBoundary(
  fn: (args: unknown) => Promise<MCPToolResult>
): (args: unknown) => Promise<MCPToolResult> {
  return async (args: unknown) => {
    try {
      return await fn(args);
    } catch (error) {
      return handleToolError(error);
    }
  };
}
