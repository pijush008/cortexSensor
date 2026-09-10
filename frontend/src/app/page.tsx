import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Motion, MotionOnLoad } from "@/components/ui/motion";
import { SectionLabel } from "@/components/ui/section-label";
import {
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
import Image from "next/image";
import { ConsoleLink } from "@/components/home/console-link";
import { InstrumentationSchematic } from "@/components/home/instrumentation-schematic";
import { ReferenceStructures } from "@/components/home/reference-structures";

/**
 * The company's own mark, from public/brand.
 *
 * `company-logo.png` rather than the .jpeg the console uses: it carries an alpha
 * channel, so it sits on the translucent navigation bar without the white box a
 * JPEG would paint behind it.
 *
 * NOTE: public/brand also contains logo_01.png, which is the Canon
 * corporation's logo. It is not used here and must not be — placing another
 * company's trademark on this homepage would assert a relationship that does
 * not exist.
 */
const LOGO = {
  src: "/brand/company-logo.png",
  /** Intrinsic size; Next needs it to reserve space and avoid layout shift. */
  width: 599,
  height: 126,
} as const;

const COMPANY = "Cloudglance Sensinglab Pvt Ltd";
/** The tagline set in the logo artwork itself. */
const TAGLINE = "Infrahealth-sensing from anywhere";


export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-sheet-ink/15 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* The logo is a horizontal lockup that already contains the company
              name, so it stands alone — setting the name in type beside it
              would print it twice. */}
          <Link href="/" className="group flex items-center" aria-label={COMPANY}>
            <Image
              src={LOGO.src}
              alt={COMPANY}
              width={LOGO.width}
              height={LOGO.height}
              // Height-constrained, width automatic, so the lockup keeps its
              // proportions at any breakpoint.
              className="h-8 w-auto transition-transform duration-300 group-hover:scale-[1.03] sm:h-9"
              priority
            />
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {[
              { label: "Platform", href: "#platform" },
              { label: "Architecture", href: "#architecture" },
              { label: "Modules", href: "#modules" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="group relative px-4 py-2 text-sm font-medium text-sheet-ink/70 transition-colors hover:text-sheet-ink"
              >
                {item.label}
                <span className="absolute inset-x-4 -bottom-px h-px origin-left scale-x-0 bg-sheet-rust transition-transform duration-300 group-hover:scale-x-100 motion-reduce:transition-none" />
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <ConsoleLink size="sm">Sign in</ConsoleLink>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        id="platform"
        className="bg-sheet-hero relative pt-28 pb-16 lg:pt-36 lg:pb-20"
      >
        {/* The sheet's own margin rule, at the drawing-border inset. No blurred
            colour orbs, no photographic wash: a drawing sheet is a flat,
            legible ground, and anything behind the linework competes with it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-6 left-6 hidden w-px bg-sheet-ink/15 lg:block"
        />

        <div className="relative mx-auto max-w-[88rem] px-5 sm:px-8">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
            <div>
              {/* Set as a running head on a drawing, not a pill badge. */}
              <MotionOnLoad index={0}>
                <p className="mb-8 flex items-center gap-3 font-mono text-[11.5px] text-sheet-ink/50">
                  <span className="h-px w-10 bg-sheet-rust" />
                  Structural monitoring as a service
                </p>
              </MotionOnLoad>

              <MotionOnLoad index={1}>
                <h1 className="max-w-[15ch] text-[44px] font-bold leading-[1.02] tracking-[-0.035em] text-sheet-ink sm:text-[58px] lg:text-[66px]">
                  Every structure is already telling you something.
                </h1>
              </MotionOnLoad>

              <MotionOnLoad index={2}>
                <p className="mt-7 max-w-[54ch] text-[17px] leading-[1.62] text-sheet-ink/75">
                  Strain, vibration and deflection, measured continuously at the
                  structure and carried to engineers who can act on them. The
                  platform records what was measured, when, and by which
                  instrument — so a finding can be traced back to its evidence.
                </p>
              </MotionOnLoad>
              <MotionOnLoad index={3} className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ConsoleLink
                  size="lg"
                  className="w-full bg-sheet-ink text-sheet-paper hover:bg-sheet-navy sm:w-auto"
                >
                  Open the console
                </ConsoleLink>
                <a href="#structures">
                  <Button
                    size="lg"
                    variant="ghost"
                    className="w-full border border-sheet-ink/25 text-sheet-ink hover:border-sheet-ink/45 hover:bg-sheet-paper sm:w-auto"
                  >
                    <Layers className="h-4 w-4" />
                    See what it monitors
                  </Button>
                </a>
              </MotionOnLoad>

              {/* Capabilities the platform actually has, not certifications it
                  does not. This row previously read "SOC 2 · ISO 27001" — an
                  audit claim no code in this repository can support, and the
                  kind of statement a buyer verifies. */}
              {/* Also above the fold, so the cascade is CSS-only. The index
                  continues the hero's sequence rather than restarting it. */}
              <ul className="mt-10 flex flex-col gap-x-8 gap-y-3 border-t border-sheet-ink/15 pt-6 text-[13.5px] text-sheet-ink/70 sm:flex-row">
                {[
                  { icon: Lock, text: "Tenant isolation enforced in the database" },
                  { icon: Globe, text: "Per-device credentials, not a shared key" },
                  { icon: Brain, text: "Every reading traced to its calibration" },
                ].map((item, i) => (
                  <li
                    key={item.text}
                    className="mo-load flex items-start gap-2.5"
                    style={{ ["--i" as string]: i + 5 }}
                  >
                    <item.icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-sheet-rust"
                      strokeWidth={1.75}
                    />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>

            {/* The drawing, not a dashboard mock. A schematic instrumentation
                layout says what this platform attaches to and where, without
                asserting a reading that does not exist. */}
            <MotionOnLoad index={4} className="hidden lg:block">
              <InstrumentationSchematic />
            </MotionOnLoad>
          </div>

        </div>
      </section>


      {/* Architecture */}
      <section id="architecture" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Motion variant="rise">
            <div className="mb-12 max-w-2xl">
              <SectionLabel label="Three-plane architecture" />
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-sheet-ink sm:text-4xl">
                One platform. Three planes. End-to-end.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-sheet-ink/55">
                Control, application, and edge planes operate independently yet
                integrate for continuous structural monitoring.
              </p>
            </div>
          </Motion>

          <div className="grid gap-6 lg:grid-cols-3">
            {[
              {
                index: "01",
                title: "Control Plane",
                sub: "Platform management",
                icon: Cog,
                tone: "from-sheet-navy to-sheet-ink",
                accent: "text-sheet-rule",
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
                tone: "from-sheet-rule to-sheet-navy",
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
                tone: "from-sheet-navy to-sheet-ink",
                accent: "text-sheet-rule",
                items: [
                  "ESP32 / MCU sensor nodes",
                  "Marine & industrial gateways",
                  "MQTT with store-and-forward buffer",
                  "Health, calibration & OTA firmware",
                ],
              },
            ].map((plane, i) => (
              <Motion key={plane.title} variant="ink" index={i}>
                <Card className="group h-full overflow-hidden border-sheet-ink/15">
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
                    <h3 className="text-[15px] font-semibold tracking-tight text-sheet-ink">
                      {plane.title}
                    </h3>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-sheet-ink/45">
                      {plane.sub}
                    </p>
                    <ul className="mt-4 space-y-2.5">
                      {plane.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2.5 text-[13px] leading-snug text-sheet-ink/70"
                        >
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-shm-navy-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Motion>
            ))}
          </div>

          {/* Data flow */}
          <Motion variant="rise" index={2}>
            <div className="mt-10 rounded-xl border border-sheet-ink/15 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-sheet-ink/55">
                  Data flow
                </span>
                <span className="font-mono text-[10px] text-sheet-ink/45">
                  SENSOR → INGEST → ANALYZE
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {[
                  {
                    label: "Sensors",
                    icon: Gauge,
                    color:
                      "bg-sheet-paper0/10 text-sheet-navy border-sheet-navy/20",
                  },
                  {
                    label: "ESP32",
                    icon: Cpu,
                    color: "bg-slate-100 text-sheet-ink/75 border-sheet-ink/15",
                  },
                  {
                    label: "Gateway",
                    icon: Server,
                    color: "bg-slate-100 text-sheet-ink/75 border-sheet-ink/15",
                  },
                  {
                    label: "MQTT",
                    icon: Radio,
                    color:
                      "bg-sheet-paper0/10 text-sheet-navy border-sheet-navy/20",
                  },
                  {
                    label: "Cloud",
                    icon: Cloud,
                    color:
                      "bg-sheet-paper text-sheet-navy border-sheet-ink/15",
                  },
                  {
                    label: "TimescaleDB",
                    icon: Database,
                    color:
                      "bg-sheet-paper text-sheet-navy border-sheet-ink/15",
                  },
                  {
                    label: "SHM Engine",
                    icon: Brain,
                    color:
                      "bg-sheet-paper0/10 text-sheet-navy border-sheet-navy/20",
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
                      <ChevronRight className="hidden h-3.5 w-3.5 text-sheet-paper/70 sm:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Motion>
        </div>
      </section>

      {/* Structures showcase — real civil-engineering assets */}
      <ReferenceStructures />

      {/* Modules */}
      <section
        id="modules"
        className="bg-sheet border-y border-sheet-rule/40 py-20 lg:py-28"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Motion variant="rise">
            <div className="mb-12 max-w-2xl">
              <SectionLabel label="Platform modules" />
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-sheet-ink sm:text-4xl">
                Twelve capabilities, one instrumented truth.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-sheet-ink/55">
                From IoT ingestion to damage localization, every module is built
                for production-grade structural monitoring.
              </p>
            </div>
          </Motion>

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
              <Motion key={m.title} variant="ink" index={i % 3}>
                <div className="group h-full rounded-xl border border-sheet-ink/15 bg-sheet-paper p-5 shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-sheet-rule hover:shadow-[0_10px_30px_-12px_rgba(17,17,17,0.2)]">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sheet-paper text-sheet-ink transition-colors duration-300 group-hover:bg-sheet-ink group-hover:text-white">
                      <m.icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                    </div>
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-sheet-ink/45">
                      {m.tag}
                    </span>
                  </div>
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-sheet-ink">
                    {m.title}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-sheet-ink/55">
                    {m.description}
                  </p>
                </div>
              </Motion>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Motion variant="rise">
            <div className="mb-12 max-w-2xl">
              <SectionLabel label="Access control" />
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-sheet-ink sm:text-4xl">
                Role-based access, fully audited.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-sheet-ink/55">
                Five distinct roles with permission-based access. Every action
                is recorded.
              </p>
            </div>
          </Motion>

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
              <Motion key={r.role} variant="ink" index={i}>
                <div className="group h-full rounded-xl border border-sheet-ink/15 bg-sheet-paper p-5 text-left shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:border-sheet-rule hover:shadow-[0_10px_30px_-12px_rgba(17,17,17,0.2)]">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sheet-ink text-white transition-transform duration-300 group-hover:scale-105">
                      <r.icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                    </div>
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-sheet-ink/45">
                      {r.tag}
                    </span>
                  </div>
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-sheet-ink">
                    {r.role}
                  </h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-sheet-ink/55">
                    {r.desc}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {r.items.map((item) => (
                      <span
                        key={item}
                        className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[9.5px] text-sheet-ink/55"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </Motion>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-y border-sheet-ink/15 bg-sheet-paper py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Motion variant="rise">
            <div className="mb-12 max-w-2xl">
              <SectionLabel label="Subscription plans" />
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-sheet-ink sm:text-4xl">
                Pricing by scale, not by structure.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-sheet-ink/55">
                Entitlement-based plans that grow with your infrastructure
                footprint.
              </p>
            </div>
          </Motion>

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
              <Motion key={plan.name} variant="ink" index={i}>
                <div
                  className={`relative flex h-full flex-col rounded-xl border bg-white p-6 ${
                    plan.featured
                      ? "border-shm-navy-500 shadow-[0_0_0_1px_rgba(17,17,17,0.25),0_20px_60px_-20px_rgba(17,17,17,0.35)]"
                      : "border-sheet-ink/15 shadow-[0_1px_2px_rgba(17,17,17,0.04)]"
                  }`}
                >
                  {plan.featured && (
                    <span className="absolute -top-3 left-6 rounded-full bg-sheet-ink px-3 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-white">
                      Most deployed
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-[16px] font-semibold tracking-tight text-sheet-ink">
                      {plan.name}
                    </h3>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-sheet-ink/45">
                      TIER 0{i + 1}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-sheet-ink/55">
                    {plan.desc}
                  </p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tracking-tight text-sheet-ink">
                      {plan.price}
                    </span>
                    <span className="text-[12px] text-sheet-ink/45">
                      {plan.period}
                    </span>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2 border-t border-sheet-ink/10 pt-5">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-[13px] text-sheet-ink/70"
                      >
                        <CheckMark />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/login" className="mt-6">
                    <Button
                      className={`w-full ${plan.featured ? "" : "bg-slate-100 text-slate-800 hover:bg-sheet-ink/15"}`}
                    >
                      Get started
                    </Button>
                  </Link>
                </div>
              </Motion>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-sheet-ink py-24">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-transparent blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <Motion variant="rise">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.24em] text-sheet-rule">
              Ready when you are
            </p>
            <h2 className="mb-5 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Protect your infrastructure before it signals.
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-[15px] leading-relaxed text-sheet-paper/70">
              Start monitoring in minutes. Live telemetry, engineering analysis,
              and alerts that reach the right person at the right time.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <ConsoleLink
                size="lg"
                className="w-full bg-white text-sheet-ink hover:bg-sheet-print sm:w-auto"
              >
                Start free trial
              </ConsoleLink>
              <Button
                size="lg"
                variant="ghost"
                className="w-full border border-white/25 text-white hover:border-white/40 hover:bg-white/5 sm:w-auto"
              >
                <FileText className="h-4 w-4" />
                Request a demo
              </Button>
            </div>
          </Motion>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-sheet-ink/15 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="max-w-xs">
              <Image
                src={LOGO.src}
                alt={COMPANY}
                width={LOGO.width}
                height={LOGO.height}
                className="h-9 w-auto"
              />
              <p className="mt-3 font-mono text-[8.5px] uppercase tracking-[0.22em] text-sheet-ink/45">
                {TAGLINE}
              </p>
              <p className="mt-4 text-[13px] leading-relaxed text-sheet-ink/55">
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
                <h4 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-sheet-ink">
                  {col.title}
                </h4>
                <ul className="space-y-2 text-[13px] text-sheet-ink/55">
                  {col.links.map((l) => (
                    <li key={l}>
                      <span className="mo-link cursor-pointer transition-colors hover:text-sheet-ink">
                        {l}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-sheet-ink/15 pt-6 sm:flex-row">
            <p className="font-mono text-[11px] text-sheet-ink/45">
              {/* Derived from the clock, so the notice does not silently go
                  stale on 1 January. */}
              © {new Date().getFullYear()} {COMPANY}
            </p>
            <div className="flex gap-5 font-mono text-[11px] text-sheet-ink/45">
              <span className="cursor-pointer transition-colors hover:text-sheet-ink/70">
                PRIVACY
              </span>
              <span className="cursor-pointer transition-colors hover:text-sheet-ink/70">
                TERMS
              </span>
              <span className="cursor-pointer transition-colors hover:text-sheet-ink/70">
                SECURITY
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}



function CheckMark() {
  return (
    <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sheet-paper0/10 text-sheet-navy">
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
