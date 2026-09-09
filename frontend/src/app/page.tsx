import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Brain,
  ChevronRight,
  Cloud,
  Cog,
  Cpu,
  Database,
  Eye,
  FileText,
  Gauge,
  Globe,
  HardDrive,
  Layers,
  Lock,
  MonitorDot,
  Radar,
  Radio,
  Server,
  Shield,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

const TICKER = [
  "GWH-03 · Tower Leg 1 — vibration band nominal",
  "SEN-55 · Micro-strain +38με — within tolerance",
  "GWH-07 · Node battery 19% — charging advised",
  "MQTT · 412 msg/s — ingestion nominal",
  "SEN-12 · Modal drift +0.42% — Δ2.4°C ambient",
  "GWH-01 · Watchdog restart cleared",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-shm-navy-800 transition-transform duration-300 group-hover:scale-105">
              <Activity className="h-5 w-5 text-white" strokeWidth={1.75} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-tight text-shm-navy-900">
                StructGuard
              </span>
              <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.24em] text-slate-400">
                Structural Monitor
              </span>
            </span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {[
              { label: "Platform", href: "#platform" },
              { label: "Architecture", href: "#architecture" },
              { label: "Modules", href: "#modules" },
              { label: "Technology", href: "#technology" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="group relative px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-shm-navy-800"
              >
                {item.label}
                <span className="absolute inset-x-4 -bottom-px h-px origin-left scale-x-0 bg-shm-navy-600 transition-transform duration-300 group-hover:scale-x-100" />
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button size="sm">
                Sign In
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        id="platform"
        className="bg-blueprint relative overflow-hidden bg-gradient-to-br from-shm-lavender via-shm-lavender-soft to-shm-cyan-soft pt-32 pb-20 lg:pt-40 lg:pb-24"
      >
        {/* Real structure photo as backdrop — monochrome, heavily under-exposed */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/structures/hero-bridge.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-[0.14] mix-blend-multiply"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-shm-lavender/90 via-shm-lavender/60 to-transparent" />
        <div
          className="pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25px 25px, rgba(26,18,37,0.10) 1px, transparent 0)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="absolute -top-24 right-0 h-[26rem] w-[26rem] rounded-full bg-shm-cyan/30 blur-3xl" />
        <div className="absolute bottom-0 -left-24 h-80 w-80 rounded-full bg-shm-mint/25 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="max-w-2xl">
              <Reveal>
                <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-shm-navy-900/12 bg-white/70 px-3.5 py-1.5 backdrop-blur">
                  <PulseDotLike />
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-shm-navy-700">
                    Structural Monitoring as a Service
                  </span>
                </div>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="mb-6 font-display text-[42px] font-semibold leading-[1.04] tracking-tight text-shm-navy-900 sm:text-[56px] lg:text-[64px]">
                  Structure,
                  <br />
                  instrumented.
                  <br />
                  <span className="text-shm-navy-600">Risk, measured.</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mb-9 max-w-xl text-[17px] leading-relaxed text-slate-700">
                  IoT edge nodes feed continuous strain, vibration and
                  deflection data into a cloud platform that detects the
                  anomalies engineers need to know — before they become
                  failures.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link href="/login">
                    <Button
                      size="lg"
                      className="w-full bg-shm-navy-900 text-white hover:bg-shm-navy-800 sm:w-auto"
                    >
                      Explore the console
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <a href="#architecture">
                    <Button
                      size="lg"
                      variant="ghost"
                      className="w-full border border-shm-navy-900/25 text-shm-navy-900 hover:border-shm-navy-900/40 hover:bg-white/60 sm:w-auto"
                    >
                      <Layers className="h-4 w-4" />
                      Architecture
                    </Button>
                  </a>
                </div>
              </Reveal>
              <Reveal delay={320}>
                <div className="mt-11 flex flex-col gap-x-8 gap-y-3 border-t border-shm-navy-900/12 pt-6 text-[13px] text-slate-700 sm:flex-row">
                  {[
                    { icon: Lock, text: "SOC 2 · ISO 27001" },
                    { icon: Globe, text: "Multi-tenant SaaS" },
                    { icon: Brain, text: "Physics-informed AI" },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-2">
                      <item.icon
                        className="h-4 w-4 text-shm-navy-600"
                        strokeWidth={1.75}
                      />
                      {item.text}
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* Live dashboard mock */}
            <Reveal delay={180} className="hidden lg:block">
              <div className="relative">
                <div className="absolute -inset-5 rounded-2xl bg-shm-cyan/25 blur-2xl" />
                <div className="relative rounded-2xl border border-shm-navy-900/10 bg-white p-5 shadow-2xl backdrop-blur">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-shm-lavender">
                        <Activity className="h-3.5 w-3.5 text-shm-navy-700" />
                      </span>
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        Live telemetry
                      </span>
                    </div>
                    <span className="flex items-center gap-1.5 text-[11px] text-shm-green-text">
                      <LiveDot />
                      All systems nominal
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      {
                        label: "TEMP",
                        value: "24.5",
                        unit: "°C",
                        dot: "bg-shm-yellow",
                      },
                      {
                        label: "VIB",
                        value: "0.12",
                        unit: "g",
                        dot: "bg-shm-green",
                      },
                      {
                        label: "STRAIN",
                        value: "145",
                        unit: "με",
                        dot: "bg-shm-chart-1",
                      },
                      {
                        label: "HUM",
                        value: "62",
                        unit: "%",
                        dot: "bg-shm-navy-500",
                      },
                      {
                        label: "DEFL",
                        value: "2.3",
                        unit: "mm",
                        dot: "bg-shm-peach",
                      },
                      {
                        label: "LOAD",
                        value: "45",
                        unit: "kN",
                        dot: "bg-shm-green",
                      },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">
                            {s.label}
                          </span>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${s.dot}`}
                          />
                        </div>
                        <p className="mt-1 font-mono text-[15px] font-medium tabular-nums text-shm-navy-900">
                          {s.value}
                          <span className="ml-0.5 text-[10px] text-slate-500">
                            {s.unit}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">
                      <span>FFT spectrum · bridge span 2</span>
                      <span className="text-shm-navy-700">f₁ = 3.42 Hz</span>
                    </div>
                    <div className="flex h-14 items-end gap-px">
                      {[
                        15, 25, 20, 35, 30, 45, 40, 60, 55, 80, 70, 90, 65, 50,
                        45, 35, 30, 25, 20, 18, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1,
                      ].map((h, i) => (
                        <div
                          key={i}
                          className="anim-rise flex-1 origin-bottom rounded-t-sm bg-gradient-to-t from-shm-chart-1 to-shm-cyan"
                          style={{
                            height: `${h}%`,
                            animationDelay: `${i * 18}ms`,
                            animationDuration: "0.7s",
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between font-mono text-[8px] text-slate-500">
                      <span>0 Hz</span>
                      <span>10 Hz</span>
                      <span>20 Hz</span>
                      <span>30 Hz</span>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* ticker */}
          <div className="relative mt-16 overflow-hidden border-t border-shm-navy-900/12 pt-4">
            <div className="anim-marquee flex w-max gap-10">
              {[...TICKER, ...TICKER].map((t, i) => (
                <span
                  key={i}
                  className="flex items-center gap-2 whitespace-nowrap font-mono text-[11px] text-slate-600"
                >
                  <span className="h-1 w-1 rounded-full bg-shm-cyan" />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="relative z-10 mx-auto -mt-9 max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-[0_12px_40px_-16px_rgba(17,17,17,0.25)] md:grid-cols-4">
          {[
            { value: "500+", label: "Structures monitored" },
            { value: "10K+", label: "Sensors connected" },
            { value: "99.9%", label: "Platform uptime" },
            { value: "24/7", label: "Real-time coverage" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white px-5 py-6">
              <p className="font-display text-3xl font-semibold tracking-tight text-shm-navy-800">
                {stat.value}
              </p>
              <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-slate-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section id="architecture" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mb-12 max-w-2xl">
              <SectionLabel index="01" label="Three-plane architecture" />
              <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-shm-navy-900 sm:text-4xl">
                One platform. Three planes. End-to-end.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-500">
                Control, application, and edge planes operate independently yet
                integrate for continuous structural monitoring.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-6 lg:grid-cols-3">
            {[
              {
                index: "01",
                title: "Control Plane",
                sub: "Platform management",
                icon: Cog,
                tone: "from-shm-navy-700 to-shm-navy-900",
                accent: "text-shm-navy-300",
                items: [
                  "Tenant & RBAC administration",
                  "Subscriptions, billing & payments",
                  "Device provisioning & audit",
                  "Platform configuration & security",
                ],
              },
              {
                index: "02",
                title: "Application Plane",
                sub: "Analytics & intelligence",
                icon: MonitorDot,
                tone: "from-shm-navy-500 to-shm-navy-700",
                accent: "text-shm-cyan",
                items: [
                  "Signal processing, FFT & modal analysis",
                  "AI/ML anomaly detection",
                  "Physics-informed FEM comparison",
                  "Alerts, reports & digital twin",
                ],
              },
              {
                index: "03",
                title: "Edge / IoT Plane",
                sub: "Sensors & gateways",
                icon: Radio,
                tone: "from-shm-navy-700 to-shm-navy-900",
                accent: "text-shm-navy-300",
                items: [
                  "ESP32 / MCU sensor nodes",
                  "Marine & industrial gateways",
                  "MQTT with store-and-forward buffer",
                  "Health, calibration & OTA firmware",
                ],
              },
            ].map((plane, i) => (
              <Reveal key={plane.title} delay={i * 80}>
                <Card className="group h-full overflow-hidden border-slate-200">
                  <div
                    className={`flex items-center justify-between bg-gradient-to-r ${plane.tone} px-5 py-3`}
                  >
                    <span className="font-mono text-[10px] tracking-[0.22em] text-white/70">
                      PLANE {plane.index}
                    </span>
                    <plane.icon
                      className={`h-4 w-4 ${plane.accent}`}
                      strokeWidth={1.75}
                    />
                  </div>
                  <CardContent className="p-5">
                    <h3 className="text-[15px] font-semibold tracking-tight text-shm-navy-900">
                      {plane.title}
                    </h3>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                      {plane.sub}
                    </p>
                    <ul className="mt-4 space-y-2.5">
                      {plane.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2.5 text-[13px] leading-snug text-slate-600"
                        >
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-shm-navy-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>

          {/* Data flow */}
          <Reveal delay={120}>
            <div className="mt-10 rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Data flow
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  SENSOR → INGEST → ANALYZE
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {[
                  {
                    label: "Sensors",
                    icon: Gauge,
                    color:
                      "bg-shm-navy-500/10 text-shm-navy-700 border-shm-navy-500/20",
                  },
                  {
                    label: "ESP32",
                    icon: Cpu,
                    color: "bg-slate-100 text-slate-700 border-slate-200",
                  },
                  {
                    label: "Gateway",
                    icon: Server,
                    color: "bg-slate-100 text-slate-700 border-slate-200",
                  },
                  {
                    label: "MQTT",
                    icon: Radio,
                    color:
                      "bg-shm-navy-500/10 text-shm-navy-700 border-shm-navy-500/20",
                  },
                  {
                    label: "Cloud",
                    icon: Cloud,
                    color:
                      "bg-shm-navy-50 text-shm-navy-700 border-shm-navy-200",
                  },
                  {
                    label: "TimescaleDB",
                    icon: Database,
                    color:
                      "bg-shm-navy-50 text-shm-navy-700 border-shm-navy-200",
                  },
                  {
                    label: "SHM Engine",
                    icon: Brain,
                    color:
                      "bg-shm-navy-500/10 text-shm-navy-700 border-shm-navy-500/20",
                  },
                  {
                    label: "Alerts",
                    icon: Bell,
                    color: "bg-shm-yellow/10 text-amber-700 border-amber-200",
                  },
                  {
                    label: "Dashboards",
                    icon: MonitorDot,
                    color: "bg-shm-green/10 text-shm-green-text border-shm-green/20",
                  },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-center gap-2">
                    <span
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium ${step.color}`}
                    >
                      <step.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {step.label}
                    </span>
                    {i < 8 && (
                      <ChevronRight className="hidden h-3.5 w-3.5 text-slate-300 sm:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Structures showcase — real civil-engineering assets */}
      <section id="structures" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mb-12 grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-end">
              <div className="max-w-xl">
                <SectionLabel index="02" label="Instrumented structures" />
                <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-shm-navy-900 sm:text-4xl">
                  Bridges, dams, towers — under constant watch.
                </h2>
              </div>
              <p className="text-[15px] leading-relaxed text-slate-500 lg:max-w-xl lg:justify-self-end">
                Every structure feeds strain, vibration and deflection into the
                platform, transformed into engineering decisions.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                src: "/images/structures/cable-stayed.jpg",
                name: "Cable-Stayed Viaduct",
                meta: "Bengaluru · 42 sensors",
                stat: "VIB 0.12g",
              },
              {
                src: "/images/structures/hero-bridge.jpg",
                name: "Suspension Deck",
                meta: "Mumbai · 38 sensors",
                stat: "STRAIN 145 με",
              },
              {
                src: "/images/structures/night-bridge.jpg",
                name: "Night Span",
                meta: "Kolkata · 51 sensors",
                stat: "TEMPERATURE 24.5°C",
              },
            ].map((s, i) => (
              <Reveal key={s.name} delay={(i % 3) * 90}>
                <figure className="group relative overflow-hidden rounded-xl border border-slate-200 bg-shm-navy-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.src}
                    alt={`${s.name} — structural health monitoring`}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover opacity-90 transition-all duration-500 group-hover:opacity-100 group-hover:grayscale-0"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <figcaption className="absolute inset-x-0 bottom-0 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[15px] font-semibold tracking-tight text-white">
                          {s.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-slate-300">
                          {s.meta}
                        </p>
                      </div>
                      <span className="rounded-md border border-white/25 bg-white/10 px-2 py-1 font-mono text-[9.5px] text-shm-green backdrop-blur">
                        {s.stat}
                      </span>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section
        id="modules"
        className="bg-paper-grid border-y border-slate-200 bg-shm-cream py-20 lg:py-28"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mb-12 max-w-2xl">
              <SectionLabel index="02" label="Platform modules" />
              <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-shm-navy-900 sm:text-4xl">
                Twelve capabilities, one instrumented truth.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-500">
                From IoT ingestion to damage localization, every module is built
                for production-grade structural monitoring.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Radio,
                title: "IoT Data Pipeline",
                description:
                  "MQTT ingestion with validation, deduplication, and store-and-forward buffering.",
                tag: "Edge",
              },
              {
                icon: Database,
                title: "Time-Series Store",
                description:
                  "PostgreSQL + TimescaleDB for high-frequency sensor data.",
                tag: "Data",
              },
              {
                icon: BarChart3,
                title: "FFT & Modal Analysis",
                description:
                  "Welch PSD, STFT, wavelet analysis, frequency tracking, mode shapes.",
                tag: "Analytics",
              },
              {
                icon: Brain,
                title: "AI Anomaly Detection",
                description:
                  "Isolation Forest, autoencoders, LSTM and transformers — explainable.",
                tag: "AI",
              },
              {
                icon: TrendingUp,
                title: "Physics-Informed FEM",
                description:
                  "Finite-element comparison against live sensor telemetry.",
                tag: "Physics",
              },
              {
                icon: AlertTriangle,
                title: "Smart Alert Engine",
                description:
                  "Thresholds, severity, multi-channel email / SMS / push dispatch.",
                tag: "Alerts",
              },
              {
                icon: Lock,
                title: "Multi-Tenant SaaS",
                description:
                  "Tenant isolation, RBAC, subscriptions, and payments.",
                tag: "SaaS",
              },
              {
                icon: FileText,
                title: "Automated Reports",
                description:
                  "FFT summaries, anomaly history, inspection recommendations.",
                tag: "Reports",
              },
              {
                icon: Shield,
                title: "Sensor Health",
                description:
                  "Detect drift, saturation, battery and calibration issues early.",
                tag: "Health",
              },
              {
                icon: Radar,
                title: "Damage Localization",
                description:
                  "Component-level severity with evidence-based recommendations.",
                tag: "Damage",
              },
              {
                icon: Cloud,
                title: "Edge Gateway",
                description:
                  "Industrial gateway with local processing and secure sync.",
                tag: "Edge",
              },
              {
                icon: Eye,
                title: "Computer Vision",
                description:
                  "Crack, spalling and corrosion analysis from inspection imagery.",
                tag: "Vision",
              },
            ].map((m, i) => (
              <Reveal key={m.title} delay={(i % 3) * 70}>
                <div className="group h-full rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,17,17,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_30px_-12px_rgba(17,17,17,0.2)]">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-shm-cyan-soft text-shm-navy-800 transition-colors duration-300 group-hover:bg-shm-navy-800 group-hover:text-white">
                      <m.icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                    </div>
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {m.tag}
                    </span>
                  </div>
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-shm-navy-900">
                    {m.title}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
                    {m.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Technology */}
      <section
        id="technology"
        className="bg-blueprint bg-shm-navy-900 py-20 lg:py-28"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mb-12 max-w-2xl">
              <SectionLabel index="03" label="Technology" light />
              <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                TypeScript for products. Python for physics.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
                Every layer is chosen for a specific workload — from real-time
                web dashboards to heavy signal-processing pipelines.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Frontend",
                icon: MonitorDot,
                items: [
                  "Next.js 15",
                  "React 19",
                  "TypeScript",
                  "Tailwind CSS",
                  "Recharts",
                  "PWA",
                ],
              },
              {
                title: "Product Backend",
                icon: Server,
                items: [
                  "Next.js API Routes",
                  "Prisma ORM",
                  "Auth & RBAC",
                  "REST APIs",
                ],
              },
              {
                title: "Engineering Backend",
                icon: Cog,
                items: [
                  "Python / FastAPI",
                  "NumPy / SciPy",
                  "pandas",
                  "PyTorch",
                  "OpenCV",
                ],
              },
              {
                title: "Data",
                icon: Database,
                items: ["PostgreSQL", "TimescaleDB", "Redis", "Object Storage"],
              },
              {
                title: "IoT & Edge",
                icon: Radio,
                items: [
                  "ESP32 / MCU",
                  "Raspberry Pi",
                  "MQTT",
                  "NTP / PTP",
                  "OTA",
                ],
              },
              {
                title: "Infrastructure",
                icon: HardDrive,
                items: [
                  "Nginx / WAF",
                  "Docker",
                  "CI/CD",
                  "OpenTelemetry",
                  "AWS / GCP / Azure",
                ],
              },
            ].map((s, i) => (
              <Reveal key={s.title} delay={(i % 3) * 70}>
                <div className="group h-full rounded-xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.07]">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-shm-cyan/15">
                      <s.icon
                        className="h-4.5 w-4.5 text-shm-navy-200"
                        strokeWidth={1.75}
                      />
                    </div>
                    <h3 className="text-[14.5px] font-semibold tracking-tight text-white">
                      {s.title}
                    </h3>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {s.items.map((item) => (
                      <li
                        key={item}
                        className="rounded-md border border-white/10 px-2 py-1 font-mono text-[10.5px] text-slate-300"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mb-12 max-w-2xl">
              <SectionLabel index="04" label="Access control" />
              <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-shm-navy-900 sm:text-4xl">
                Role-based access, fully audited.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-500">
                Five distinct roles with permission-based access. Every action
                is recorded.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                role: "Super Admin",
                desc: "Platform owner — tenants, billing, system health.",
                icon: Shield,
                tag: "ADMIN",
                items: ["Tenants", "Billing", "Audit"],
              },
              {
                role: "Org Admin",
                desc: "Customer admin — users, structures, devices.",
                icon: Cog,
                tag: "ADMIN",
                items: ["Users", "Structures"],
              },
              {
                role: "SHM Engineer",
                desc: "FFT, AI models, damage localization.",
                icon: Brain,
                tag: "ENG",
                items: ["Analytics", "FFT", "Reports"],
              },
              {
                role: "Technician",
                desc: "Field ops — health, calibration, firmware.",
                icon: Wrench,
                tag: "FIELD",
                items: ["Gateways", "Sensors"],
              },
              {
                role: "Viewer",
                desc: "Read-only dashboards, alerts, reports.",
                icon: Eye,
                tag: "RO",
                items: ["Dashboard", "Alerts"],
              },
            ].map((r, i) => (
              <Reveal key={r.role} delay={i * 60}>
                <div className="group h-full rounded-xl border border-slate-200 bg-white p-5 text-left shadow-[0_1px_2px_rgba(17,17,17,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-shm-navy-300 hover:shadow-[0_10px_30px_-12px_rgba(17,17,17,0.2)]">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-shm-navy-800 text-white transition-transform duration-300 group-hover:scale-105">
                      <r.icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                    </div>
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {r.tag}
                    </span>
                  </div>
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-shm-navy-900">
                    {r.role}
                  </h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
                    {r.desc}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {r.items.map((item) => (
                      <span
                        key={item}
                        className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[9.5px] text-slate-500"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-paper-grid border-y border-slate-200 bg-shm-lavender-soft/45 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mb-12 max-w-2xl">
              <SectionLabel index="05" label="Subscription plans" />
              <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-shm-navy-900 sm:text-4xl">
                Pricing by scale, not by structure.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-500">
                Entitlement-based plans that grow with your infrastructure
                footprint.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-5 lg:grid-cols-3">
            {[
              {
                name: "Starter",
                price: "₹4,999",
                period: "/month",
                desc: "Small projects and proof of concept",
                features: [
                  "Up to 3 structures",
                  "Up to 20 sensors",
                  "5 users",
                  "Basic analytics & reports",
                  "Email alerts",
                  "30-day retention",
                ],
                featured: false,
              },
              {
                name: "Professional",
                price: "₹14,999",
                period: "/month",
                desc: "Growing monitoring operations",
                features: [
                  "Up to 20 structures",
                  "Up to 200 sensors",
                  "25 users",
                  "Advanced analytics + FFT",
                  "AI anomaly detection",
                  "API access",
                  "Email + SMS alerts",
                  "1-year retention",
                ],
                featured: true,
              },
              {
                name: "Enterprise",
                price: "Custom",
                period: "",
                desc: "Large-scale infrastructure",
                features: [
                  "Unlimited structures & sensors",
                  "Advanced AI + FEM",
                  "Digital twin + vision",
                  "Custom integrations",
                  "SSO & dedicated deployment",
                  "SLA & support",
                ],
                featured: false,
              },
            ].map((plan, i) => (
              <Reveal key={plan.name} delay={i * 90}>
                <div
                  className={`relative flex h-full flex-col rounded-xl border bg-white p-6 ${
                    plan.featured
                      ? "border-shm-navy-500 shadow-[0_0_0_1px_rgba(17,17,17,0.25),0_20px_60px_-20px_rgba(17,17,17,0.35)]"
                      : "border-slate-200 shadow-[0_1px_2px_rgba(17,17,17,0.04)]"
                  }`}
                >
                  {plan.featured && (
                    <span className="absolute -top-3 left-6 rounded-full bg-shm-navy-800 px-3 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-white">
                      Most deployed
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-[16px] font-semibold tracking-tight text-shm-navy-900">
                      {plan.name}
                    </h3>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      TIER 0{i + 1}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    {plan.desc}
                  </p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="font-display text-3xl font-semibold tracking-tight text-shm-navy-900">
                      {plan.price}
                    </span>
                    <span className="text-[12px] text-slate-400">
                      {plan.period}
                    </span>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2 border-t border-slate-100 pt-5">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-[13px] text-slate-600"
                      >
                        <CheckMark />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/login" className="mt-6">
                    <Button
                      className={`w-full ${plan.featured ? "" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}
                    >
                      Get started
                    </Button>
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blueprint relative overflow-hidden bg-gradient-to-br from-shm-navy-800 to-shm-navy-900 py-20">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-shm-cyan/25 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.24em] text-shm-navy-300">
              Ready when you are
            </p>
            <h2 className="mb-5 font-display text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Protect your infrastructure before it signals.
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-[15px] leading-relaxed text-slate-300">
              Start monitoring in minutes. Live telemetry, engineering analysis,
              and alerts that reach the right person at the right time.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/login">
                <Button
                  size="lg"
                  className="w-full bg-white text-shm-navy-900 hover:bg-slate-100 sm:w-auto"
                >
                  Start free trial
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="ghost"
                className="w-full border border-white/25 text-white hover:border-white/40 hover:bg-white/5 sm:w-auto"
              >
                <FileText className="h-4 w-4" />
                Request a demo
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-shm-navy-800">
                  <Activity className="h-4 w-4 text-white" strokeWidth={1.75} />
                </span>
                <div className="leading-none">
                  <p className="text-[14px] font-bold tracking-tight text-shm-navy-900">
                    StructGuard
                  </p>
                  <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.22em] text-slate-400">
                    by Arctano Sensors
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
                Continuous structural health monitoring — IoT edge nodes, cloud
                analytics, physics-informed AI, and a full multi-tenant SaaS
                platform.
              </p>
            </div>
            {[
              {
                title: "Platform",
                links: ["Dashboard", "Analytics", "Alerts", "Reports"],
              },
              {
                title: "Solutions",
                links: [
                  "Bridge monitoring",
                  "Building health",
                  "Dam safety",
                  "Industrial",
                ],
              },
              {
                title: "Company",
                links: ["About", "Documentation", "Support", "Contact"],
              },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-shm-navy-800">
                  {col.title}
                </h4>
                <ul className="space-y-2 text-[13px] text-slate-500">
                  {col.links.map((l) => (
                    <li
                      key={l}
                      className="transition-colors hover:text-shm-navy-700"
                    >
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-6 sm:flex-row">
            <p className="font-mono text-[11px] text-slate-400">
              © 2026 StructGuard · Arctano Sensors
            </p>
            <div className="flex gap-5 font-mono text-[11px] text-slate-400">
              <span className="cursor-pointer transition-colors hover:text-slate-600">
                PRIVACY
              </span>
              <span className="cursor-pointer transition-colors hover:text-slate-600">
                TERMS
              </span>
              <span className="cursor-pointer transition-colors hover:text-slate-600">
                SECURITY
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PulseDotLike() {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-shm-green opacity-60"
        style={{ animationDuration: "2s" }}
      />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-shm-green" />
    </span>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-shm-green opacity-60"
        style={{ animationDuration: "1.6s" }}
      />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-shm-green" />
    </span>
  );
}

function CheckMark() {
  return (
    <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-shm-navy-500/10 text-shm-navy-600">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

function Wrench(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
