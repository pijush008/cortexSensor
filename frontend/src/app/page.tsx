import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Motion, MotionOnLoad } from "@/components/ui/motion";
import { MobileNav } from "@/components/home/mobile-nav";
import { NAV_ITEMS } from "@/components/home/nav-items";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Bell,
  Brain,
  ChevronRight,
  Cloud,
  Cpu,
  Database,
  Gauge,
  Globe,
  Layers,
  Lock,
  MonitorDot,
  Radio,
  Server,
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
            {NAV_ITEMS.map((item) => (
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
          <div className="flex items-center gap-1 sm:gap-3">
            <ConsoleLink size="sm">Sign in</ConsoleLink>
            <MobileNav />
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
                <p className="mb-8 flex items-center gap-3 font-mono text-label text-sheet-ink/55">
                  <span className="h-px w-10 bg-sheet-rust" />
                  Structural monitoring as a service
                </p>
              </MotionOnLoad>

              <MotionOnLoad index={1}>
                <h1 className="max-w-[15ch] text-[2.75rem] font-bold leading-[1.02] tracking-[-0.035em] text-sheet-ink sm:text-[3.625rem] lg:text-[4.125rem]">
                  Structural health monitoring for bridges, dams and
                  buildings.
                </h1>
              </MotionOnLoad>

              <MotionOnLoad index={2}>
                <p className="mt-7 max-w-[54ch] text-lead leading-[1.62] text-sheet-ink/70">
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
                    className="w-full border-2 border-sheet-ink/35 bg-sheet-paper/60 text-sheet-ink hover:border-sheet-ink/60 hover:bg-sheet-paper sm:w-auto"
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
              <ul className="mt-14 flex flex-col gap-x-8 gap-y-3 border-t border-sheet-ink/15 pt-7 text-caption text-sheet-ink/70 sm:flex-row">
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
                The platform runs in three planes.
              </h2>
              <p className="mt-4 text-body leading-relaxed text-sheet-ink/55">
                Each plane is deployed, scaled and secured on its own. That
                separation is what lets the edge keep recording when the link to
                the cloud is down.
              </p>
            </div>
          </Motion>

          <div className="grid gap-6 lg:grid-cols-3">
            {[
              {
                index: "01",
                title: "Control Plane",
                sub: "Platform management",
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
                items: [
                  "ESP32 / MCU sensor nodes",
                  "Marine & industrial gateways",
                  "HTTPS ingest with per-device credentials",
                  "Health, calibration & OTA firmware",
                ],
              },
            ].map((plane, i) => (
              <Motion key={plane.title} variant="ink" index={i}>
                {/* No gradient plate, and no "PLANE 01" set in tracked mono on
                    top of it. The ordinal is worth keeping — the planes are
                    genuinely ordered — but as a quiet marker beside the name,
                    the same shape the pricing cards use for their tier. A
                    coloured gradient header carries no information the title
                    does not already carry. */}
                <Card className="h-full border-sheet-ink/15">
                  <CardContent className="p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-body font-semibold tracking-tight text-sheet-ink">
                        {plane.title}
                      </h3>
                      <span className="font-mono text-label text-sheet-ink/45">
                        {plane.index}
                      </span>
                    </div>
                    <p className="mt-1 text-caption text-sheet-ink/55">
                      {plane.sub}
                    </p>
                    <ul className="mt-4 space-y-2.5 border-t border-sheet-ink/15 pt-4">
                      {plane.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2.5 text-caption leading-snug text-sheet-ink/70"
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
                <span className="font-mono text-label font-semibold uppercase tracking-[0.22em] text-sheet-ink/55">
                  Data flow
                </span>
                <span className="font-mono text-label text-sheet-ink/45">
                  SENSOR → INGEST → ANALYZE
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-label">
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
                    color: "bg-slate-100 text-sheet-ink/70 border-sheet-ink/15",
                  },
                  {
                    label: "Gateway",
                    icon: Server,
                    color: "bg-slate-100 text-sheet-ink/70 border-sheet-ink/15",
                  },
                  {
                    label: "HTTPS",
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
                Modules, grouped by where they run.
              </h2>
              <p className="mt-4 text-body leading-relaxed text-sheet-ink/55">
                From ingestion at the sensor through to alerting, reporting
                and damage assessment.
              </p>
            </div>
          </Motion>

          {/* Grouped by where each module runs, not laid out as twelve
              identical boxes.

              A uniform icon grid is the default shape of a marketing page, and
              it flattens everything onto one level: an ingestion pipeline and a
              report generator get the same weight, the same icon treatment and
              the same tracked-uppercase tag. Grouping says something the grid
              could not — that these are four stages of one pipeline — and a
              hairline-divided list is how the reference-structures plate on
              this page already presents specifications. */}
          <div className="grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                group: "Edge and ingest",
                modules: [
                  {
                    title: "IoT data pipeline",
                    description:
                      "HTTPS ingest with schema validation, deduplication by event id, and per-device credentials.",
                  },
                  {
                    title: "Edge gateway",
                    description:
                      "Industrial gateway with local processing and secure sync.",
                  },
                  {
                    title: "Time-series store",
                    description:
                      "PostgreSQL + TimescaleDB for high-frequency sensor data.",
                  },
                ],
              },
              {
                group: "Analysis",
                modules: [
                  {
                    title: "FFT & modal analysis",
                    description:
                      "Welch PSD, STFT, wavelet analysis, frequency tracking, mode shapes.",
                  },
                  {
                    title: "Physics-informed FEM",
                    description:
                      "Finite-element comparison against live sensor telemetry.",
                  },
                  {
                    title: "AI anomaly detection",
                    description:
                      "Isolation Forest, autoencoders, LSTM and transformers — explainable.",
                  },
                ],
              },
              {
                group: "Assessment",
                modules: [
                  {
                    title: "Damage localization",
                    description:
                      "Component-level severity with evidence-based recommendations.",
                  },
                  {
                    title: "Computer vision",
                    description:
                      "Crack, spalling and corrosion analysis from inspection imagery.",
                  },
                  {
                    title: "Sensor health",
                    description:
                      "Detect drift, saturation, battery and calibration issues early.",
                  },
                ],
              },
              {
                group: "Operations",
                modules: [
                  {
                    title: "Smart alert engine",
                    description:
                      "Thresholds, severity, multi-channel email / SMS / push dispatch.",
                  },
                  {
                    title: "Automated reports",
                    description:
                      "FFT summaries, anomaly history, inspection recommendations.",
                  },
                  {
                    title: "Multi-tenant SaaS",
                    description:
                      "Tenant isolation, RBAC, subscriptions, and payments.",
                  },
                ],
              },
            ].map((column, i) => (
              <Motion key={column.group} variant="rise" index={i}>
                <h3 className="text-caption font-semibold tracking-tight text-sheet-ink">
                  {column.group}
                </h3>
                <dl className="mt-3 divide-y divide-sheet-ink/10 border-t border-sheet-ink/15">
                  {column.modules.map((m) => (
                    <div key={m.title} className="py-3">
                      <dt className="text-caption font-medium text-sheet-ink">
                        {m.title}
                      </dt>
                      <dd className="mt-1 text-caption leading-relaxed text-sheet-ink/55">
                        {m.description}
                      </dd>
                    </div>
                  ))}
                </dl>
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
                Access is role-based, and every action is recorded.
              </h2>
              <p className="mt-4 text-body leading-relaxed text-sheet-ink/55">
                Five roles, each scoped to what that job actually needs.
              </p>
            </div>
          </Motion>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                role: "Super Admin",
                desc: "Platform owner — tenants, billing, system health.",
                items: ["Tenants", "Billing", "Audit"],
              },
              {
                role: "Org Admin",
                desc: "Customer admin — users, structures, devices.",
                items: ["Users", "Structures"],
              },
              {
                role: "SHM Engineer",
                desc: "FFT, AI models, damage localization.",
                items: ["Analytics", "FFT", "Reports"],
              },
              {
                role: "Technician",
                desc: "Field ops — health, calibration, firmware.",
                items: ["Gateways", "Sensors"],
              },
              {
                role: "Viewer",
                desc: "Read-only dashboards, alerts, reports.",
                items: ["Dashboard", "Alerts"],
              },
            ].map((r, i) => (
              <Motion key={r.role} variant="ink" index={i}>
                {/* Same treatment as the module list: no icon tile, and no
                    invented ADMIN / ENG / FIELD / RO abbreviation set in tracked
                    mono. The role's name is the label; a second, shorter label
                    beside it was decoration standing in for information. */}
                <div className="flex h-full flex-col border-t border-sheet-ink/15 pt-4 text-left">
                  <h3 className="text-body font-semibold tracking-tight text-sheet-ink">
                    {r.role}
                  </h3>
                  <p className="mt-1.5 text-caption leading-relaxed text-sheet-ink/55">
                    {r.desc}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1 pt-3">
                    {r.items.map((item) => (
                      <span
                        key={item}
                        className="rounded bg-slate-100 px-2 py-0.5 font-mono text-label text-sheet-ink/55"
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
                Plans are priced by how much you monitor.
              </h2>
              <p className="mt-4 text-body leading-relaxed text-sheet-ink/55">
                Structures, sensors and users are the limits that change
                between plans.
              </p>
            </div>
          </Motion>

          {/* Two plans, so two columns — and capped in width, because two cards
              stretched across a three-column grid read as a row with something
              missing from it. The Enterprise tier remains sellable in billing;
              it is simply not advertised here. */}
          <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
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
                    <span className="absolute -top-3 left-6 rounded-full bg-sheet-ink px-3 py-1 font-mono text-label font-semibold uppercase tracking-[0.18em] text-white">
                      Most deployed
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-lead font-semibold tracking-tight text-sheet-ink">
                      {plan.name}
                    </h3>
                    <span className="font-mono text-label uppercase tracking-[0.18em] text-sheet-ink/45">
                      TIER 0{i + 1}
                    </span>
                  </div>
                  <p className="mt-1 text-caption text-sheet-ink/55">
                    {plan.desc}
                  </p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tracking-tight text-sheet-ink">
                      {plan.price}
                    </span>
                    <span className="text-label text-sheet-ink/45">
                      {plan.period}
                    </span>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2 border-t border-sheet-ink/10 pt-5">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-caption text-sheet-ink/70"
                      >
                        <CheckMark />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/login" className="mt-6">
                    {/* The same forward chevron the hero and closing CTAs carry.
                        Every primary action on the page now signals "this moves
                        you onward" the same way; without it these read as a
                        different KIND of control from the one in the hero. */}
                    <Button
                      className={`w-full ${
                        plan.featured
                          ? // Dark plate inverts to light. On a white card a
                            // white button would vanish, so it gains a 2px
                            // outline — drawn INSET, because a real border
                            // would resize the button under the cursor.
                            "hover:bg-sheet-paper hover:text-shm-navy-800 hover:shadow-[inset_0_0_0_2px_var(--color-shm-navy-800)]"
                          : // Light plate inverts to dark. The resting hover
                            // was sheet-ink at 15% — a grey barely separable
                            // from the resting grey, with the label unchanged.
                            "bg-slate-100 text-slate-800 hover:bg-shm-navy-800 hover:text-white"
                      }`}
                    >
                      Get started
                      <ChevronRight className="h-4 w-4" />
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
            {/* The page's own eyebrow component rather than a second, uppercase
                implementation of the same idea. Sentence case reads faster than
                a tracked all-caps run, and this is now the ONE way a section is
                labelled instead of two. */}
            <p className="mb-4 text-caption font-medium text-sheet-paper/70">
              Getting started
            </p>
            <h2 className="mb-5 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Start with a single structure.
            </h2>
            <p className="mx-auto mb-8 max-w-xl text-body leading-relaxed text-sheet-paper/70">
              Instrument one span or one pier, confirm the data reads the way
              you expect it to, and expand from there.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <ConsoleLink
                size="lg"
                className="w-full bg-white text-sheet-ink hover:bg-sheet-print sm:w-auto"
              >
                Go to Dashboard
              </ConsoleLink>
            
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
              <p className="mt-3 font-mono text-label uppercase tracking-[0.22em] text-sheet-ink/45">
                {TAGLINE}
              </p>
              <p className="mt-4 text-caption leading-relaxed text-sheet-ink/55">
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
                <h3 className="mb-3 font-mono text-label font-semibold uppercase tracking-[0.2em] text-sheet-ink">
                  {col.title}
                </h3>
                <ul className="space-y-2 text-caption text-sheet-ink/55">
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
            <p className="font-mono text-label text-sheet-ink/45">
              {/* Derived from the clock, so the notice does not silently go
                  stale on 1 January. */}
              © {new Date().getFullYear()} {COMPANY}
            </p>
            <div className="flex gap-5 font-mono text-label text-sheet-ink/45">
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
