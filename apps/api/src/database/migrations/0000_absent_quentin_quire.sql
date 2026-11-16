CREATE TYPE "public"."alert_operator" AS ENUM('above', 'below', 'crosses_above', 'crosses_below', 'change_above', 'change_below');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('price_threshold', 'percent_change', 'dma_crossover', 'rsi_threshold', 'volume_spike', 'quality_score_change', 'entry_score_change', 'watchlist_event');--> statement-breakpoint
CREATE TYPE "public"."data_source_kind" AS ENUM('mcp', 'rest', 'manual', 'derived');--> statement-breakpoint
CREATE TYPE "public"."delay_classification" AS ENUM('real_time', 'delayed_1_3_min', 'end_of_day', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('running', 'success', 'partial', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('listed', 'suspended', 'delisted', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fundamental_period_type" AS ENUM('annual', 'quarterly', 'ttm');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "data_source_kind" NOT NULL,
	"base_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"terms_notes" text,
	"last_connected_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"mic" text,
	"country" text DEFAULT 'IN' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"isin" text,
	"exchange_id" uuid NOT NULL,
	"sector" text,
	"industry" text,
	"listing_status" "listing_status" DEFAULT 'unknown' NOT NULL,
	"instrument_type" text,
	"data_source" text DEFAULT 'nse' NOT NULL,
	"source_updated_at" timestamp with time zone,
	"last_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historical_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"trading_date" date NOT NULL,
	"open" numeric(18, 4),
	"high" numeric(18, 4),
	"low" numeric(18, 4),
	"close" numeric(18, 4),
	"previous_close" numeric(18, 4),
	"volume" bigint,
	"turnover" numeric(24, 4),
	"source" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"index_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"trading_date" date NOT NULL,
	"open" numeric(18, 4),
	"high" numeric(18, 4),
	"low" numeric(18, 4),
	"close" numeric(18, 4),
	"previous_close" numeric(18, 4),
	"change_percent" numeric(12, 4),
	"source" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"index_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"trading_date" date NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"last_price" numeric(18, 4),
	"change_value" numeric(18, 4),
	"change_percent" numeric(12, 4),
	"open" numeric(18, 4),
	"high" numeric(18, 4),
	"low" numeric(18, 4),
	"previous_close" numeric(18, 4),
	"source" text NOT NULL,
	"delay_classification" "delay_classification" DEFAULT 'delayed_1_3_min' NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_breadth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trading_date" date NOT NULL,
	"advances" bigint,
	"declines" bigint,
	"unchanged" bigint,
	"advance_decline_ratio" numeric(12, 4),
	"total_stocks" bigint,
	"total_volume" numeric(30, 0),
	"observed_at" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_indices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"exchange_id" uuid,
	"exchange_code" text DEFAULT 'NSE' NOT NULL,
	"description" text,
	"is_benchmark" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"exchange_code" text DEFAULT 'NSE' NOT NULL,
	"trading_date" date NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"last_price" numeric(18, 4),
	"change_value" numeric(18, 4),
	"change_percent" numeric(12, 4),
	"open" numeric(18, 4),
	"high" numeric(18, 4),
	"low" numeric(18, 4),
	"previous_close" numeric(18, 4),
	"volume" bigint,
	"turnover" numeric(24, 4),
	"year_high" numeric(18, 4),
	"year_low" numeric(18, 4),
	"source" text NOT NULL,
	"tool" text,
	"delay_classification" "delay_classification" DEFAULT 'delayed_1_3_min' NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_infrastructure_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"is_watchlist_member" boolean DEFAULT true NOT NULL,
	"relevance" jsonb NOT NULL,
	"source_notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_fundamentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"period_type" "fundamental_period_type" NOT NULL,
	"period_end" date NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"revenue" numeric(20, 2),
	"net_profit" numeric(20, 2),
	"eps" numeric(18, 4),
	"roe_percent" numeric(10, 4),
	"operating_margin_percent" numeric(10, 4),
	"debt_to_equity" numeric(10, 4),
	"promoter_holding_percent" numeric(10, 4),
	"institutional_holding_percent" numeric(10, 4),
	"source" text NOT NULL,
	"source_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"as_of_date" date NOT NULL,
	"score" numeric(6, 2) NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"coverage_percent" numeric(6, 2) NOT NULL,
	"components" jsonb NOT NULL,
	"risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invalidation_level" numeric(18, 4),
	"explanation" text NOT NULL,
	"methodology_version" text NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"as_of_date" date NOT NULL,
	"score" numeric(6, 2) NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"available_points" numeric(6, 2) NOT NULL,
	"coverage_percent" numeric(6, 2) NOT NULL,
	"categories" jsonb NOT NULL,
	"missing_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"explanation" jsonb NOT NULL,
	"methodology_version" text NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"as_of_date" date NOT NULL,
	"version" text NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"observations_used" integer DEFAULT 0 NOT NULL,
	"values" jsonb NOT NULL,
	"missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"benchmark_symbol" text DEFAULT 'NIFTY 50' NOT NULL,
	"fd_annual_rate" numeric(6, 5) DEFAULT '0.08' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"average_buy_price" numeric(18, 4),
	"invested_amount" numeric(20, 4) NOT NULL,
	"realized_pnl" numeric(20, 4) DEFAULT '0' NOT NULL,
	"first_buy_date" date,
	"last_calculated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"stock_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"price" numeric(18, 4) NOT NULL,
	"charges" numeric(18, 4) DEFAULT '0' NOT NULL,
	"traded_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"triggered_at" timestamp with time zone NOT NULL,
	"observed_value" numeric(20, 4),
	"message" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"delivery_error" text
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "alert_type" NOT NULL,
	"symbol" text,
	"watchlist_id" uuid,
	"operator" "alert_operator" NOT NULL,
	"threshold" numeric(20, 4),
	"parameters" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"cooldown_seconds" integer DEFAULT 3600 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"source_name" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"summary" text,
	"related_symbols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_sectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" text,
	"is_derived_metadata" boolean DEFAULT true NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_refresh_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"details" jsonb
);
--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_prices" ADD CONSTRAINT "historical_prices_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_history" ADD CONSTRAINT "index_history_index_id_market_indices_id_fk" FOREIGN KEY ("index_id") REFERENCES "public"."market_indices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_quotes" ADD CONSTRAINT "index_quotes_index_id_market_indices_id_fk" FOREIGN KEY ("index_id") REFERENCES "public"."market_indices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_indices" ADD CONSTRAINT "market_indices_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_infrastructure_companies" ADD CONSTRAINT "ai_infrastructure_companies_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fundamentals" ADD CONSTRAINT "company_fundamentals_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_scores" ADD CONSTRAINT "entry_scores_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_scores" ADD CONSTRAINT "investment_scores_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_indicators" ADD CONSTRAINT "technical_indicators_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_account_id_portfolio_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."portfolio_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_account_id_portfolio_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."portfolio_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_transactions" ADD CONSTRAINT "portfolio_transactions_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_sources_key_unique" ON "data_sources" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "exchanges_code_unique" ON "exchanges" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "stocks_symbol_unique" ON "stocks" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "stocks_isin_idx" ON "stocks" USING btree ("isin");--> statement-breakpoint
CREATE INDEX "stocks_sector_idx" ON "stocks" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "stocks_exchange_idx" ON "stocks" USING btree ("exchange_id");--> statement-breakpoint
CREATE INDEX "stocks_name_lower_idx" ON "stocks" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "historical_prices_dedupe_unique" ON "historical_prices" USING btree ("stock_id","trading_date","source");--> statement-breakpoint
CREATE INDEX "historical_prices_stock_date_idx" ON "historical_prices" USING btree ("stock_id","trading_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "historical_prices_date_idx" ON "historical_prices" USING btree ("trading_date");--> statement-breakpoint
CREATE UNIQUE INDEX "index_history_dedupe_unique" ON "index_history" USING btree ("index_id","trading_date","source");--> statement-breakpoint
CREATE INDEX "index_history_index_date_idx" ON "index_history" USING btree ("index_id","trading_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "index_history_symbol_idx" ON "index_history" USING btree ("symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "index_quotes_dedupe_unique" ON "index_quotes" USING btree ("index_id","observed_at","source");--> statement-breakpoint
CREATE INDEX "index_quotes_symbol_observed_idx" ON "index_quotes" USING btree ("symbol","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "index_quotes_trading_date_idx" ON "index_quotes" USING btree ("trading_date");--> statement-breakpoint
CREATE INDEX "index_quotes_observation_idx" ON "index_quotes" USING btree ("observed_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "market_breadth_dedupe_unique" ON "market_breadth" USING btree ("trading_date","source");--> statement-breakpoint
CREATE INDEX "market_breadth_date_idx" ON "market_breadth" USING btree ("trading_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "market_indices_symbol_unique" ON "market_indices" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "market_indices_exchange_idx" ON "market_indices" USING btree ("exchange_code");--> statement-breakpoint
CREATE UNIQUE INDEX "market_quotes_dedupe_unique" ON "market_quotes" USING btree ("stock_id","trading_date","observed_at","source");--> statement-breakpoint
CREATE INDEX "market_quotes_stock_observed_idx" ON "market_quotes" USING btree ("stock_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "market_quotes_trading_date_idx" ON "market_quotes" USING btree ("trading_date");--> statement-breakpoint
CREATE INDEX "market_quotes_symbol_idx" ON "market_quotes" USING btree ("symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_items_unique" ON "watchlist_items" USING btree ("watchlist_id","stock_id");--> statement-breakpoint
CREATE INDEX "watchlist_items_watchlist_idx" ON "watchlist_items" USING btree ("watchlist_id","position");--> statement-breakpoint
CREATE INDEX "watchlist_items_symbol_idx" ON "watchlist_items" USING btree ("symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlists_name_lower_unique" ON "watchlists" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "ai_infrastructure_symbol_unique" ON "ai_infrastructure_companies" USING btree ("symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_infrastructure_stock_unique" ON "ai_infrastructure_companies" USING btree ("stock_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_fundamentals_unique" ON "company_fundamentals" USING btree ("stock_id","period_type","period_end","source");--> statement-breakpoint
CREATE INDEX "company_fundamentals_stock_period_idx" ON "company_fundamentals" USING btree ("stock_id","period_end" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "company_fundamentals_symbol_idx" ON "company_fundamentals" USING btree ("symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_scores_unique" ON "entry_scores" USING btree ("stock_id","as_of_date","methodology_version");--> statement-breakpoint
CREATE INDEX "entry_scores_symbol_date_idx" ON "entry_scores" USING btree ("symbol","as_of_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entry_scores_score_idx" ON "entry_scores" USING btree ("score");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_scores_unique" ON "investment_scores" USING btree ("stock_id","as_of_date","methodology_version");--> statement-breakpoint
CREATE INDEX "investment_scores_symbol_date_idx" ON "investment_scores" USING btree ("symbol","as_of_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "investment_scores_score_idx" ON "investment_scores" USING btree ("score");--> statement-breakpoint
CREATE UNIQUE INDEX "technical_indicators_unique" ON "technical_indicators" USING btree ("stock_id","as_of_date","version");--> statement-breakpoint
CREATE INDEX "technical_indicators_symbol_date_idx" ON "technical_indicators" USING btree ("symbol","as_of_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_accounts_name_unique" ON "portfolio_accounts" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_holdings_unique" ON "portfolio_holdings" USING btree ("account_id","stock_id");--> statement-breakpoint
CREATE INDEX "portfolio_holdings_account_idx" ON "portfolio_holdings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "portfolio_transactions_account_idx" ON "portfolio_transactions" USING btree ("account_id","traded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "portfolio_transactions_symbol_idx" ON "portfolio_transactions" USING btree ("symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_dedupe_unique" ON "alert_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "alert_events_alert_idx" ON "alert_events" USING btree ("alert_id","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alerts_symbol_idx" ON "alerts" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "alerts_enabled_idx" ON "alerts" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "news_articles_url_unique" ON "news_articles" USING btree ("url");--> statement-breakpoint
CREATE INDEX "news_articles_published_idx" ON "news_articles" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "news_articles_source_idx" ON "news_articles" USING btree ("source_name");--> statement-breakpoint
CREATE INDEX "data_refresh_logs_job_started_idx" ON "data_refresh_logs" USING btree ("job_name","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_refresh_logs_status_idx" ON "data_refresh_logs" USING btree ("status");