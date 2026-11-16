import { eq } from "drizzle-orm";
import { db } from "../client";
import { exchanges, type Exchange } from "../schema";

const NSE_CODE = "NSE";

export const exchangeRepository = {
  async findByCode(code: string): Promise<Exchange | null> {
    const rows = await db.select().from(exchanges).where(eq(exchanges.code, code)).limit(1);
    return rows[0] ?? null;
  },

  async ensure(input: {
    code: string;
    name: string;
    mic?: string | null;
    country?: string;
    timezone?: string;
  }): Promise<Exchange> {
    const rows = await db
      .insert(exchanges)
      .values({
        code: input.code,
        name: input.name,
        mic: input.mic ?? null,
        country: input.country ?? "IN",
        timezone: input.timezone ?? "Asia/Kolkata",
      })
      .onConflictDoUpdate({
        target: exchanges.code,
        set: { name: input.name, updatedAt: new Date() },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to ensure exchange");
    return row;
  },

  async ensureNse(): Promise<Exchange> {
    return this.ensure({
      code: NSE_CODE,
      name: "National Stock Exchange of India",
      mic: "XNSE",
      country: "IN",
      timezone: "Asia/Kolkata",
    });
  },
};

export { NSE_CODE };
