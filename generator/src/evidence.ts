import type {
  Category,
  ChainNode,
  DynamicEvidenceItem,
  IOC,
  StaticEvidenceItem,
} from "./types.js";
import type { TemplateNode } from "./templates.js";
import {
  chance,
  intBetween,
  pick,
  pickN,
  randomHex,
  randomMd5,
  randomSha256,
  type Rng,
} from "./random.js";

// ---------------------------------------------------------------------------
// Static-analysis agent outputs
// ---------------------------------------------------------------------------

const ANDROID_PERMISSIONS = [
  "android.permission.READ_SMS",
  "android.permission.SEND_SMS",
  "android.permission.RECEIVE_SMS",
  "android.permission.READ_CONTACTS",
  "android.permission.RECORD_AUDIO",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.READ_PHONE_STATE",
  "android.permission.BIND_ACCESSIBILITY_SERVICE",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.QUERY_ALL_PACKAGES",
  "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
  "android.permission.REQUEST_INSTALL_PACKAGES",
  "android.permission.PACKAGE_USAGE_STATS",
] as const;

const YARA_RULES = [
  "android_overlay_attack",
  "joker_dropper_v3",
  "harly_inline_subscriber",
  "flubot_smish_worm",
  "anatsa_dropper",
  "wallet_drainer_eip712",
  "phishkit_telegram_relay",
  "spynote_stalker_v2",
  "adware_jobscheduler_loop",
  "cerberus_keylogger",
] as const;

const PACKAGE_NAMES = [
  "com.app.flashlight.{rand}",
  "com.{brand}.tracker.{rand}",
  "io.delivery.{brand}.{rand}",
  "com.wallpapers.hd.{rand}",
  "com.qrcode.scanner.{rand}",
  "com.pdf.reader.pro.{rand}",
  "com.file.cleaner.{rand}",
] as const;

const BRANDS = [
  "dhl", "fedex", "ups", "usps", "amazon", "outlook", "office365",
  "metamask", "phantom", "binance", "coinbase", "paypal",
];

export function buildStaticEvidence(
  rng: Rng,
  category: Category,
  family: string,
  tNode: TemplateNode,
  seedIoc: IOC,
): { items: StaticEvidenceItem[]; iocs: IOC[]; agentNote: string } {
  const items: StaticEvidenceItem[] = [];
  const iocs: IOC[] = [];

  // Hashes are present at "Initial Access" / "Execution" / "Defense Evasion" nodes
  if (/Initial Access|Execution|Defense Evasion|Resource Development/.test(tNode.tactic)) {
    const sha = seedIoc.type === "sha256" ? seedIoc.value : randomSha256(rng);
    const md5 = randomMd5(rng);
    items.push({ kind: "hash", label: "SHA256", value: sha, meta: { algo: "sha256" } });
    items.push({ kind: "hash", label: "MD5", value: md5, meta: { algo: "md5" } });
    iocs.push({ type: "sha256", value: sha, source: "static-agent" });
  }

  // Permissions for any mobile node
  if (category !== "phishing" || /Mobile|Overlay|SMS|Accessibility/.test(tNode.title)) {
    const perms = pickN(rng, ANDROID_PERMISSIONS, intBetween(rng, 3, 7));
    items.push({
      kind: "manifest_excerpt",
      label: "AndroidManifest.xml — uses-permission",
      value: perms.map((p) => `<uses-permission android:name="${p}"/>`).join("\n"),
      meta: { count: perms.length },
    });
    const pkg = pick(rng, PACKAGE_NAMES)
      .replace("{brand}", pick(rng, BRANDS))
      .replace("{rand}", randomHex(rng, 3));
    items.push({ kind: "manifest_excerpt", label: "Package name", value: pkg });
    iocs.push({ type: "package", value: pkg, source: "static-agent" });
  }

  // URL/Domain artifacts at C2 / web kit nodes
  if (/Command and Control|Resource Development|Initial Access|Execution|Credential Access/.test(tNode.tactic)) {
    if (seedIoc.type === "url") {
      items.push({ kind: "url_target", label: "Seed URL", value: seedIoc.value });
      try {
        const host = new URL(seedIoc.value).hostname;
        iocs.push({ type: "domain", value: host, source: "static-agent" });
      } catch {
        /* ignore */
      }
    }
    if (chance(rng, 0.5)) {
      const c2 = synthDomain(rng, family);
      items.push({ kind: "string_artifact", label: "Extracted string (C2)", value: `https://${c2}/api/v1/beacon` });
      iocs.push({ type: "domain", value: c2, source: "static-agent" });
    }
  }

  // YARA hit on a subset of nodes
  if (chance(rng, 0.6)) {
    const rule = pick(rng, YARA_RULES);
    items.push({
      kind: "yara_hit",
      label: `YARA: ${rule}`,
      value: `rule ${rule} matched at offset 0x${intBetween(rng, 0x1000, 0xffff).toString(16)} (${intBetween(rng, 2, 12)} strings)`,
      meta: { rule, strings: intBetween(rng, 2, 12) },
    });
  }

  // DOM snippet for phishing kits
  if (category === "phishing" && /Web Portal Capture|Malicious Link/.test(tNode.techniqueName)) {
    items.push({
      kind: "dom_snippet",
      label: "Captured form HTML",
      value: `<form action="/wp-content/themes/relay.php" method="POST">\n  <input name="email" type="email" required>\n  <input name="pwd" type="password" required>\n  <input type="hidden" name="b64" value="${randomHex(rng, 12)}">\n</form>`,
    });
  }

  // Cert / TLS data for phishing infrastructure
  if (category === "phishing" && tNode.key === "infra") {
    items.push({
      kind: "cert",
      label: "TLS certificate issuer",
      value: pick(rng, ["Let's Encrypt", "ZeroSSL", "Google Trust Services"]),
      meta: { validity_days: intBetween(rng, 30, 90) },
    });
  }

  const agentNote = staticAgentNote(rng, category, tNode);
  return { items, iocs, agentNote };
}

