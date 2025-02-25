export interface TelegramChannel {
    username: string;
    description: string;
}

export enum StorageType {
    SQLITE = 'sqlite',
    JSON = 'json'
}

export interface Message {
    id: number;
    date: number;
    message: string;
    channelName: string;
    processed: boolean;
}

export interface AIConfig {
    openrouter_api_key: string;
    initial_model: string;  // Free/cheaper model for initial analysis
    detailed_model?: string; // Optional more powerful model for detailed analysis
    base_url: string;
    temperature: number;
}

export interface RugCheckConfig {
    verbose_log: boolean;
    simulation_mode: boolean;
    allow_mint_authority: boolean;
    allow_not_initialized: boolean;
    allow_freeze_authority: boolean;
    allow_rugged: boolean;
    allow_mutable: boolean;
    block_returning_token_names: boolean;
    block_returning_token_creators: boolean;
    block_symbols: string[];
    block_names: string[];
    allow_insider_topholders: boolean;
    max_alowed_pct_topholders: number;
    exclude_lp_from_topholders: boolean;
    min_total_markets: number;
    min_total_lp_providers: number;
    min_total_market_Liquidity: number;
    ignore_pump_fun: boolean;
    max_score: number;
    legacy_not_allowed: string[];
}

export interface TelegramConfig {
    environment: string;
    name: string;
    base_url: string;
    messages_db_path: string;
    storage_type: StorageType;
    check_interval: number;
    max_messages_per_channel: number;
    request_timeout: number;
    max_retries: number;
    retry_delay: number;
    rate_limit_delay: number;
    log_level: string;
    channels: TelegramChannel[];
    ai_config: AIConfig;
    rug_check: RugCheckConfig;
}