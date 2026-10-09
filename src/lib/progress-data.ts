import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProgressSnapshot, type ProgressPayload } from "@/lib/progress.functions";

export const PROGRESS_QUERY_KEY = ["progress-snapshot"] as const;

export function useProgress() {
  const load = useServerFn(getProgressSnapshot);
  return useQuery<ProgressPayload>({
    queryKey: PROGRESS_QUERY_KEY,
    queryFn: () => load(),
    staleTime: 30_000,
  });
}

/** Refresh every screen that reads progress after a review or quiz. */
export function invalidateProgress(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY }),
    qc.invalidateQueries({ queryKey: ["mistakes"] }),
  ]);
}
