import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ErrorBoundary } from "./components/error-boundary";

export interface RouteProps {
  params?: Record<string, string>;
  navigate: (to: string) => void;
  replace: (to: string) => void;
}

export interface Route {
  path: string;
  component: React.ComponentType<RouteProps>;
}

export interface RouterContext {
  pathname: string;
  navigate: (to: string) => void;
  replace: (to: string) => void;
}

/* Shared navigation store: every useRouter()/Link() consumer subscribes to the
   same pathname so pushState actually re-renders the active route. */
type Listener = () => void;

const listeners = new Set<Listener>();

function getSnapshot(): string {
  return window.location.pathname;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of [...listeners]) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", emit);
}

export function navigateTo(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace) {
    window.history.replaceState(null, "", to);
  } else {
    window.history.pushState(null, "", to);
  }
  emit();
}

export function useRouter(): RouterContext {
  const pathname = useSyncExternalStore(subscribe, getSnapshot);
  const navigate = useCallback((to: string) => navigateTo(to), []);
  const replace = useCallback((to: string) => navigateTo(to, { replace: true }), []);
  return { pathname, navigate, replace };
}

export function createRouter(routes: Route[]) {
  function match(pathname: string) {
    for (const route of routes) {
      if (route.path === pathname) return { route, params: {} };
      const segments = route.path.split("/").filter(Boolean);
      const parts = pathname.split("/").filter(Boolean);
      if (segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].startsWith(":")) {
          const raw = parts[i];
          try {
            params[segments[i].slice(1)] = decodeURIComponent(raw);
          } catch {
            params[segments[i].slice(1)] = raw;
          }
        } else if (segments[i] !== parts[i]) {
          matched = false;
          break;
        }
      }
      if (matched) return { route, params };
    }
    return { route: routes[0], params: {} };
  }

  return function Router(): React.ReactElement {
    const { pathname, navigate, replace } = useRouter();
    const { route, params } = match(pathname);

    // Reset the scroll position when the route changes (main is the scroll container).
    useEffect(() => {
      document.querySelector("main")?.scrollTo({ top: 0 });
    }, [pathname]);

    const Component = route.component;
    return (
      <ErrorBoundary key={pathname}>
        <Component params={params} navigate={navigate} replace={replace} />
      </ErrorBoundary>
    );
  };
}

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: React.ReactNode;
}

export function Link({ to, children, className, onClick, ...rest }: LinkProps): React.ReactElement {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      {...rest}
      onClick={(event) => {
        // Respect a caller-provided handler, but still navigate unless it prevented default.
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export const REFRESH_EVENT = "marketverse:refresh";

/** Ask every mounted useFetch() consumer to re-request its data. */
export function refreshData(): void {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Default background refresh cadence for live market data (aligned with the API's market cache). */
export const LIVE_POLL_MS = 15_000;

export function useFetch<T>(
  request: () => Promise<T>,
  deps: unknown[] = [],
  immediate = true,
  pollMs?: number,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<Error | null>(null);

  // Keep the latest request closure without re-creating callbacks every render.
  const requestRef = useRef(request);
  requestRef.current = request;

  const run = useCallback((options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    setError(null);
    return requestRef.current()
      .then((value) => {
        setData(value);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!immediate) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    requestRef
      .current()
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, deps);

  // Background polling: refreshes data silently so pages do not flash a loading state.
  useEffect(() => {
    if (!immediate || !pollMs) return;
    const tick = () => {
      if (document.visibilityState === "visible") void run({ silent: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    const id = window.setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [immediate, pollMs, run]);

  useEffect(() => {
    if (!immediate) return;
    const onRefresh = () => {
      void run({ silent: true });
    };
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [immediate, run]);

  const refetch = useCallback(() => {
    void run();
  }, [run]);

  return { data, loading, error, refetch };
}