function staticAgentNote(rng: Rng, _cat: Category, tNode: TemplateNode): string {
  const verdicts = ["malicious", "suspicious", "high-confidence", "low-confidence"];
  return `Static researcher [${pick(rng, verdicts)}]: ${tNode.title.toLowerCase()} — ${intBetween(rng, 1, 12)} indicator(s) extracted, ${intBetween(rng, 0, 4)} YARA family match(es).`;
}

function synthDomain(rng: Rng, family: string): string {
  const tlds = ["xyz", "top", "click", "shop", "live", "ru", "cn", "su"];
  const seg = randomHex(rng, 3);
  return `${family.toLowerCase().replace(/[^a-z0-9]/g, "")}-${seg}.${pick(rng, tlds)}`;
}

// ---------------------------------------------------------------------------
// Dynamic-analysis agent outputs
// ---------------------------------------------------------------------------

const SYSCALLS = [
  "openat", "read", "write", "connect", "sendto", "recvfrom",
  "execve", "fork", "mmap", "ioctl",
];

export function buildDynamicEvidence(
  rng: Rng,
  category: Category,
  family: string,
  tNode: TemplateNode,
  seedIoc: IOC,
  stepIndex: number,
): { items: DynamicEvidenceItem[]; iocs: IOC[]; agentNote: string } {
  const items: DynamicEvidenceItem[] = [];
  const iocs: IOC[] = [];
  const t0 = stepIndex * 1500 + intBetween(rng, 0, 500);

  // Syscall trace bursts
  if (/Execution|Persistence|Defense Evasion|Privilege Escalation/.test(tNode.tactic)) {
    const burstCount = intBetween(rng, 3, 6);
    for (let i = 0; i < burstCount; i++) {
      items.push({
        kind: "syscall",
        label: pick(rng, SYSCALLS),
        value: `fd=${intBetween(rng, 3, 80)} args=[${randomHex(rng, 4)}, ${intBetween(rng, 0, 4096)}]`,
        timestamp: t0 + i * intBetween(rng, 5, 40),
      });
    }
  }

  // Network requests at C2, exfil, lure, infra nodes
  if (/Command and Control|Exfiltration|Initial Access|Resource Development|Execution/.test(tNode.tactic)) {
    const host = seedIoc.type === "url" ? safeHost(seedIoc.value) : synthDomain(rng, family);
    const path = pick(rng, ["/api/v1/beacon", "/relay.php", "/c2/checkin", "/upload", "/pull"]);
    items.push({
      kind: "network_request",
      label: `HTTPS POST ${host}${path}`,
      value: `→ ${intBetween(rng, 200, 4096)} bytes  ← ${intBetween(rng, 100, 8192)} bytes (${intBetween(rng, 30, 800)} ms)`,
      timestamp: t0 + intBetween(rng, 50, 800),
      meta: { method: "POST", host, path, status: 200 },
    });
    iocs.push({ type: "domain", value: host, source: "dynamic-agent" });
    if (chance(rng, 0.3)) {
      const ip = `${intBetween(rng, 1, 223)}.${intBetween(rng, 0, 255)}.${intBetween(rng, 0, 255)}.${intBetween(rng, 1, 254)}`;
      iocs.push({ type: "ip", value: ip, source: "dynamic-agent" });
    }
  }

  // SMS abuse / toll fraud
  if (category === "toll_fraud" && /SMS|Carrier|Subscription/.test(tNode.title)) {
    const shortcode = `${intBetween(rng, 1000, 9999)}`;
    items.push({
      kind: "sms_send",
      label: `SMS → ${shortcode}`,
      value: `body="OK ${randomHex(rng, 4).toUpperCase()}"  (premium shortcode)`,
      timestamp: t0 + intBetween(rng, 200, 1500),
      meta: { shortcode },
    });
    iocs.push({ type: "phone", value: shortcode, source: "dynamic-agent" });
  }

  // Permission grants
  if (/Privilege Escalation/.test(tNode.tactic) || /Accessibility|Admin/.test(tNode.title)) {
    items.push({
      kind: "permission_request",
      label: "Granted: BIND_ACCESSIBILITY_SERVICE",
      value: "Activity Settings$AccessibilityServiceSettingsActivity → user tapped 'Allow'",
      timestamp: t0 + intBetween(rng, 300, 2000),
    });
  }

  // UI capture (sandbox screenshot placeholder)
  if (chance(rng, 0.4)) {
    items.push({
      kind: "ui_capture",
      label: "Sandbox screenshot",
      value: `placeholder://ui/${tNode.key}-${randomHex(rng, 4)}.png`,
      timestamp: t0 + intBetween(rng, 100, 1200),
      meta: { width: 1080, height: 2400 },
    });
  }

  // Credential capture
  if (/Credential|Capture/.test(tNode.tactic) || /overlay|creds|keylogger/i.test(tNode.title)) {
    items.push({
      kind: "credential_capture",
      label: "Captured field",
      value: `field=password length=${intBetween(rng, 8, 24)} app=${pick(rng, ["com.bank.app", "com.wallet.metamask", "com.outlook.email", "com.netflix.app"])}`,
      timestamp: t0 + intBetween(rng, 400, 2200),
    });
  }

  // Process spawn / file write for droppers
  if (/Download New Code|Stage-2/.test(tNode.title + " " + tNode.techniqueName) || /dropper/i.test(tNode.title)) {
    items.push({
      kind: "file_write",
      label: "DEX dropped",
      value: `/data/data/{pkg}/files/${randomHex(rng, 6)}.dex (${intBetween(rng, 40, 800)} KB)`,
      timestamp: t0 + intBetween(rng, 600, 1800),
    });
    items.push({
      kind: "process_spawn",
      label: "dex2oat invoked",
      value: `argv=[/system/bin/dex2oat, --dex-file=…/${randomHex(rng, 4)}.dex]`,
      timestamp: t0 + intBetween(rng, 800, 2200),
    });
  }

  // Click-chain for phishing
  if (category === "phishing" && /click|lure|land/i.test(tNode.title + tNode.key)) {
    items.push({
      kind: "click_chain",
      label: "Redirect chain",
      value: `t.co/${randomHex(rng, 3)} → bit.ly/${randomHex(rng, 4)} → ${synthDomain(rng, family)}/landing`,
      timestamp: t0 + intBetween(rng, 0, 300),
    });
  }

  const agentNote = dynamicAgentNote(rng, category, tNode, items.length);
  return { items, iocs, agentNote };
}

