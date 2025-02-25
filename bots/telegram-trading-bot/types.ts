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
}