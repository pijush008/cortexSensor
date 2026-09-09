import { Server } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PendingCapability } from "@/components/ui/pending-capability";

export const metadata = { title: "Gateways" };

/**
 * Edge gateway fleet.
 *
 * This page previously rendered a hardcoded gateway list with invented
 * connectivity, battery, CPU and buffered-packet counts, plus a "Register
 * Gateway" dialog that submitted nowhere.
 *
 * The underlying reason is structural, not cosmetic: there is no Gateway
 * entity in the schema. A gateway exists today only as a `gatewayDeviceId`
 * string column on `Device`, so there is nowhere to record gateway health,
 * buffering state, firmware version or last-sync time. That is exactly the
 * data this screen is supposed to show, which is why it had to be invented.
 */
export default function GatewaysPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Field Infrastructure"
        title="Gateways"
        subtitle="Edge gateway fleet status, connectivity, and store-and-forward buffer health."
      />

      <PendingCapability
        icon={Server}
        summary="Registered edge gateways with connectivity state, firmware version, buffered-packet depth, last successful sync, and the devices reporting through each one."
        requires={[
          "Gateway (currently a string column on Device)",
          "Gateway heartbeat + health telemetry",
          "Store-and-forward buffer reporting",
          "Device lifecycle states",
          "Per-gateway provisioning credentials",
        ]}
        plannedIn="Gateway becomes a first-class entity alongside the device and sensor model."
      />
    </div>
  );
}
