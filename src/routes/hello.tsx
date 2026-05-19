import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/anchorwrite/BrandMark";
import {
  ArrowRight,
  Tag,
  SquareDashed,
  Search,
  Shield,
  FileText,
  MonitorSmartphone,
  Loader2,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/hello")({
  component: HelloPage,
  head: () => ({
    meta: [
      { title: "Welcome to AnchorWrite" },
      {
        name: "description",
        content:
          "AnchorWrite makes your scanned handwritten PDFs searchable — locally, in your browser.",
      },
    ],
  }),
});

const COUNTER_WORKSPACE = "anchorwrite-app";
const GLOBAL_COUNTER_KEY = "visits";
const SEEN_COUNTRIES_KEY = "anchorwrite:seen-countries";

interface CountryInfo {
  code: string; // ISO-2
  name: string;
}

interface RibbonEntry {
  code: string;
  name: string;
  count: number;
}

// Convert ISO-2 country code to flag emoji via regional indicator symbols.
function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return "🏳️";
  const cc = code.toUpperCase();
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

async function bumpCounter(key: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.counterapi.dev/v1/${COUNTER_WORKSPACE}/${encodeURIComponent(key)}/up`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { count?: number };
    return typeof json.count === "number" ? json.count : null;
  } catch {
    return null;
  }
}

async function readCounter(key: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.counterapi.dev/v1/${COUNTER_WORKSPACE}/${encodeURIComponent(key)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { count?: number };
    return typeof json.count === "number" ? json.count : null;
  } catch {
    return null;
  }
}

async function detectCountry(): Promise<CountryInfo | null> {
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { country_code?: string; country_name?: string };
    if (!json.country_code) return null;
    return {
      code: json.country_code.toUpperCase(),
      name: json.country_name || json.country_code.toUpperCase(),
    };
  } catch {
    return null;
  }
}

function loadSeenCountries(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SEEN_COUNTRIES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveSeenCountries(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_COUNTRIES_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function HelloPage() {
  const [visitorNumber, setVisitorNumber] = useState<number | null>(null);
  const [country, setCountry] = useState<CountryInfo | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [ribbon, setRibbon] = useState<RibbonEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [c, n] = await Promise.all([detectCountry(), bumpCounter(GLOBAL_COUNTER_KEY)]);
      if (cancelled) return;

      if (c) setCountry(c);
      if (n !== null) setVisitorNumber(n);

      // Update per-country counter + seen list
      const seen = loadSeenCountries();
      if (c) {
        seen[c.code] = c.name;
        saveSeenCountries(seen);
        await bumpCounter(`country-${c.code.toLowerCase()}`);
      }

      // Fetch counts for ribbon (cap to keep requests light)
      const codes = Object.keys(seen).slice(0, 24);
      const results = await Promise.all(
        codes.map(async (code) => {
          const count = await readCounter(`country-${code.toLowerCase()}`);
          return { code, name: seen[code], count: count ?? 0 } satisfies RibbonEntry;
        }),
      );
      if (cancelled) return;
      const filtered = results
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count);
      setRibbon(filtered);
      setStatsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const ordinal = visitorNumber !== null ? toOrdinal(visitorNumber) : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandMark size={28} />
          <span className="font-semibold tracking-tight">AnchorWrite</span>
        </div>
        <Link
          to="/"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip intro →
        </Link>
      </header>

      <main className="flex-1">
        {/* Hero / greeting */}
        <section className="px-6 pt-16 pb-12 max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Local-first · Browser-native · No accounts
          </div>
          <h1 className="mt-6 text-4xl sm:text-5xl font-semibold tracking-tight">
            Welcome to AnchorWrite
          </h1>
          <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
            A lightweight semantic search layer for your handwritten PDFs.
            Tag pages and regions, export a normal PDF, and use Ctrl+F to navigate notes you'd otherwise never find again.
          </p>

          <div className="mt-8 inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
            {statsLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Counting visitors…</span>
              </>
            ) : ordinal && country ? (
              <>
                <span className="text-lg leading-none">{flagEmoji(country.code)}</span>
                <span>
                  You are the <span className="font-semibold">{ordinal}</span> visitor from{" "}
                  <span className="font-semibold">{country.name}</span>
                </span>
              </>
            ) : ordinal ? (
              <span>
                You are the <span className="font-semibold">{ordinal}</span> visitor
              </span>
            ) : (
              <span className="text-muted-foreground">Welcome, traveler.</span>
            )}
          </div>

          {/* Mobile warning */}
          <div className="mt-6 mx-auto max-w-md flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-left text-amber-900 dark:text-amber-200">
            <MonitorSmartphone className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              AnchorWrite currently works best on desktop and laptop devices. Mobile support is
              limited.
            </span>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 pb-16 max-w-3xl mx-auto">
          <div className="border-t border-border pt-12">
            <h2 className="text-2xl font-semibold tracking-tight text-center">
              How AnchorWrite works
            </h2>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-xl mx-auto">
              You write by hand. AnchorWrite gives those pages a memory.
            </p>

            <div className="mt-10 space-y-8">
              <Step
                icon={<FileText className="h-4 w-4" />}
                title="1. Upload your scanned PDF"
                body="Drop in a scan of your handwritten notes, lecture notebook, sketchbook, or journal. Everything stays in your browser — your file is never uploaded to a server."
              />
              <Step
                icon={<Tag className="h-4 w-4" />}
                title="2. Tag pages with what they're about"
                body="Open a page, switch to Page tags, and add a few short keywords describing its content. These are semantic anchors — not transcriptions. You decide what the page should be findable as."
              />
              <Step
                icon={<SquareDashed className="h-4 w-4" />}
                title="3. Or tag specific regions"
                body="Need to find one diagram, one paragraph, one equation? Draw a box around it and attach tags. AnchorWrite embeds invisible searchable text exactly at that location."
              />
              <Step
                icon={<Search className="h-4 w-4" />}
                title="4. Export and use Ctrl+F anywhere"
                body="Export a normal PDF. The visuals are byte-identical to your original — handwriting untouched. But Ctrl+F in any PDF reader will now jump to the pages and regions you tagged."
              />
              <Step
                icon={<FileText className="h-4 w-4" />}
                title="5. A glossary you can navigate"
                body="Every export gets a clean glossary page listing all your tags with clickable links to their pages and regions. Think of it as a semantic table of contents that travels with the file."
              />
              <Step
                icon={<Shield className="h-4 w-4" />}
                title="Privacy by design"
                body="No accounts. No uploads. No analytics on your documents. AnchorWrite is a static web app — it runs entirely in your browser, and your PDFs never leave your machine."
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 pb-20">
          <div className="max-w-md mx-auto text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground text-background px-5 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Proceed to site
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              Free, open, and entirely client-side.
            </p>
          </div>
        </section>
      </main>

      {/* Flag counter ribbon */}
      <footer className="border-t border-border bg-muted/30 overflow-hidden">
        <div className="px-6 py-2 text-[10px] uppercase tracking-wider text-muted-foreground text-center">
          Visitors around the world
        </div>
        <div className="relative h-10 overflow-hidden">
          {ribbon.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              {statsLoading ? "Loading flag counter…" : "Be the first visitor on the map."}
            </div>
          ) : (
            <div className="flag-ribbon flex items-center gap-6 whitespace-nowrap py-2 pr-6">
              {[...ribbon, ...ribbon].map((entry, i) => (
                <div
                  key={`${entry.code}-${i}`}
                  className="inline-flex items-center gap-2 text-xs"
                >
                  <span className="text-base leading-none">{flagEmoji(entry.code)}</span>
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {entry.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </footer>

      <style>{`
        @keyframes anchorwrite-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .flag-ribbon {
          animation: anchorwrite-marquee 45s linear infinite;
          width: max-content;
        }
        .flag-ribbon:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

function Step({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="h-8 w-8 shrink-0 rounded-md border border-border bg-background flex items-center justify-center text-foreground">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function toOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n.toLocaleString()}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
