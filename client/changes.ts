import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { changesRpc } from "../shared/contracts";

export const changesQueryKey = ["aw", "changes"] as const;

export function useChanges() {
  const fetchChanges = useRpc(changesRpc);
  return useQuery({
    queryKey: changesQueryKey,
    queryFn: () => fetchChanges({}),
    refetchInterval: 5000,
    staleTime: 4000,
    retry: 1,
  });
}
