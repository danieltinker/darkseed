import type { Category, Tactic } from "./types.js";

export interface TemplateNode {
  key: string; // unique within template
  techniqueId: string;
  techniqueName: string;
  tactic: Tactic;
  title: string;
  description: string;
  // edges: list of nodes this one points TO (forward edges)
  next?: string[];
}

export interface Template {
  id: string;
  category: Category;
  // Optional weight for selection (default 1)
  weight?: number;
  nodes: TemplateNode[];
}

// ---------------------------------------------------------------------------
// PHISHING — web kits + mobile-app smishing/FluBot-style flows
// ---------------------------------------------------------------------------

const PHISH_WEBKIT: Template = {
  id: "phish.webkit_creds",
  category: "phishing",
  nodes: [
    {
      key: "infra",
      techniqueId: "T1583.001",
      techniqueName: "Acquire Infrastructure: Domains",
      tactic: "Resource Development",
      title: "Adversary registers lookalike domain",
      description: "Newly-registered domain mimicking the target brand is provisioned with cheap TLD and free TLS cert.",
      next: ["lure"],
    },
    {
      key: "lure",
      techniqueId: "T1566.002",
      techniqueName: "Spearphishing Link",
      tactic: "Initial Access",
      title: "Lure email/SMS delivered to victim",
      description: "Lure references account verification, package delivery, or payroll. Contains shortened link to the kit landing page.",
      next: ["click"],
    },
    {
      key: "click",
      techniqueId: "T1204.001",
      techniqueName: "User Execution: Malicious Link",
      tactic: "Execution",
      title: "Victim opens the link",
      description: "Browser follows the redirect chain to the cloaked kit landing page.",
      next: ["cloak"],
    },
    {
      key: "cloak",
      techniqueId: "T1027.011",
      techniqueName: "Obfuscated Files or Information: Fileless Storage",
      tactic: "Defense Evasion",
      title: "Anti-bot cloaking gates the page",
      description: "Page inspects user-agent, Referer, ASN; serves benign content to crawlers and the kit to victims.",
      next: ["render"],
    },
    {
      key: "render",
      techniqueId: "T1056.003",
      techniqueName: "Input Capture: Web Portal Capture",
      tactic: "Collection",
      title: "Fake login page rendered",
      description: "Pixel-perfect clone of the target brand login is shown; static assets often pulled from the real site.",
      next: ["creds"],
    },
    {
      key: "creds",
      techniqueId: "T1056.003",
      techniqueName: "Input Capture: Web Portal Capture",
      tactic: "Credential Access",
      title: "Credentials captured",
      description: "Form submission POSTs username/password to a relay endpoint (often via Telegram bot or webhook).",
      next: ["mfa"],
    },
    {
      key: "mfa",
      techniqueId: "T1621",
      techniqueName: "Multi-Factor Authentication Request Generation",
      tactic: "Credential Access",
      title: "MFA bypass prompt shown",
      description: "Victim is prompted for one-time code; relayed in real time to the attacker session (AitM).",
      next: ["exfil"],
    },
    {
      key: "exfil",
      techniqueId: "T1041",
      techniqueName: "Exfiltration Over C2 Channel",
      tactic: "Exfiltration",
      title: "Credentials exfiltrated to operator",
      description: "Captured tuple (username, password, OTP, cookies) shipped to operator dashboard / Telegram channel.",
    },
  ],
};

