type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const currentLevelValue = LOG_LEVELS[currentLevel];

export class Logger {
  private static formatMessage(level: LogLevel, message: string, context?: any) {
    const timestamp = new Date().toISOString();
    return JSON.stringify({
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(context ? { context } : {}),
    });
  }

  static debug(message: string, context?: any) {
    if (LOG_LEVELS.debug >= currentLevelValue) {
      console.log(this.formatMessage('debug', message, context));
    }
  }

  static info(message: string, context?: any) {
    if (LOG_LEVELS.info >= currentLevelValue) {
      console.log(this.formatMessage('info', message, context));
    }
  }

  static warn(message: string, context?: any) {
    if (LOG_LEVELS.warn >= currentLevelValue) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  static error(message: string, context?: any) {
    if (LOG_LEVELS.error >= currentLevelValue) {
      console.error(this.formatMessage('error', message, context));
    }
  }
}
