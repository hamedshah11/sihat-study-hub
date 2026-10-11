import { onlineManager, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // TanStack Query assumes it's online until an online/offline event. A cold
  // start with no signal should pause server reads from the first render.
  if (typeof navigator !== "undefined" && typeof window !== "undefined") {
    onlineManager.setOnline(navigator.onLine);
  }
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