const PHISH_MOBILE_SMISH: Template = {
  id: "phish.mobile_smish",
  category: "phishing",
  nodes: [
    {
      key: "smish",
      techniqueId: "T1660",
      techniqueName: "Phishing (Mobile)",
      tactic: "Initial Access",
      title: "Smishing SMS delivered",
      description: "SMS impersonating courier (DHL/FedEx/USPS) with link to APK or credential page.",
      next: ["land"],
    },
    {
      key: "land",
      techniqueId: "T1204.001",
      techniqueName: "User Execution: Malicious Link",
      tactic: "Execution",
      title: "Landing page convinces user to sideload",
      description: "Site detects mobile UA, instructs user to enable 'unknown sources' and install a 'tracking app'.",
      next: ["install"],
    },
    {
      key: "install",
      techniqueId: "T1660",
      techniqueName: "User Installs Sideloaded App",
      tactic: "Execution",
      title: "APK sideloaded by victim",
      description: "Dropper installs payload masquerading as the courier app.",
      next: ["perms"],
    },
    {
      key: "perms",
      techniqueId: "T1626.001",
      techniqueName: "Abuse Elevation Control Mechanism: Device Administrator",
      tactic: "Privilege Escalation",
      title: "Accessibility + admin permissions requested",
      description: "Overlay nags user until Accessibility Service and Device Admin are granted.",
      next: ["overlay"],
    },
    {
      key: "overlay",
      techniqueId: "T1417.002",
      techniqueName: "Input Capture: GUI Input Capture (Overlay)",
      tactic: "Credential Access",
      title: "Bank/wallet overlays activated",
      description: "Banking and wallet apps are detected at launch; overlay form steals credentials and 2FA seeds.",
      next: ["smsint", "contacts"],
    },
    {
      key: "smsint",
      techniqueId: "T1636.004",
      techniqueName: "Protected User Data: SMS Messages",
      tactic: "Collection",
      title: "SMS interception for OTPs",
      description: "Default-SMS-handler swap allows the malware to read and suppress OTP messages.",
      next: ["exfil"],
    },
    {
      key: "contacts",
      techniqueId: "T1636.003",
      techniqueName: "Protected User Data: Contact List",
      tactic: "Collection",
      title: "Contact list harvested",
      description: "Address book used for worm-style propagation of the smishing SMS.",
      next: ["worm"],
    },
    {
      key: "worm",
      techniqueId: "T1582",
      techniqueName: "SMS Control",
      tactic: "Impact",
      title: "Worm propagation via victim's SMS",
      description: "New smish messages sent from the victim's number to every contact.",
    },
    {
      key: "exfil",
      techniqueId: "T1646",
      techniqueName: "Exfiltration Over C2 Channel",
      tactic: "Exfiltration",
      title: "Credentials + OTPs exfiltrated",
      description: "Stolen data shipped to operator C2 over HTTPS or MQTT.",
    },
  ],
};

const PHISH_WALLET_DRAINER: Template = {
  id: "phish.wallet_drainer",
  category: "phishing",
  weight: 0.6,
  nodes: [
    {
      key: "ads",
      techniqueId: "T1583.008",
      techniqueName: "Acquire Infrastructure: Malvertising",
      tactic: "Resource Development",
      title: "Malicious Google/X ad placed",
      description: "Sponsored search result for 'metamask login' / 'phantom wallet' points to drainer kit.",
      next: ["land"],
    },
    {
      key: "land",
      techniqueId: "T1204.001",
      techniqueName: "User Execution: Malicious Link",
      tactic: "Execution",
      title: "Victim lands on lookalike wallet site",
      description: "Wallet UI is cloned; 'connect wallet' button triggers signature request.",
      next: ["sig"],
    },
    {
      key: "sig",
      techniqueId: "T1056.003",
      techniqueName: "Input Capture: Web Portal Capture",
      tactic: "Credential Access",
      title: "Malicious signature requested",
      description: "EIP-712 permit / setApprovalForAll signature trick allows draining without seed phrase.",
      next: ["drain"],
    },
    {
      key: "drain",
      techniqueId: "T1657",
      techniqueName: "Financial Theft",
      tactic: "Impact",
      title: "Wallet drained",
      description: "On signature, tokens and NFTs are swept to attacker-controlled address.",
    },
  ],
};

// ---------------------------------------------------------------------------
// TOLL FRAUD — Joker / Harly / Vesub-style premium-SMS and WAP billing
// ---------------------------------------------------------------------------

