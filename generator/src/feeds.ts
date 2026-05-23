import { request } from "undici";
import type { Category, IOC } from "./types.js";

export interface FeedSeed {
  category: Category;
  source: string;
  family: string;
  firstSeen: string;
  ioc: IOC;
  tags: string[];
}

const FETCH_TIMEOUT_MS = 15_000;

async function fetchText(
  url: string,
  init: { method?: "GET" | "POST"; body?: string; headers?: Record<string, string> } = {},
  redirects = 0,
): Promise<string | null> {
  try {
    const { body, statusCode, headers } = await request(url, {
      method: init.method ?? "GET",
      body: init.body,
      headers: { "user-agent": "darkseed/0.1 (research)", ...(init.headers ?? {}) },
      headersTimeout: FETCH_TIMEOUT_MS,
      bodyTimeout: FETCH_TIMEOUT_MS,
    });
    // Follow up to 3 redirects manually (undici doesn't auto-follow)
    if (statusCode >= 300 && statusCode < 400 && redirects < 3) {
      const loc = headers.location;
      if (typeof loc === "string") {
        const next = new URL(loc, url).toString();
        await body.dump();
        return fetchText(next, init, redirects + 1);
      }
    }
    if (statusCode >= 400) {
      console.warn(`[feeds] ${url} → HTTP ${statusCode}`);
      await body.dump();
      return null;
    }
    return await body.text();
  } catch (err) {
    console.warn(`[feeds] ${url} → ${(err as Error).message}`);
    return null;
  }
}

