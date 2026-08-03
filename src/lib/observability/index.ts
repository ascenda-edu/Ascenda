/**
 * Observability surface. Import from `@/lib/observability`, not from the
 * individual modules, so a provider can be swapped in behind this barrel
 * without touching call sites.
 */
export {
  logger,
  setLogSink,
  resetLogSink,
  hasProviderSink,
  type Logger,
  type LogContext,
  type LogEntry,
  type LogLevel,
  type LogRuntime,
  type LogSink,
  type SerializedError
} from './logger';