const TOLL_JOKER: Template = {
  id: "toll.joker_dropper",
  category: "toll_fraud",
  nodes: [
    {
      key: "store",
      techniqueId: "T1475",
      techniqueName: "Deliver Malicious App via Authorized App Store",
      tactic: "Initial Access",
      title: "Trojanized utility published to app store",
      description: "Wallpaper/QR/file-manager app passes review with clean payload; loads stage-2 post-install.",
      next: ["dropper"],
    },
    {
      key: "dropper",
      techniqueId: "T1407",
      techniqueName: "Download New Code at Runtime",
      tactic: "Defense Evasion",
      title: "Stage-2 DEX fetched from CDN",
      description: "Innocuous-looking 'config.json' actually returns a base64 DEX dropped to /data/data.",
      next: ["notif"],
    },
    {
      key: "notif",
      techniqueId: "T1517",
      techniqueName: "Access Notifications",
      tactic: "Collection",
      title: "Notification listener enabled",
      description: "Used to silently dismiss carrier confirmation notifications for premium subscriptions.",
      next: ["wap"],
    },
    {
      key: "wap",
      techniqueId: "T1448",
      techniqueName: "Carrier Billing Fraud",
      tactic: "Impact",
      title: "WAP billing subscription initiated",
      description: "Headless WebView visits operator portal, parses tokens, auto-confirms premium subscription.",
      next: ["smshide"],
    },
    {
      key: "smshide",
      techniqueId: "T1582",
      techniqueName: "SMS Control",
      tactic: "Defense Evasion",
      title: "Confirmation SMS suppressed",
      description: "Incoming carrier SMS is intercepted and deleted before the user sees it.",
      next: ["sustain"],
    },
    {
      key: "sustain",
      techniqueId: "T1453",
      techniqueName: "Abuse of Accessibility Services",
      tactic: "Persistence",
      title: "Subscription kept active",
      description: "Accessibility Service auto-confirms renewals and dismisses any user-facing cancellation prompts.",
    },
  ],
};

const TOLL_HARLY: Template = {
  id: "toll.harly_inline",
  category: "toll_fraud",
  weight: 0.7,
  nodes: [
    {
      key: "store",
      techniqueId: "T1475",
      techniqueName: "Deliver Malicious App via Authorized App Store",
      tactic: "Initial Access",
      title: "Self-contained utility app installed",
      description: "Unlike Joker, no stage-2 — full subscription logic shipped inside the APK.",
      next: ["disable"],
    },
    {
      key: "disable",
      techniqueId: "T1407",
      techniqueName: "Download New Code at Runtime",
      tactic: "Defense Evasion",
      title: "Wi-Fi disabled, mobile data forced",
      description: "App toggles Wi-Fi off to force routing through carrier (required for direct carrier billing).",
      next: ["wap"],
    },
    {
      key: "wap",
      techniqueId: "T1448",
      techniqueName: "Carrier Billing Fraud",
      tactic: "Impact",
      title: "Premium subscription confirmed in WebView",
      description: "Hidden WebView automates the operator portal flow end-to-end.",
      next: ["smshide"],
    },
    {
      key: "smshide",
      techniqueId: "T1582",
      techniqueName: "SMS Control",
      tactic: "Defense Evasion",
      title: "Carrier OTPs read and hidden",
      description: "OTP read from inbox, submitted to confirm, then deleted.",
    },
  ],
};

// ---------------------------------------------------------------------------
// RISKWARE — spyware/stalkerware-adjacent, aggressive adware, banking-RAT base
// ---------------------------------------------------------------------------

const RISK_SPYWARE: Template = {
  id: "risk.spyware",
  category: "riskware",
  nodes: [
    {
      key: "sideload",
      techniqueId: "T1476",
      techniqueName: "Deliver Malicious App via Other Means",
      tactic: "Initial Access",
      title: "App sideloaded from third-party store",
      description: "Cracked-app or 'tracker' download from a third-party APK mirror.",
      next: ["accperm"],
    },
    {
      key: "accperm",
      techniqueId: "T1626.001",
      techniqueName: "Abuse Elevation Control Mechanism: Device Administrator",
      tactic: "Privilege Escalation",
      title: "Accessibility Service granted",
      description: "Pop-up loop coerces user into enabling Accessibility Service.",
      next: ["mic", "loc", "contacts"],
    },
    {
      key: "mic",
      techniqueId: "T1429",
      techniqueName: "Audio Capture",
      tactic: "Collection",
      title: "Ambient audio recording",
      description: "MediaRecorder triggered on motion or schedule; audio chunks uploaded.",
      next: ["c2"],
    },
    {
      key: "loc",
      techniqueId: "T1430",
      techniqueName: "Location Tracking",
      tactic: "Collection",
      title: "GPS location polled",
      description: "FusedLocationProviderClient polled every N seconds and posted to C2.",
      next: ["c2"],
    },
    {
      key: "contacts",
      techniqueId: "T1636.003",
      techniqueName: "Protected User Data: Contact List",
      tactic: "Collection",
      title: "Contact list exfiltrated",
      description: "ContactsContract queried and uploaded in single batch.",
      next: ["c2"],
    },
    {
      key: "c2",
      techniqueId: "T1437.001",
      techniqueName: "Application Layer Protocol: Web Protocols",
      tactic: "Command and Control",
      title: "HTTPS C2 beacon",
      description: "Periodic POST to operator panel; tasks pulled, results pushed.",
      next: ["persist"],
    },
    {
      key: "persist",
      techniqueId: "T1624",
      techniqueName: "Event Triggered Execution",
      tactic: "Persistence",
      title: "Boot + connectivity receivers",
      description: "BOOT_COMPLETED and CONNECTIVITY_CHANGE receivers respawn the agent on device boot or network change.",
    },
  ],
};