// ---------- MalwareBazaar ----------
// API v1 POST endpoint — returns recent additions; no auth required for "get_recent".
async function fetchMalwareBazaar(): Promise<FeedSeed[]> {
  const text = await fetchText("https://mb-api.abuse.ch/api/v1/", {
    method: "POST",
    body: "query=get_recent&selector=time",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as { query_status?: string; data?: Array<Record<string, unknown>> };
    const data = parsed.data ?? [];
    const seeds: FeedSeed[] = [];
    for (const e of data) {
      const sha256 = String(e.sha256_hash ?? "");
      if (!sha256) continue;
      const sigRaw = String(e.signature ?? "Unknown");
      const tagsRaw = Array.isArray(e.tags) ? (e.tags as string[]) : [];
      const tags = tagsRaw.map(String);
      const fileType = String(e.file_type ?? "").toLowerCase();
      const category = classifyMalwareBazaar(sigRaw, tags, fileType);
      if (!category) continue;
      seeds.push({
        category,
        source: "MalwareBazaar",
        family: sigRaw === "Unknown" ? guessFamily(tags) : sigRaw,
        firstSeen: String(e.first_seen ?? new Date().toISOString()),
        ioc: { type: "sha256", value: sha256, source: "MalwareBazaar" },
        tags,
      });
    }
    console.log(`[feeds] MalwareBazaar → ${seeds.length} seeds (status=${parsed.query_status})`);
    return seeds;
  } catch (err) {
    console.warn(`[feeds] MalwareBazaar parse failed: ${(err as Error).message}`);
    return [];
  }
}

function classifyMalwareBazaar(sig: string, tags: string[], fileType: string): Category | null {
  const all = [sig, ...tags, fileType].join(" ").toLowerCase();
  if (/joker|harly|vesub|toll|premiumsms|wapbilling/.test(all)) return "toll_fraud";
  if (/flubot|smishing|phish|credstealer|spynote.*phish|teabot|sharkbot|anatsa/.test(all)) return "phishing";
  if (/android|apk|spyware|stalker|adware|riskware|hiddad|tordow|cerberus|hydra/.test(all)) return "riskware";
  return null;
}

function guessFamily(tags: string[]): string {
  for (const t of tags) {
    if (/^[A-Z][a-zA-Z]{3,}$/.test(t)) return t;
  }
  return tags[0] ?? "Unknown";
}

// ---------- URLhaus ----------
// CSV feed: https://urlhaus.abuse.ch/downloads/csv_recent/
async function fetchUrlhaus(): Promise<FeedSeed[]> {
  const text = await fetchText("https://urlhaus.abuse.ch/downloads/csv_recent/");
  if (!text) return [];
  const seeds: FeedSeed[] = [];
  const lines = text.split("\n");
  for (const raw of lines) {
    if (!raw || raw.startsWith("#")) continue;
    const cols = parseCsvLine(raw);
    if (cols.length < 8) continue;
    const [, dateAdded, url, , , threat, tagsCsv] = cols;
    if (!url) continue;
    const tags = (tagsCsv ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const category = classifyUrlhaus(threat ?? "", tags);
    if (!category) continue;
    seeds.push({
      category,
      source: "URLhaus",
      family: tags[0] ?? threat ?? "Unknown",
      firstSeen: dateAdded ?? new Date().toISOString(),
      ioc: { type: "url", value: url, source: "URLhaus" },
      tags,
    });
  }
  console.log(`[feeds] URLhaus → ${seeds.length} seeds`);
  return seeds;
}

function classifyUrlhaus(threat: string, tags: string[]): Category | null {
  // URLhaus is primarily a malware-payload-URL feed (threat==malware_download for
  // nearly every entry). We only keep an entry if its TAGS narrow it to one of
  // our three buckets — otherwise it's noise (Windows commodity malware).
  const tagStr = tags.join(" ").toLowerCase();
  if (/phish|credential|login/.test(tagStr)) return "phishing";
  if (/joker|toll|premium|wapbilling|harly|vesub/.test(tagStr)) return "toll_fraud";
  if (/(^|\s)(android|apk)(\s|$)|spynote|cerberus|hydra|flubot|sharkbot|teabot|anatsa/.test(tagStr)) return "riskware";
  // Fall back: explicit phishing in threat field
  if (/phish/.test(threat.toLowerCase())) return "phishing";
  return null;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ---------- OpenPhish ----------
// Free community feed (plain text, one URL per line): https://openphish.com/feed.txt
async function fetchOpenPhish(): Promise<FeedSeed[]> {
  const text = await fetchText("https://openphish.com/feed.txt");
  if (!text) return [];
  const seeds: FeedSeed[] = [];
  const now = new Date().toISOString();
  for (const url of text.split("\n").map((s) => s.trim()).filter(Boolean)) {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    seeds.push({
      category: "phishing",
      source: "OpenPhish",
      family: guessPhishingFamily(host, url),
      firstSeen: now,
      ioc: { type: "url", value: url, source: "OpenPhish" },
      tags: ["phishing", hostBrand(host)].filter(Boolean) as string[],
    });
  }
  console.log(`[feeds] OpenPhish → ${seeds.length} seeds`);
  return seeds;
}

function hostBrand(host: string): string {
  const h = host.toLowerCase();
  const brands = [
    "microsoft", "office365", "outlook", "google", "gmail", "facebook", "instagram",
    "netflix", "paypal", "amazon", "apple", "icloud", "dhl", "fedex", "ups", "usps",
    "irs", "wellsfargo", "chase", "boa", "metamask", "coinbase", "binance",
  ];
  return brands.find((b) => h.includes(b)) ?? "generic";
}

function guessPhishingFamily(host: string, url: string): string {
  const brand = hostBrand(host);
  const isMobileLanding = /\/(apk|download|update|verify)/i.test(url);
  if (isMobileLanding) return "FluBot-style";
  if (brand === "metamask" || brand === "coinbase" || brand === "binance") return "Wallet-Drainer";
  if (brand !== "generic") return `${cap(brand)}Kit`;
  return "GenericKit";
}

function cap(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// ---------- Public entry ----------

const MIN_PER_CATEGORY = 50;

export async function fetchAllSeeds(): Promise<FeedSeed[]> {
  const [mb, uh, op] = await Promise.all([
    fetchMalwareBazaar(),
    fetchUrlhaus(),
    fetchOpenPhish(),
  ]);
  const live = [...mb, ...uh, ...op];
  console.log(`[feeds] live seeds: ${live.length}`);

  // Count per category; supplement any category under MIN_PER_CATEGORY from fallback
  const byCat: Record<Category, FeedSeed[]> = {
    riskware: [],
    toll_fraud: [],
    phishing: [],
  };
  for (const s of live) byCat[s.category].push(s);
  const fb = fallbackSeeds();
  const fbByCat: Record<Category, FeedSeed[]> = {
    riskware: fb.filter((s) => s.category === "riskware"),
    toll_fraud: fb.filter((s) => s.category === "toll_fraud"),
    phishing: fb.filter((s) => s.category === "phishing"),
  };
  const out: FeedSeed[] = [];
  for (const cat of Object.keys(byCat) as Category[]) {
    out.push(...byCat[cat]);
    if (byCat[cat].length < MIN_PER_CATEGORY) {
      const need = MIN_PER_CATEGORY - byCat[cat].length;
      console.warn(`[feeds] ${cat} live=${byCat[cat].length}; mixing in ${Math.min(need, fbByCat[cat].length)} fallback`);
      out.push(...fbByCat[cat].slice(0, need));
    }
  }
  console.log(`[feeds] total seeds: ${out.length}`);
  return out;
}

// Bundled fallback so generation works fully offline (CI, airgapped dev).
// These are well-known, public, historically-reported samples — provided here
// only as deterministic placeholders so the synthetic chains can still be built.
function fallbackSeeds(): FeedSeed[] {
  const seeds: FeedSeed[] = [];
  const families = {
    riskware: ["Hiddad", "Triada", "RuMMS", "Anubis", "Cerberus", "Hydra", "TeaBot", "Anatsa", "Sharkbot"],
    toll_fraud: ["Joker", "Harly", "Vesub", "ExpensiveWall", "BreadJoker"],
    phishing: ["FluBot", "MaliBot", "TangleBot", "M0useKit", "16ShopKit", "Caffeine"],
  } as const;
  const now = new Date().toISOString();
  let i = 0;
  for (const [cat, fams] of Object.entries(families) as [Category, readonly string[]][]) {
    for (const fam of fams) {
      for (let n = 0; n < 25; n++) {
        i++;
        const isUrl = cat === "phishing";
        seeds.push({
          category: cat,
          source: "fallback",
          family: fam,
          firstSeen: now,
          ioc: isUrl
            ? {
                type: "url",
                value: `https://${fam.toLowerCase()}-${i}.example.invalid/landing`,
                source: "fallback",
              }
            : {
                type: "sha256",
                value: pseudoHash(`${fam}-${i}`),
                source: "fallback",
              },
          tags: [cat, fam.toLowerCase()],
        });
      }
    }
  }
  return seeds;
}

function pseudoHash(s: string): string {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  // Expand to 64 hex chars deterministically
  let out = "";
  let x = h >>> 0;
  for (let i = 0; i < 16; i++) {
    x = Math.imul(x ^ (x >>> 13), 0x5bd1e995);
    out += x.toString(16).padStart(8, "0").slice(0, 4);
  }
  return out.slice(0, 64);
}
