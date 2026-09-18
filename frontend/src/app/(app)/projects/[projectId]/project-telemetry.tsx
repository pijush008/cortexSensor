"use client";

import { GatewayHealthCard, NodesSection } from "@/components/gateway-telemetry";
import { useGatewayTelemetry } from "@/hooks/use-gateway-telemetry";

/**
 * The project's sensor data: what its gateway's nodes are reporting now.
 * The same panels as the gateway page, mounted where the person who created
 * the project looks for its readings.
 */
export function ProjectTelemetry({ gatewayId }: { gatewayId: number }) {
  const telemetry = useGatewayTelemetry(gatewayId);
  return (
    <>
      <GatewayHealthCard telemetry={telemetry} />
      <NodesSection telemetry={telemetry} />
    </>
  );
}