const RISK_BANKING: Template = {
  id: "risk.banking_rat",
  category: "riskware",
  nodes: [
    {
      key: "sideload",
      techniqueId: "T1476",
      techniqueName: "Deliver Malicious App via Other Means",
      tactic: "Initial Access",
      title: "Dropper sideloaded as 'PDF Reader'",
      description: "Small dropper installed; bypasses Play Protect with low initial perms.",
      next: ["accperm"],
    },
    {
      key: "accperm",
      techniqueId: "T1626.001",
      techniqueName: "Abuse Elevation Control Mechanism: Device Administrator",
      tactic: "Privilege Escalation",
      title: "Accessibility Service abused",
      description: "Accessibility used to auto-click through subsequent permission dialogs.",
      next: ["overlay", "kbd"],
    },
    {
      key: "overlay",
      techniqueId: "T1417.002",
      techniqueName: "Input Capture: GUI Input Capture (Overlay)",
      tactic: "Credential Access",
      title: "Overlay attacks on banking apps",
      description: "Target package list pulled from C2; overlay shown over each target on launch.",
      next: ["exfil"],
    },
    {
      key: "kbd",
      techniqueId: "T1417.001",
      techniqueName: "Input Capture: Keylogging",
      tactic: "Credential Access",
      title: "Accessibility keylogger",
      description: "All TYPE_VIEW_TEXT_CHANGED events captured; PII and passwords logged.",
      next: ["exfil"],
    },
    {
      key: "exfil",
      techniqueId: "T1646",
      techniqueName: "Exfiltration Over C2 Channel",
      tactic: "Exfiltration",
      title: "Credentials shipped to operator",
      description: "Captures aggregated per-victim and posted in batches.",
    },
  ],
};

const RISK_ADWARE: Template = {
  id: "risk.aggr_adware",
  category: "riskware",
  weight: 0.5,
  nodes: [
    {
      key: "store",
      techniqueId: "T1475",
      techniqueName: "Deliver Malicious App via Authorized App Store",
      tactic: "Initial Access",
      title: "Free utility installed",
      description: "Flashlight/wallpaper/QR app with bundled aggressive ad SDK.",
      next: ["sdkinit"],
    },
    {
      key: "sdkinit",
      techniqueId: "T1407",
      techniqueName: "Download New Code at Runtime",
      tactic: "Defense Evasion",
      title: "Ad SDK fetches runtime config",
      description: "Server-side config flips the SDK from passive to interstitial-spam mode after N days.",
      next: ["bgads"],
    },
    {
      key: "bgads",
      techniqueId: "T1624",
      techniqueName: "Event Triggered Execution",
      tactic: "Persistence",
      title: "Out-of-app interstitials",
      description: "JobScheduler triggers full-screen ads even when app is not in foreground.",
      next: ["fpdata"],
    },
    {
      key: "fpdata",
      techniqueId: "T1422",
      techniqueName: "System Information Discovery",
      tactic: "Discovery",
      title: "Device fingerprint harvested",
      description: "Install list, IMEI/AAID, carrier, build props sent to ad network for targeting.",
    },
  ],
};

// ---------------------------------------------------------------------------

export const TEMPLATES: Template[] = [
  PHISH_WEBKIT,
  PHISH_MOBILE_SMISH,
  PHISH_WALLET_DRAINER,
  TOLL_JOKER,
  TOLL_HARLY,
  RISK_SPYWARE,
  RISK_BANKING,
  RISK_ADWARE,
];

export function templatesForCategory(cat: Category): Template[] {
  return TEMPLATES.filter((t) => t.category === cat);
}
