// Structured Logger for CloudWatch Integration
// Provides JSON-formatted logs with searchable fields for efficient log analysis
// Optimized for disk and CPU usage with minimal overhead

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export enum EventType {
  // Stream events
  STREAM_CONNECTED = 'STREAM_CONNECTED',
  STREAM_DISCONNECTED = 'STREAM_DISCONNECTED',
  STREAM_ERROR = 'STREAM_ERROR',
  STREAM_RECONNECT = 'STREAM_RECONNECT',

  // Token events
  TOKEN_CREATED = 'TOKEN_CREATED',
  TOKEN_CREATION_ERROR = 'TOKEN_CREATION_ERROR',

  // Swap events
  SWAP_PROCESSED = 'SWAP_PROCESSED',
  SWAP_FILTERED = 'SWAP_FILTERED',
  SWAP_ERROR = 'SWAP_ERROR',

  // Migration events
  MIGRATION_PROCESSED = 'MIGRATION_PROCESSED',
  MIGRATION_ERROR = 'MIGRATION_ERROR',

  // System events
  SERVICE_STARTED = 'SERVICE_STARTED',
  SERVICE_STOPPED = 'SERVICE_STOPPED',
  STATS_REPORT = 'STATS_REPORT',
}

interface BaseLogFields {
  timestamp: string;
  level: LogLevel;
  event: EventType;
  component: string;
  message: string;
}

interface TokenLogFields {
  tokenAddress?: string;
  symbol?: string;
  name?: string;
}

interface PoolLogFields {
  poolAddress?: string;
  poolType?: 'DBC' | 'DAMM_V2';
}

interface SwapLogFields extends TokenLogFields, PoolLogFields {
  swapType?: 'BUY' | 'SELL';
  amount?: number;
  price?: number;
  quoteToken?: 'SOL' | 'USDC';
  txSignature?: string;
}

interface MigrationLogFields extends TokenLogFields, PoolLogFields {
  dammV2PoolAddress?: string;
  txSignature?: string;
}

interface ErrorLogFields {
  error?: string;
  errorStack?: string;
}

type LogFields = BaseLogFields &
  Partial<TokenLogFields> &
  Partial<PoolLogFields> &
  Partial<SwapLogFields> &
  Partial<MigrationLogFields> &
  Partial<ErrorLogFields> &
  Record<string, any>;

/**
 * Structured Logger
 *
 * Features:
 * - JSON output for CloudWatch Logs Insights queries
 * - Searchable fields: tokenAddress, poolAddress, txSignature
 * - Minimal CPU overhead (no string formatting)
 * - Minimal disk usage (one line per event)
 *
 * CloudWatch Queries:
 * - By token: fields @timestamp, event, message | filter tokenAddress = "ABC..."
 * - By pool: fields @timestamp, event, message | filter poolAddress = "XYZ..."
 * - By event type: fields @timestamp, message | filter event = "SWAP_PROCESSED"
 */
export class StructuredLogger {
  constructor(private component: string) {}

  /**
   * Log info message with structured fields
   */
  info(event: EventType, message: string, fields?: Partial<LogFields>): void {
    this.log(LogLevel.INFO, event, message, fields);
  }

  /**
   * Log warning message with structured fields
   */
  warn(event: EventType, message: string, fields?: Partial<LogFields>): void {
    this.log(LogLevel.WARN, event, message, fields);
  }

  /**
   * Log error message with structured fields and error details
   */
  error(event: EventType, message: string, error?: any, fields?: Partial<LogFields>): void {
    const errorFields: Partial<ErrorLogFields> = {};

    if (error) {
      if (error instanceof Error) {
        errorFields.error = error.message;
        if (error.stack) {
          errorFields.errorStack = error.stack;
        }
      } else if (typeof error === 'object' && error !== null) {
        // Handle Supabase errors and other object errors
        // Try common error properties first
        errorFields.error = error.message || error.error || error.details || error.hint || JSON.stringify(error);
        if (error.code) {
          errorFields.error = `[${error.code}] ${errorFields.error}`;
        }
      } else {
        errorFields.error = String(error);
      }
    }

    this.log(LogLevel.ERROR, event, message, { ...fields, ...errorFields });
  }

  /**
   * Core logging method - outputs single-line JSON
   */
  private log(level: LogLevel, event: EventType, message: string, fields?: Partial<LogFields>): void {
    const logEntry: LogFields = {
      timestamp: new Date().toISOString(),
      level,
      event,
      component: this.component,
      message,
      ...fields,
    };

    // Output as single-line JSON for CloudWatch
    // CloudWatch Logs Insights can parse JSON automatically
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Log token creation event
   */
  tokenCreated(tokenAddress: string, symbol: string, name: string, poolAddress?: string): void {
    this.info(EventType.TOKEN_CREATED, `Token created: ${symbol}`, {
      tokenAddress,
      symbol,
      name,
      poolAddress,
    });
  }

  /**
   * Log swap processed event
   */
  swapProcessed(
    swapType: 'BUY' | 'SELL',
    tokenAddress: string,
    amount: number,
    price: number,
    quoteToken: 'SOL' | 'USDC',
    poolAddress: string,
    poolType: 'DBC' | 'DAMM_V2',
    txSignature?: string
  ): void {
    this.info(EventType.SWAP_PROCESSED, `${swapType} ${amount.toFixed(2)} @ $${price.toFixed(8)} ${quoteToken}`, {
      swapType,
      tokenAddress,
      amount,
      price,
      quoteToken,
      poolAddress,
      poolType,
      txSignature,
    });
  }

  /**
   * Log migration processed event
   */
  migrationProcessed(tokenAddress: string, symbol: string, dammV2PoolAddress: string, txSignature?: string): void {
    this.info(EventType.MIGRATION_PROCESSED, `Token migrated: ${symbol}`, {
      tokenAddress,
      symbol,
      dammV2PoolAddress,
      poolType: 'DAMM_V2',
      txSignature,
    });
  }

  /**
   * Log stream connection event
   */
  streamConnected(streamName: string, programId?: string, discriminator?: string): void {
    this.info(EventType.STREAM_CONNECTED, `${streamName} connected`, {
      streamName,
      programId,
      discriminator,
    });
  }

  /**
   * Log stream disconnection event
   */
  streamDisconnected(streamName: string): void {
    this.warn(EventType.STREAM_DISCONNECTED, `${streamName} disconnected`, {
      streamName,
    });
  }

  /**
   * Log stream error event
   */
  streamError(streamName: string, error: any): void {
    this.error(EventType.STREAM_ERROR, `${streamName} error`, error, {
      streamName,
    });
  }

  /**
   * Log stream reconnect event
   */
  streamReconnect(streamName: string): void {
    this.warn(EventType.STREAM_RECONNECT, `${streamName} reconnecting`, {
      streamName,
    });
  }

  /**
   * Log service started event
   */
  serviceStarted(network: string, config?: Record<string, any>): void {
    this.info(EventType.SERVICE_STARTED, `Service started on ${network}`, {
      network,
      ...config,
    });
  }

  /**
   * Log service stopped event
   */
  serviceStopped(): void {
    this.info(EventType.SERVICE_STOPPED, 'Service stopped');
  }

  /**
   * Log stats report (periodic summary)
   */
  statsReport(stats: Record<string, any>): void {
    this.info(EventType.STATS_REPORT, 'Stats report', stats);
  }
}

/**
 * Create a logger instance for a component
 */
export function createLogger(component: string): StructuredLogger {
  return new StructuredLogger(component);
}
