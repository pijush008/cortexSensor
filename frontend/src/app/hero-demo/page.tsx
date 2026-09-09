import MetroHero from "@/components/ui/scroll-locked-video-hero";

// The hero reads shadcn-style tokens as hsl(var(--background)), which
// needs bare "H S% L%" channels. This app's own tokens are hex, so the
// `hsl-token-scope-dark` class (defined in globals.css) supplies the
// triplet form for this subtree only, leaving the global light theme
// untouched.
export default function DemoOne() {
  return <MetroHero className="hsl-token-scope-dark" />;
}
