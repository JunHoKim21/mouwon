declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

let initialized = false;

function getValidMeasurementId(): string | null {
  const raw = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!GA_MEASUREMENT_ID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function isAnalyticsAllowedInCurrentEnv(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const hostname = window.location.hostname;
  if (LOCAL_HOSTNAMES.has(hostname) && import.meta.env.VITE_GA_ENABLE_DEV !== 'true') {
    return false;
  }
  return true;
}

export function initAnalytics(): void {
  if (initialized) {
    return;
  }
  if (!isAnalyticsAllowedInCurrentEnv()) {
    return;
  }
  const measurementId = getValidMeasurementId();
  if (!measurementId) {
    return;
  }

  const scriptSrc = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  if (document.querySelector(`script[src="${scriptSrc}"]`)) {
    initialized = true;
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = scriptSrc;
  document.head.appendChild(script);

  initialized = true;
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
): void {
  if (!initialized || typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return;
  }
  try {
    if (params) {
      window.gtag('event', eventName, params);
    } else {
      window.gtag('event', eventName);
    }
  } catch {
    // 분석 도구 호출 실패가 사용자 인터랙션에 영향을 주지 않도록 무시
  }
}