function safeHost(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "unknown.invalid";
  }
}

function dynamicAgentNote(rng: Rng, _cat: Category, tNode: TemplateNode, count: number): string {
  const sandboxes = ["CAPE-android", "MobSF-dynamic", "Joe Mobile", "Frida-trace"];
  return `Dynamic researcher [${pick(rng, sandboxes)}]: ${count} event(s) captured during '${tNode.title.toLowerCase()}'. Behavior consistent with template.`;
}

// ---------------------------------------------------------------------------

export function buildChainNodeEvidence(
  rng: Rng,
  category: Category,
  family: string,
  tNode: TemplateNode,
  seedIoc: IOC,
  stepIndex: number,
): Pick<ChainNode, "evidence" | "iocs" | "agentNotes"> {
  const stat = buildStaticEvidence(rng, category, family, tNode, seedIoc);
  const dyn = buildDynamicEvidence(rng, category, family, tNode, seedIoc, stepIndex);
  return {
    evidence: { static: stat.items, dynamic: dyn.items },
    iocs: dedupeIocs([...stat.iocs, ...dyn.iocs]),
    agentNotes: { staticAgent: stat.agentNote, dynamicAgent: dyn.agentNote },
  };
}

function dedupeIocs(iocs: IOC[]): IOC[] {
  const seen = new Set<string>();
  const out: IOC[] = [];
  for (const i of iocs) {
    const k = `${i.type}|${i.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}
