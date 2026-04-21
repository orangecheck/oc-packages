/**
 * Simple logger for SDK
 * Can be disabled in production builds
 */

/**
 * Log level type
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

/**
 * Logger context type
 */
export type LogContext = Record<string, unknown>;

/**
 * Logger interface
 */
export interface Logger {
    debug: (contextOrMessage: string | LogContext, message?: string) => void;
    info: (contextOrMessage: string | LogContext, message?: string) => void;
    warn: (contextOrMessage: string | LogContext, message?: string) => void;
    error: (contextOrMessage: string | LogContext, message?: string) => void;
}

let logLevel: LogLevel = 'none';

/**
 * Set the global log level
 * @param level - Log level to set
 */
export function setLogLevel(level: LogLevel): void {
    logLevel = level;
}

/**
 * Get the current log level
 * @returns Current log level
 */
export function getLogLevel(): LogLevel {
    return logLevel;
}

/**
 * Create a namespaced logger
 * @param namespace - Logger namespace
 * @returns Logger instance
 */
export function createLogger(namespace: string): Logger {
    const shouldLog = (level: Exclude<LogLevel, 'none'>): boolean => {
        if (logLevel === 'none') return false;

        const levels: Exclude<LogLevel, 'none'>[] = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(logLevel as Exclude<LogLevel, 'none'>);
        const messageLevelIndex = levels.indexOf(level);

        return messageLevelIndex >= currentLevelIndex;
    };

    const formatMessage = (msg: string): string => `[${namespace}] ${msg}`;

    return {
        debug: (contextOrMessage: string | LogContext, message?: string): void => {
            if (shouldLog('debug')) {
                if (typeof contextOrMessage === 'string') {
                    console.debug(formatMessage(contextOrMessage));
                } else {
                    console.debug(formatMessage(message ?? 'Debug'), contextOrMessage);
                }
            }
        },
        info: (contextOrMessage: string | LogContext, message?: string): void => {
            if (shouldLog('info')) {
                if (typeof contextOrMessage === 'string') {
                    console.info(formatMessage(contextOrMessage));
                } else {
                    console.info(formatMessage(message ?? 'Info'), contextOrMessage);
                }
            }
        },
        warn: (contextOrMessage: string | LogContext, message?: string): void => {
            if (shouldLog('warn')) {
                if (typeof contextOrMessage === 'string') {
                    console.warn(formatMessage(contextOrMessage));
                } else {
                    console.warn(formatMessage(message ?? 'Warning'), contextOrMessage);
                }
            }
        },
        error: (contextOrMessage: string | LogContext, message?: string): void => {
            if (shouldLog('error')) {
                if (typeof contextOrMessage === 'string') {
                    console.error(formatMessage(contextOrMessage));
                } else {
                    console.error(formatMessage(message ?? 'Error'), contextOrMessage);
                }
            }
        },
    };
}

/**
 * Log verification error
 * @param protocol - Identity protocol
 * @param identifier - Identity identifier
 * @param error - Error object
 * @param context - Additional context
 */
export function logVerificationError(
    protocol: string,
    identifier: string,
    error: Error,
    context?: LogContext
): void {
    const logger = createLogger('identity-verification');
    logger.error(
        {
            protocol,
            identifier,
            error: error.message,
            stack: error.stack,
            ...context,
        },
        'Verification failed'
    );
}
