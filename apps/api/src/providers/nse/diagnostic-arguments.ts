import type { DiscoveredTool } from "./client/mcp-server-connection";

export interface SampleArgumentsResult {
  arguments: Record<string, unknown>;
  unsupportedRequiredFields: string[];
}

interface JsonSchemaProperty {
  type?: string | string[];
  enum?: unknown[];
  items?: { type?: string; enum?: unknown[] };
  default?: unknown;
  minimum?: number;
  maximum?: number;
  description?: string;
}

function schemaOf(tool: DiscoveredTool): {
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
} {
  const schema = (tool.inputSchema ?? {}) as {
    properties?: Record<string, JsonSchemaProperty>;
    required?: unknown;
  };
  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === "string")
    : [];
  return { properties: schema.properties ?? {}, required };
}

function sampleForField(name: string, property: JsonSchemaProperty, today: string): unknown | undefined {
  const key = name.toLowerCase();

  if (property.enum && property.enum.length > 0) {
    // Prefer a documented default when the schema provides one.
    if (property.default !== undefined) return property.default;
    return property.enum[0];
  }

  if (key.includes("date")) return today;
  if (key === "symbols" || key === "indexnames") {
    return key === "indexnames" ? ["Nifty 50"] : ["RELIANCE", "TCS"];
  }
  if (key === "symbol") return "RELIANCE";
  if (key.includes("indexname")) return "Nifty 50";
  if (key === "months") return 1;
  if (key === "days") return 20;
  if (key === "n" || key.includes("limit") || key.includes("count")) return 3;
  if (key === "direction") return "gain";
  if (key === "sortby") return "volume";
  if (key === "group") return "broad";
  if (key === "namefilter") return "NIFTY";
  if (key === "filter") return "";
  if (key === "query") return "NIFTY";
  if (key === "period") return "1D";
  if (key === "scope") return "all";
  if (key === "enddate") return "today";
  if (key === "fromdate" || key === "todate") return today;

  switch (property.type) {
    case "string":
      return "";
    case "integer":
    case "number":
      return property.minimum ?? 1;
    case "boolean":
      return true;
    case "array":
      if (property.items?.enum && property.items.enum.length > 0) return [property.items.enum[0]];
      return ["RELIANCE"];
    default:
      return undefined;
  }
}

/**
 * Derives a minimal safe argument object strictly from a discovered input
 * schema. Tools whose required fields cannot be satisfied are reported, never
 * called with invented parameters.
 */
export function buildSampleArguments(tool: DiscoveredTool, today: string): SampleArgumentsResult {
  const { properties, required } = schemaOf(tool);
  const args: Record<string, unknown> = {};
  const unsupportedRequiredFields: string[] = [];

  for (const [name, property] of Object.entries(properties)) {
    const value = sampleForField(name, property, today);
    const isRequired = required.includes(name);
    if (value === undefined) {
      if (isRequired) unsupportedRequiredFields.push(name);
      continue;
    }
    args[name] = value;
  }

  for (const name of required) {
    if (!(name in args) && !unsupportedRequiredFields.includes(name)) {
      unsupportedRequiredFields.push(name);
    }
  }

  return { arguments: args, unsupportedRequiredFields };
}
