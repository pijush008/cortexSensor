"use client";

import { useState } from "react";
import {
  Server,
  Wifi,
  Radio,
  Cloud,
  Cpu,
  Battery,
  Signal,
  Activity,
  HardDrive,
  RefreshCw,
  Plus,
  Search,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Reveal } from "@/components/ui/reveal";
import { Select } from "@/components/ui/select";
import { SectionLabel } from "@/components/ui/section-label";
import { Modal } from "@/components/ui/modal";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/layout/page-header";

interface Gateway {
  id: string;
  name: string;
  location: string;
  status: "online" | "offline" | "degraded";
  esp32Count: number;
  esp32Online: number;
  sensorCount: number;
  battery: number;
  signal: number;
  received: number;
  processed: number;
  uploaded: number;
  buffered: number;
  lastUpload: string;
  mqtt: boolean;
  cloud: boolean;
  internet: boolean;
  firmware: string;
  temperature: number;
  uptime: string;
}

const GATEWAYS: Gateway[] = [
  {
    id: "GW-ABC-00001",
    name: "Bridge 001 Gateway",
    location: "Flyover Bridge, Delhi",
    status: "online",
    esp32Count: 4,
    esp32Online: 4,
    sensorCount: 18,
    battery: 92,
    signal: 85,
    received: 12542,
    processed: 12542,
    uploaded: 12530,
    buffered: 12,
    lastUpload: "2 sec ago",
    mqtt: true,
    cloud: true,
    internet: true,
    firmware: "1.2.0",
    temperature: 42.5,
    uptime: "45 days",
  },
  {
    id: "GW-ABC-00002",
    name: "Struct B Gateway",
    location: "Metro Bridge, Mumbai",
    status: "online",
    esp32Count: 3,
    esp32Online: 3,
    sensorCount: 12,
    battery: 88,
    signal: 78,
    received: 10420,
    processed: 10420,
    uploaded: 10420,
    buffered: 0,
    lastUpload: "5 sec ago",
    mqtt: true,
    cloud: true,
    internet: true,
    firmware: "1.2.0",
    temperature: 40.1,
    uptime: "67 days",
  },
  {
    id: "GW-ABC-00003",
    name: "Room C Gateway",
    location: "Building 3, Bangalore",
    status: "degraded",
    esp32Count: 2,
    esp32Online: 1,
    sensorCount: 8,
    battery: 45,
    signal: 52,
    received: 6720,
    processed: 6710,
    uploaded: 6300,
    buffered: 410,
    lastUpload: "42 sec ago",
    mqtt: true,
    cloud: false,
    internet: true,
    firmware: "1.1.8",
    temperature: 48.7,
    uptime: "12 days",
  },
  {
    id: "GW-ABC-00004",
    name: "Struct D Gateway",
    location: "Dam Wall, Uttarakhand",
    status: "offline",
    esp32Count: 5,
    esp32Online: 0,
    sensorCount: 20,
    battery: 0,
    signal: 0,
    received: 21900,
    processed: 21900,
    uploaded: 21500,
    buffered: 400,
    lastUpload: "3 hours ago",
    mqtt: false,
    cloud: false,
    internet: false,
    firmware: "1.2.0",
    temperature: 0,
    uptime: "0",
  },
  {
    id: "GW-ABC-00005",
    name: "Struct E Gateway",
    location: "Tunnel, Jaipur",
    status: "online",
    esp32Count: 3,
    esp32Online: 3,
    sensorCount: 15,
    battery: 96,
    signal: 90,
    received: 15600,
    processed: 15600,
    uploaded: 15600,
    buffered: 0,
    lastUpload: "1 sec ago",
    mqtt: true,
    cloud: true,
    internet: true,
    firmware: "1.2.1",
    temperature: 38.2,
    uptime: "89 days",
  },
];

const STATUS_TONE: Record<string, StatusTone> = {
  online: "green",
  degraded: "yellow",
  offline: "red",
};

