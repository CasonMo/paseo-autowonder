import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { callToolRpc } from "../shared/contracts";
import { asNumber, asString, listItems } from "./lib";

export function useWorkspaceNameMaps(workspaceId: number) {
  const call = useRpc(callToolRpc);
  const agentsQuery = useQuery({
    queryKey: ["aw", workspaceId, "workspace-agents"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_agents",
        arguments: { workspaceId, size: 100 },
      });
      if (response.isError) throw new Error(response.contentText ?? "数字员工加载失败");
      return response.data;
    },
    retry: 1,
  });
  const squadsQuery = useQuery({
    queryKey: ["aw", workspaceId, "workspace-squads"],
    queryFn: async () => {
      const response = await call({
        name: "autowonder.list_squads",
        arguments: { workspaceId, size: 100 },
      });
      if (response.isError) throw new Error(response.contentText ?? "小队加载失败");
      return response.data;
    },
    retry: 1,
  });

  return useMemo(() => {
    const agentNames = new Map<number, string>();
    const squadNames = new Map<number, string>();
    for (const agent of listItems(agentsQuery.data, "items")) {
      const id = asNumber(agent.id);
      if (id !== undefined) agentNames.set(id, asString(agent.name));
    }
    for (const squad of listItems(squadsQuery.data, "items")) {
      const id = asNumber(squad.id);
      if (id !== undefined) squadNames.set(id, asString(squad.name));
    }
    return { agentNames, squadNames };
  }, [agentsQuery.data, squadsQuery.data]);
}
