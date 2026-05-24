/**
 * Conditional Logger
 * 
 * Logs are only output in development mode.
 * In production builds, these become no-ops for security.
 * 
 * SECURITY: Never log sensitive data like mnemonics, keys, or balances
 * even in development. Use generic messages like "Balance synced" instead
 * of "Balance synced: 50000 sats".
 */

const isDev = import.meta.env.DEV;

/**
 * Debug-level logging (development only)
 * Use for detailed operational information
 */
function debug(message: string, ...args: unknown[]): void {
  if (isDev) {
    console.log(message, ...args);
  }
}

/**
 * Info-level logging (development only)
 * Use for general operational information
 */
function info(message: string, ...args: unknown[]): void {
  if (isDev) {
    console.info(message, ...args);
  }
}

/**
 * Warning-level logging (development only)
 * Use for potentially problematic situations
 */
function warn(message: string, ...args: unknown[]): void {
  if (isDev) {
    console.warn(message, ...args);
  }
}

/**
 * Error-level logging (always enabled)
 * Use for error conditions - these are always logged
 * but should never contain sensitive data
 */
function error(message: string, ...args: unknown[]): void {
  // Errors are always logged, but sanitize sensitive data
  console.error(message, ...args);
}

/**
 * Logger object for namespaced usage
 */
export const logger = {
  debug,
  info,
  warn,
  error,
};

