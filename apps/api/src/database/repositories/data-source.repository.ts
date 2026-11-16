import { asc, eq } from "drizzle-orm";
import { db } from "../client";
import { dataSources, type DataSourceRow } from "../schema";

export const dataSourceRepository = {
  async list(): Promise<DataSourceRow[]> {
    return db.select().from(dataSources).orderBy(asc(dataSources.key));
  },

  async findByKey(key: string): Promise<DataSourceRow | null> {
    const rows = await db.select().from(dataSources).where(eq(dataSources.key, key)).limit(1);
    return rows[0] ?? null;
  },

  async ensure(input: {
    key: string;
    name: string;
    kind: "mcp" | "rest" | "manual" | "derived";
    baseUrl?: string | null;
    enabled?: boolean;
    termsNotes?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<DataSourceRow> {
    const rows = await db
      .insert(dataSources)
      .values({
        key: input.key,
        name: input.name,
        kind: input.kind,
        baseUrl: input.baseUrl ?? null,
        enabled: input.enabled ?? true,
        termsNotes: input.termsNotes ?? null,
        metadata: input.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: dataSources.key,
        set: {
          name: input.name,
          kind: input.kind,
          baseUrl: input.baseUrl ?? null,
          enabled: input.enabled ?? true,
          termsNotes: input.termsNotes ?? null,
          metadata: input.metadata ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to upsert data source");
    return row;
  },

  async markConnected(key: string): Promise<void> {
    await db
      .update(dataSources)
      .set({ lastConnectedAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(dataSources.key, key));
  },

  async markError(key: string, message: string): Promise<void> {
    await db
      .update(dataSources)
      .set({ lastErrorAt: new Date(), lastError: message.slice(0, 1000), updatedAt: new Date() })
      .where(eq(dataSources.key, key));
  },
};
