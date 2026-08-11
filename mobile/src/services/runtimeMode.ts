export type RuntimeMode = 'development' | 'test' | 'preview' | 'production';

const configurationError = () => new Error('Runtime configuration is invalid (CONFIGURATION_INVALID).');
const isDevelopmentBuild = typeof __DEV__ !== 'undefined' && __DEV__;
const requestedMode = process.env.EXPO_PUBLIC_RUNTIME_MODE?.trim();

const resolveRuntimeMode = (): RuntimeMode => {
  if (!requestedMode) {
    if (isDevelopmentBuild) return 'development';
    throw configurationError();
  }
  if (requestedMode === 'development' || requestedMode === 'test' || requestedMode === 'preview' || requestedMode === 'production') {
    return requestedMode;
  }
  throw configurationError();
};

export const mobileRuntimeMode = resolveRuntimeMode();
export const isMobileDevelopmentBuild = isDevelopmentBuild;
export const isMobileProductionLike = mobileRuntimeMode === 'preview' || mobileRuntimeMode === 'production';
export const canUseMobileMockAuth = mobileRuntimeMode === 'development' && isMobileDevelopmentBuild;
