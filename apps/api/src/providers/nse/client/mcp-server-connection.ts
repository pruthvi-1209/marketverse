import { promises as fs } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { env } from "../../../config/env";
import { logger } from "../../../core/logger/logger";
import {
  AppError,
  DataUnavailableError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "../../../core/errors/app-error";

export type McpConnectionStatus = "connected" | "unavailable" | "disabled" | "unknown";

export interface DiscoveredTool {
  name: string;
  description: string | null;
  inputSchema: unknown;
  requiredFields: string[];
  properties: string[];
  discoveredAt: string;
}

interface CatalogCacheFile {
  url: string;
  fetchedAt: string;
  serverInfo: { name?: string; version?: string } | null;
  tools: DiscoveredTool[];
}

export interface McpClientConfig {
  key: string;
  label: string;
  url: string;
  enabled: boolean;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
}

const CACHE_DIRECTORY = path.join(env.apiPackageRoot, ".tmp");

export class McpServerConnection {
  readonly key: string;
  readonly label: string;
  readonly url: string;
  private readonly config: McpClientConfig;
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private tools: DiscoveredTool[] | null = null;
  private toolsFetchedAt: Date | null = null;
  private status: McpConnectionStatus;
  private detail: string | null = null;
  private lastConnectedAt: Date | null = null;
  private lastErrorAt: Date | null = null;
  private readonly cachePath: string;

  constructor(config: McpClientConfig) {
    this.config = config;
    this.key = config.key;
    this.label = config.label;
    this.url = config.url;
    this.status = config.enabled ? "unknown" : "disabled";
    this.cachePath = path.join(CACHE_DIRECTORY, `nse-tool-catalog.${config.key}.json`);
  }

  getStatus(): {
    status: McpConnectionStatus;
    detail: string | null;
    toolCount: number | null;
    lastConnectedAt: Date | null;
    lastErrorAt: Date | null;
  } {
    return {
      status: this.status,
      detail: this.detail,
      toolCount: this.tools?.length ?? null,
      lastConnectedAt: this.lastConnectedAt,
      lastErrorAt: this.lastErrorAt,
    };
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new ProviderUnavailableError(this.label, "MCP integration is disabled by configuration");
    }
  }

  private createClient(): Client {
    const client = new Client(
      { name: "marketverse-api", version: env.APP_VERSION },
      { capabilities: {} },
    );
    client.onerror = (error) => {
      logger.warn({ err: error, provider: this.key }, "MCP client error");
    };
    return client;
  }

  async ensureConnected(): Promise<void> {
    this.assertEnabled();
    if (this.client && this.status === "connected") return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const startedAt = Date.now();
      const client = this.createClient();
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        reconnectionOptions: {
          maxReconnectionDelay: 5_000,
          initialReconnectionDelay: 250,
          reconnectionDelayGrowFactor: 2,
          maxRetries: this.config.maxRetries,
        },
      });
      try {
        await client.connect(transport, { timeout: this.config.timeoutMs });
        this.client = client;
        this.status = "connected";
        this.detail = null;
        this.lastConnectedAt = new Date();
        logger.info(
          { provider: this.key, url: this.url, durationMs: Date.now() - startedAt },
          "Connected to NSE MCP server",
        );
      } catch (error) {
        this.status = "unavailable";
        this.lastErrorAt = new Date();
        this.detail = error instanceof Error ? error.message : String(error);
        await client.close().catch(() => undefined);
        logger.warn(
          { err: error, provider: this.key, durationMs: Date.now() - startedAt },
          "Failed to connect to NSE MCP server",
        );
        if (this.isTimeout(error)) {
          throw new ProviderTimeoutError(this.label, this.config.timeoutMs);
        }
        throw new ProviderUnavailableError(this.label, this.detail);
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (this.status === "connected") this.status = "unknown";
    if (client) {
      await client.close().catch(() => undefined);
    }
  }

  private isTimeout(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return /timed? ?out|timeout/i.test(error.message);
  }

  /** Discovers tools dynamically via MCP `tools/list`. Never assumes tool names. */
  async discoverTools(force = false): Promise<DiscoveredTool[]> {
    this.assertEnabled();
    const cacheFresh =
      this.tools !== null &&
      this.toolsFetchedAt !== null &&
      Date.now() - this.toolsFetchedAt.getTime() < this.config.cacheTtlMs;
    if (!force && cacheFresh) return this.tools ?? [];

    try {
      await this.ensureConnected();
      if (!this.client) throw new ProviderUnavailableError(this.label, "Client is not connected");
      const result = await this.client.listTools(undefined, { timeout: this.config.timeoutMs });
      const discoveredAt = new Date().toISOString();
      const tools = result.tools.map((tool: Tool) => this.toDiscoveredTool(tool, discoveredAt));
      this.tools = tools;
      this.toolsFetchedAt = new Date();
      this.status = "connected";
      this.detail = null;
      await this.writeCache(tools);
      logger.info({ provider: this.key, tools: tools.length }, "Discovered NSE MCP tools");
      return tools;
    } catch (error) {
      logger.warn({ err: error, provider: this.key }, "NSE MCP tool discovery failed");
      const cached = await this.readCache();
      if (cached) {
        this.tools = cached.tools;
        this.toolsFetchedAt = new Date(cached.fetchedAt);
        this.detail = `Using cached tool catalogue from ${cached.fetchedAt} after discovery failure`;
        logger.warn(
          { provider: this.key, tools: cached.tools.length, fetchedAt: cached.fetchedAt },
          "Falling back to cached NSE tool catalogue",
        );
        return cached.tools;
      }
      throw error instanceof AppError
        ? error
        : new ProviderUnavailableError(this.label, String(error));
    }
  }

  private toDiscoveredTool(tool: Tool, discoveredAt: string): DiscoveredTool {
    const inputSchema = (tool.inputSchema ?? {}) as {
      required?: unknown;
      properties?: Record<string, unknown>;
    };
    const required = Array.isArray(inputSchema.required)
      ? inputSchema.required.filter((value): value is string => typeof value === "string")
      : [];
    return {
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema ?? null,
      requiredFields: required,
      properties: Object.keys(inputSchema.properties ?? {}),
      discoveredAt,
    };
  }

  async hasTool(toolName: string): Promise<boolean> {
    const tools = await this.discoverTools();
    return tools.some((tool) => tool.name === toolName);
  }

  /**
   * Invokes a discovered tool and validates its parsed JSON payload with the
   * supplied Zod schema. Retries transport-level failures once with a fresh
   * connection; invalid payloads are never silently accepted.
   */
  async invoke<T>(
    toolName: string,
    args: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; raw: unknown; tool: DiscoveredTool }> {
    this.assertEnabled();
    const tools = await this.discoverTools();
    const tool = tools.find((candidate) => candidate.name === toolName);
    if (!tool) {
      throw new DataUnavailableError(
        `NSE server '${this.label}' does not expose the '${toolName}' tool; the capability is unavailable.`,
        { availableTools: tools.map((candidate) => candidate.name) },
      );
    }

    const attempts = this.config.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.ensureConnected();
        if (!this.client) throw new ProviderUnavailableError(this.label, "Client is not connected");
        const result = await this.client.callTool(
          { name: toolName, arguments: args },
          undefined,
          { timeout: this.config.timeoutMs },
        );
        const payload = this.extractPayload(result);
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          throw new DataUnavailableError(
            `NSE tool '${toolName}' returned a payload that failed validation`,
            {
              issues: parsed.error.issues.slice(0, 10).map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
          );
        }
        this.status = "connected";
        this.detail = null;
        return { data: parsed.data, raw: payload, tool };
      } catch (error) {
        lastError = error;
        logger.warn(
          { err: error, provider: this.key, tool: toolName, attempt, attempts },
          "NSE MCP tool invocation failed",
        );
        if (error instanceof DataUnavailableError) throw error;
        this.lastErrorAt = new Date();
        this.detail = error instanceof Error ? error.message : String(error);
        // A failed call may leave a dead session; force a reconnect next time.
        await this.disconnect();
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
        }
      }
    }

    this.status = "unavailable";
    if (this.isTimeout(lastError)) {
      throw new ProviderTimeoutError(this.label, this.config.timeoutMs);
    }
    throw new ProviderUnavailableError(
      this.label,
      lastError instanceof Error ? lastError.message : String(lastError),
    );
  }

  /** Diagnostic helper: invokes a tool and returns the parsed JSON without schema validation. */
  async invokeRaw(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; tool: DiscoveredTool }> {
    const result = await this.invoke(toolName, args, z.unknown() as z.ZodType<unknown>);
    return { data: result.data, tool: result.tool };
  }

  private extractPayload(result: unknown): unknown {    if (result && typeof result === "object" && "structuredContent" in result) {
      const structured = (result as { structuredContent?: unknown }).structuredContent;
      if (structured !== undefined && structured !== null) return structured;
    }
    const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
    const textPart = Array.isArray(content)
      ? content.find((part) => part.type === "text" && typeof part.text === "string")
      : undefined;
    if (!textPart?.text) {
      throw new DataUnavailableError("NSE MCP response did not contain a text payload");
    }
    try {
      return JSON.parse(textPart.text);
    } catch {
      throw new DataUnavailableError("NSE MCP response was not valid JSON", {
        preview: textPart.text.slice(0, 200),
      });
    }
  }

  private async writeCache(tools: DiscoveredTool[]): Promise<void> {
    const payload: CatalogCacheFile = {
      url: this.url,
      fetchedAt: new Date().toISOString(),
      serverInfo: null,
      tools,
    };
    try {
      await fs.mkdir(CACHE_DIRECTORY, { recursive: true });
      await fs.writeFile(this.cachePath, JSON.stringify(payload, null, 2), "utf8");
    } catch (error) {
      logger.debug({ err: error, provider: this.key }, "Unable to persist NSE tool catalogue");
    }
  }

  private async readCache(): Promise<CatalogCacheFile | null> {
    try {
      const contents = await fs.readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(contents) as CatalogCacheFile;
      if (parsed.url !== this.url || !Array.isArray(parsed.tools)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
