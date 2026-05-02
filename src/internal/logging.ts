export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface PrefixedLogger extends Logger {
  pluginName: string;
}

export const createPrefixedLogger = (
  logger: Logger,
  pluginName: string,
  usePrefix: boolean = true,
): PrefixedLogger => {
  const prefix = usePrefix ? `[${pluginName}] ` : '';
  const prefixed = (message: string) => `${prefix}${message}`;
  return {
    pluginName,
    info: (message: string) => logger.info(prefixed(message)),
    warn: (message: string) => logger.warn(prefixed(message)),
    error: (message: string) => logger.error(prefixed(message)),
  };
};
