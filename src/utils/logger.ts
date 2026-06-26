export class Logger {
  static debug(message: string, context?: any) {
    if (process.env.NODE_ENV !== 'production' || process.env.LOG_LEVEL === 'debug') {
      console.log(`[DEBUG] ${message}`, context ? { context } : '');
    }
  }

  static info(message: string, context?: any) {
    console.info(message, context);
  }

  static warn(message: string, context?: any) {
    console.warn(message, context);
  }

  static error(message: string, context?: any) {
    console.error(message, context);
  }
}
