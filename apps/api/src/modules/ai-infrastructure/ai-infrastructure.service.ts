import type {
  AiInfrastructureCompany,
  AiInfrastructureOverview,
  AiRelevance,
  ResponseMeta,
} from "@marketverse/contracts";
import { env } from "../../config/env";
import { storedResponseMeta } from "../../core/http/response-meta";
import { NotFoundError } from "../../core/errors/app-error";
import { toNumber } from "../../core/utils/numbers";
import { indicatorsRepository } from "../../database/repositories/indicators.repository";
import { marketRepository } from "../../database/repositories/market.repository";
import { newsRepository } from "../../database/repositories/news.repository";
import { researchRepository } from "../../database/repositories/research.repository";
import { scoringRepository, mapEntryRow, mapQualityRow } from "../../database/repositories/scoring.repository";
import { stocksRepository } from "../../database/repositories/stocks.repository";
import { exchangeRepository } from "../../database/repositories/exchanges.repository";
import type { ResponseMeta as Meta } from "@marketverse/contracts";

const INTERPRETATION_DISCLAIMER =
  "Exposure descriptions are MarketVerse research interpretation, not NSE-sourced facts. " +
  "Inclusion in this list is not a recommendation and does not mean the company earns AI-related revenue.";

export const AI_RELEVANCE_DISCLAIMER = INTERPRETATION_DISCLAIMER;

function emptyRelevance(note?: string | null): AiRelevance {
  return {
    businessSummary: null,
    aiInfrastructureRelevance:
      note ??
      "This symbol is on the configured AI-infrastructure research watchlist. Sourced exposure notes are not recorded yet.",
    powerInfrastructureExposure: null,
    dataCenterExposure: null,
    coolingThermalExposure: null,
    networkingConnectivityExposure: null,
    orderBookNotes: null,
    majorRisks: [],
    interpretationDisclaimer: INTERPRETATION_DISCLAIMER,
  };
}

export class AiInfrastructureService {
  async overview(): Promise<{ overview: AiInfrastructureOverview; meta: Meta }> {
    const companies = await this.buildCompanies();
    const withQuality = companies.filter((company) => company.qualityScore !== null).length;
    const withEntry = companies.filter((company) => company.entryScore !== null).length;
    const withFundamentals = companies.filter(
      (company) => company.relevance.businessSummary !== null,
    ).length;

    return {
      overview: {
        companies,
        coverage: {
          total: companies.length,
          withQualityScore: withQuality,
          withEntryScore: withEntry,
          withVerifiedFundamentals: withFundamentals,
        },
        asOf: new Date().toISOString(),
      },
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  async company(symbol: string): Promise<{ company: AiInfrastructureCompany; meta: Meta }> {
    const normalized = symbol.trim().toUpperCase();
    const companies = await this.buildCompanies([normalized]);
    const company = companies[0];
    if (!company) throw new NotFoundError("AI infrastructure company", normalized);
    return { company, meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  /**
   * Ensures every configured symbol has a stock row and a research row. It only
   * creates reference rows: no exposure claims, prices or fundamentals are
   * invented here.
   */
  async syncConfiguredCompanies(): Promise<{ created: number; updated: number }> {
    const exchange = await exchangeRepository.ensureNse();
    const configured = [...new Set(env.AI_INFRA_WATCHLIST_SYMBOLS.map((s) => s.trim().toUpperCase()))];
    let created = 0;
    let updated = 0;

    for (const symbol of configured) {
      const stock =
        (await stocksRepository.findBySymbol(symbol)) ??
        (await stocksRepository.upsert({
          symbol,
          name: null,
          exchangeId: exchange.id,
          listingStatus: "unknown",
          instrumentType: "equity",
          dataSource: "manual-watchlist",
          lastUpdatedAt: new Date(),
        }));

      const existing = await researchRepository.findCompany(symbol);
      await researchRepository.upsertCompany({
        stockId: stock.id,
        symbol: stock.symbol,
        name: existing?.name ?? stock.name ?? stock.symbol,
        isWatchlistMember: true,
        relevance: existing?.relevance ?? emptyRelevance(),
        sourceNotes: existing?.sourceNotes ?? "Configured AI-infrastructure watchlist",
      });
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  private async buildCompanies(symbolFilter?: string[]): Promise<AiInfrastructureCompany[]> {
    const researchRows = await researchRepository.listCompanies();
    const researchBySymbol = new Map(researchRows.map((row) => [row.symbol, row]));
    const configured = symbolFilter ?? [...new Set(env.AI_INFRA_WATCHLIST_SYMBOLS.map((s) => s.toUpperCase()))];
    const symbols = [...new Set([...configured, ...researchRows.map((row) => row.symbol)])];

    const companies: AiInfrastructureCompany[] = [];
    for (const symbol of symbols) {
      const stock = await stocksRepository.findBySymbol(symbol);
      if (!stock) continue;
      const [quoteRow, indicatorsRow, qualityRow, entryRow, newsRows] = await Promise.all([
        marketRepository.latestQuote(stock.id),
        indicatorsRepository.latest(stock.id),
        scoringRepository.latestQuality(stock.id),
        scoringRepository.latestEntry(stock.id),
        newsRepository.list({ symbol, limit: 3 }),
      ]);
      const research = researchBySymbol.get(symbol);
      companies.push({
        id: research?.id ?? stock.id,
        symbol: stock.symbol,
        name: research?.name ?? stock.name ?? stock.symbol,
        relevance: research?.relevance ?? emptyRelevance(),
        isWatchlistMember:
          research?.isWatchlistMember ?? env.AI_INFRA_WATCHLIST_SYMBOLS.includes(stock.symbol),
        quote: quoteRow
          ? {
              lastPrice: toNumber(quoteRow.lastPrice),
              changePercent: toNumber(quoteRow.changePercent),
              volume: toNumber(quoteRow.volume),
              observedAt: quoteRow.observedAt.toISOString(),
            }
          : null,
        indicators: indicatorsRow
          ? {
              symbol: indicatorsRow.symbol,
              asOfDate: indicatorsRow.asOfDate,
              calculatedAt: indicatorsRow.calculatedAt.toISOString(),
              version: indicatorsRow.version,
              values: indicatorsRow.values,
              missing: indicatorsRow.missing,
              observationsUsed: indicatorsRow.observationsUsed,
            }
          : null,
        qualityScore: qualityRow ? mapQualityRow(qualityRow) : null,
        entryScore: entryRow ? mapEntryRow(entryRow) : null,
        latestNews: newsRows.map((row) => ({
          title: row.title,
          url: row.url,
          publishedAt: row.publishedAt.toISOString(),
          sourceName: row.sourceName,
        })),
        updatedAt: (research?.updatedAt ?? stock.updatedAt).toISOString(),
      });
    }

    return companies.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }
}

export const aiInfrastructureService = new AiInfrastructureService();

/** Guards against accidental contract drift when the relevance shape changes. */
export type _AiResponseMeta = ResponseMeta;
