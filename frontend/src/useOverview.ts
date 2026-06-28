import { useState, useEffect, useRef, useCallback } from 'react';
import type { Overview } from './types';
import { sampleOverview } from './sample';

const IS_DEV = import.meta.env.DEV;

type UseOverviewResult = {
  data: Overview | null;
  stale: boolean;
  lastUpdated: Date | null;
};

export function useOverview(defaultRefreshMs = 5000): UseOverviewResult {
  const [data, setData] = useState<Overview | null>(null);
  const [stale, setStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshMsRef = useRef(defaultRefreshMs);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/overview');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: Overview = await res.json();
      setData(json);
      setStale(false);
      setLastUpdated(new Date());
      // Update polling interval from server hint
      refreshMsRef.current = (json.refresh_seconds ?? 5) * 1000;
    } catch {
      if (IS_DEV && data === null) {
        // First load in dev with no backend — fall back to sample data
        setData(sampleOverview);
        setStale(true);
        setLastUpdated(new Date());
      } else {
        // Keep last-good data, mark stale
        setStale(true);
      }
    } finally {
      // Schedule next poll
      timerRef.current = setTimeout(fetchOverview, refreshMsRef.current);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchOverview();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchOverview]);

  return { data, stale, lastUpdated };
}