export default function GatewaysPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = GATEWAYS.filter((g) => {
    const matchesSearch =
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.id.toLowerCase().includes(search.toLowerCase()) ||
      g.location.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || g.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const online = GATEWAYS.filter((g) => g.status === "online").length;
  const degraded = GATEWAYS.filter((g) => g.status === "degraded").length;
  const offline = GATEWAYS.filter((g) => g.status === "offline").length;
  const onlineSensors = GATEWAYS.reduce(
    (sum, g) => sum + g.esp32Online,
    0
  );

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edge Gateways"
        subtitle="Monitor gateway health, device connectivity, and data pipeline status across all structures."
        actions={
          <>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4" /> Register Gateway
            </Button>
          </>
        }
      />

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total gateways"
          value={GATEWAYS.length}
          icon={Server}
          accent="navy"
          delta="Fleet-wide"
          className="anim-fade-up"
        />
        <StatCard
          title="Online"
          value={online}
          icon={Activity}
          accent="green"
          delta={`${Math.round((online / GATEWAYS.length) * 100)}% uptime`}
          className="anim-fade-up [animation-delay:80ms]"
        />
        <StatCard
          title="Degraded / offline"
          value={degraded + offline}
          icon={Radio}
          accent="yellow"
          delta={degraded + offline > 0 ? "Needs attention" : "All clear"}
          className="anim-fade-up [animation-delay:160ms]"
        />
        <StatCard
          title="ESP32 nodes"
          value={`${onlineSensors}/${GATEWAYS.reduce((s, g) => s + g.esp32Count, 0)}`}
          icon={Cpu}
          accent="blue"
          delta="online"
          className="anim-fade-up [animation-delay:240ms]"
        />
      </div>

      {/* Gateway Cards */}
      <Reveal>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <SectionLabel index="09" label="Fleet inventory" className="mb-2" />
                <CardTitle>Gateway Fleet</CardTitle>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search gateways..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 sm:w-64"
                  />
                </div>
                <div className="w-full sm:w-40">
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                      { value: "all", label: "All statuses" },
                      { value: "online", label: "Online" },
                      { value: "degraded", label: "Degraded" },
                      { value: "offline", label: "Offline" },
                    ]}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map((g) => (
                <Card
                  key={g.id}
                  className="overflow-hidden border-slate-200 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-20px_rgba(17,17,17,0.3)]"
                >
                  <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-shm-navy-600" strokeWidth={1.75} />
                          <h3 className="font-semibold text-slate-900">{g.name}</h3>
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">{g.id}</p>
                        <p className="mb-2 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3 text-slate-400" /> {g.location}
                        </p>
                      </div>
                      <StatusBadge
                        label={g.status}
                        tone={STATUS_TONE[g.status] ?? "slate"}
                      />
                    </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      FW v{g.firmware}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      Uptime: {g.uptime}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {g.temperature > 0 ? `${g.temperature.toFixed(1)}°C` : "N/A"}
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  {/* Connectivity */}
                  <div className="mb-3 flex gap-3">
                    <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${g.internet ? "bg-green-50 text-shm-green" : "bg-red-50 text-shm-red"}`}>
                      <Wifi className="h-3.5 w-3.5" /> Internet
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${g.mqtt ? "bg-green-50 text-shm-green" : "bg-red-50 text-shm-red"}`}>
                      <Radio className="h-3.5 w-3.5" /> MQTT
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${g.cloud ? "bg-green-50 text-shm-green" : "bg-red-50 text-shm-red"}`}>
                      <Cloud className="h-3.5 w-3.5" /> Cloud
                    </div>
                  </div>

                  {/* ESP32 Nodes */}
                  <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">ESP32 Nodes</span>
                      <span className="text-xs text-slate-400">
                        {g.esp32Online}/{g.esp32Count} online
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: g.esp32Count }).map((_, i) => {
                        const onlineNode = i < g.esp32Online;
                        return (
                          <span
                            key={i}
                            className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] ${
                              onlineNode
                                ? "bg-green-50 text-shm-green"
                                : "bg-red-50 text-shm-red"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${onlineNode ? "bg-shm-green" : "bg-shm-red"}`} />
                            ESP32-{String(i + 1).padStart(3, "0")}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Data Pipeline */}
                  <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Data Pipeline</span>
                      <span className="text-xs text-slate-400">Last upload: {g.lastUpload}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                      <div className="rounded-md bg-white p-2">
                        <p className="text-[10px] text-slate-400">Received</p>
                        <p className="text-sm font-bold text-slate-800">{g.received.toLocaleString()}</p>
                      </div>
                      <div className="rounded-md bg-white p-2">
                        <p className="text-[10px] text-slate-400">Processed</p>
                        <p className="text-sm font-bold text-slate-800">{g.processed.toLocaleString()}</p>
                      </div>
                      <div className="rounded-md bg-white p-2">
                        <p className="text-[10px] text-slate-400">Uploaded</p>
                        <p className="text-sm font-bold text-shm-green">{g.uploaded.toLocaleString()}</p>
                      </div>
                      <div className="rounded-md bg-white p-2">
                        <p className="text-[10px] text-slate-400">Buffered</p>
                        <p className={`text-sm font-bold ${g.buffered > 0 ? "text-amber-600" : "text-slate-800"}`}>
                          {g.buffered}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Battery + Signal */}
                  <div className="flex items-center gap-4">
                    <div className="flex flex-1 items-center gap-2">
                      <Battery className="h-4 w-4 text-slate-400" />
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`anim-rise h-full rounded-full ${
                            g.battery > 70 ? "bg-shm-green" : g.battery > 30 ? "bg-shm-yellow" : "bg-shm-red"
                          }`}
                          style={{ width: `${g.battery}%`, animationDelay: "300ms" }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs font-medium text-slate-500">
                        {g.battery > 0 ? `${g.battery}%` : "N/A"}
                      </span>
                    </div>
                    <div className="flex flex-1 items-center gap-2">
                      <Signal className="h-4 w-4 text-slate-400" />
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`anim-rise h-full rounded-full ${
                            g.signal > 70 ? "bg-shm-green" : g.signal > 30 ? "bg-shm-yellow" : "bg-shm-red"
                          }`}
                          style={{ width: `${g.signal}%`, animationDelay: "360ms" }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs font-medium text-slate-500">
                        {g.signal > 0 ? `${g.signal}%` : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
      </Reveal>

      {/* Register Gateway Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Register New Gateway"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setShowModal(false);
          }}
        >
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            <p className="mb-1 flex items-center gap-1 font-medium">
              <HardDrive className="h-4 w-4" />
              Gateway Provisioning Process
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-blue-600">
              <li>Gateway device identity is created</li>
              <li>Secure credential is provisioned</li>
              <li>Gateway connects to MQTT broker</li>
              <li>Cloud verifies identity and authorizes</li>
              <li>Gateway assigned to tenant + structure</li>
            </ol>
          </div>
          <Input label="Gateway ID" placeholder="e.g. GW-ABC-00006" required />
          <Input label="Gateway Name" placeholder="e.g. Bridge 002 Gateway" required />
          <Input label="Location" placeholder="e.g. Flyover Bridge, Delhi" required />
          <Input label="Firmware Version" placeholder="e.g. 1.2.0" />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Provision Gateway</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}