"use client";

import { useState, useEffect, useRef } from "react";
import { Activity, Wifi, WifiOff, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import { PageHeader } from "@/components/layout/page-header";
import {
  MQTT_BROKER_URL,
  MQTT_USER,
  MQTT_PASS,
  MQTT_DEFAULT_TOPIC,
  MQTT_MESSAGE_LIMIT,
} from "@/config/mqtt";
import type { MqttClient } from "mqtt";

interface MqttMessage {
  id: number;
  topic: string;
  payload: string;
  receivedAt: Date;
}

export default function MqttPage() {
  const [connected, setConnected] = useState(false);
  const [topics, setTopics] = useState<string[]>([MQTT_DEFAULT_TOPIC]);
  const [topicInput, setTopicInput] = useState(MQTT_DEFAULT_TOPIC);
  const [messages, setMessages] = useState<MqttMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<MqttClient | null>(null);
  const msgIdRef = useRef(0);

  const subscribe = async (topicList: string[]) => {
    const mod = await import("mqtt");
    const Mqtt = mod.default ?? mod;
    if (clientRef.current) {
      try { clientRef.current.end(); } catch {}
    }
    setError(null);
    setConnected(false);

    const client = Mqtt.connect(MQTT_BROKER_URL, {
      username: MQTT_USER,
      password: MQTT_PASS,
      clientId: `web_${Date.now()}`,
      protocolVersion: 5,
    });

    client.on("connect", () => {
      setConnected(true);
      for (const t of topicList) {
        client.subscribe(t, (err: Error | null) => {
          if (err) setError(`Failed to subscribe to ${t}`);
        });
      }
    });

    client.on("error", (err: Error) => {
      setError(err.message);
      setConnected(false);
    });

    client.on("close", () => setConnected(false));

    client.on("message", (topic: string, buffer: Buffer) => {
      const payload = buffer.toString();
      setMessages((prev) => {
        const next: MqttMessage = {
          id: ++msgIdRef.current,
          topic,
          payload,
          receivedAt: new Date(),
        };
        return [next, ...prev].slice(0, MQTT_MESSAGE_LIMIT);
      });
    });

    clientRef.current = client;
  };

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        try { clientRef.current.end(); } catch {}
      }
    };
  }, []);

  const addTopic = (t: string) => {
    if (!t.trim()) return;
    const updated = [...new Set([...topics, t.trim()])];
    setTopics(updated);
    setTopicInput("");
    subscribe(updated);
  };

  const removeTopic = (t: string) => {
    const updated = topics.filter((x) => x !== t);
    setTopics(updated);
    if (updated.length === 0) {
      if (clientRef.current) {
        try { clientRef.current.end(); } catch {}
      }
      setConnected(false);
    } else {
      subscribe(updated);
    }
  };

  const toggleConnection = () => {
    if (connected) {
      if (clientRef.current) {
        try { clientRef.current.end(); } catch {}
      }
      setConnected(false);
    } else {
      subscribe(topics);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="MQTT Data"
        subtitle="Real-time sensor data streaming via MQTT WebSocket."
        actions={
          <Button onClick={toggleConnection} variant={connected ? "destructive" : "default"}>
            {connected ? (
              <><WifiOff className="h-4 w-4" /> Disconnect</>
            ) : (
              <><Wifi className="h-4 w-4" /> Connect</>
            )}
          </Button>
        }
      />

      {error && (
        <div className="anim-tick-in rounded-lg border border-shm-red/20 bg-shm-red/5 px-3.5 py-2.5 text-sm text-shm-red">
          {error}
        </div>
      )}

      <Reveal>
        <Card>
          <CardHeader>
            <SectionLabel index="14" label="Broker topics" className="mb-2" />
            <CardTitle>Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {topics.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md border border-shm-navy-100 bg-shm-navy-50 px-3 py-1 font-mono text-xs font-medium text-shm-navy-700"
                >
                  {t}
                  <button
                    onClick={() => removeTopic(t)}
                    className="rounded-full p-0.5 hover:bg-shm-navy-100"
                    aria-label={`Remove topic ${t}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <form
                className="inline-flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTopic(topicInput);
                }}
              >
                <Input
                  placeholder="Topic pattern"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  className="h-8 w-56 font-mono text-xs"
                />
                <Button type="submit" size="sm" variant="secondary">
                  <Plus className="h-3 w-3" />
                </Button>
              </form>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              {connected ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-shm-green opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-shm-green" />
                  </span>
                  <span className="font-medium text-shm-green">
                    Connected · {MQTT_BROKER_URL}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                  <span>Disconnected — ready to connect</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal delay={80}>
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-white/10 bg-shm-navy-900">
            <div className="flex items-center justify-between">
              <SectionLabel index="15" label="Stream" light />
              <CardTitle className="flex items-center gap-2 font-mono text-sm font-medium text-white">
                <Activity className="h-4 w-4 text-shm-teal" />
                Live Messages
              </CardTitle>
              <span className="font-mono text-[11px] text-shm-navy-300">
                count={messages.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="bg-shm-navy-900 p-0">
            {messages.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center">
                <Activity className="mb-2 h-8 w-8 text-shm-navy-600" strokeWidth={1.25} />
                <p className="font-mono text-xs text-shm-navy-400">
                  {connected
                    ? "waiting for telemetry…_"
                    : "connect to broker to start streaming"}
                </p>
              </div>
            ) : (
              <div className="max-h-[480px] space-y-px overflow-y-auto p-3 font-mono text-xs">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className="anim-tick-in flex gap-3 rounded-md bg-white/[0.03] px-3 py-2 transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="shrink-0 text-shm-navy-400">
                      [{m.receivedAt.toLocaleTimeString()}]
                    </span>
                    <span className="shrink-0 text-shm-teal">
                      {m.topic}
                    </span>
                    <span className="flex-1 break-all text-slate-300">
                      {m.payload}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}