export type HelpItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
  href?: string;
  linkLabel?: string;
  keywords: string[];
};

export const SUPPORT_EMAIL = "james@farmvoicerecords.com";

export const helpItems: HelpItem[] = [
  {
    id: "getting-started",
    category: "Getting started",
    question: "How do I get started with FarmVoice?",
    answer:
      "Sign in, confirm you are in the correct farm, then start with Field records, Fields, or Team. Farm owners can invite workers with the farm join code. The Getting Started tour on this Help page walks through the main workflow.",
    href: "/records",
    linkLabel: "Open Field records",
    keywords: ["start", "setup", "new", "tour", "first", "begin"],
  },
  {
    id: "worker-phone",
    category: "Team",
    question: "Does every worker need a phone or FarmVoice login?",
    answer:
      "No. Core includes one-phone crew records at Team → Crew: an owner or authorized supervisor records a roster without worker accounts. H-2A crew records can also be maintained by an authorized owner, administrator, or crew leader. Workers who use the individual GPS time clock need their own FarmVoice account and a device when clocking in or out.",
    href: "/team",
    linkLabel: "Open Team",
    keywords: ["worker", "phone", "login", "crew", "device"],
  },
  {
    id: "join",
    category: "Team",
    question: "How does a worker join my farm?",
    answer:
      "Open Team as the farm owner and copy the complete worker join code. The worker signs in with their own account, opens Join farm, and enters the complete code. Farm join codes and employee numbers are different.",
    href: "/join",
    linkLabel: "Open Join farm",
    keywords: ["join", "code", "employee", "worker", "invite"],
  },
  {
    id: "gps",
    category: "GPS & time",
    question: "Does FarmVoice continuously track workers?",
    answer:
      "No. FarmVoice captures GPS only when a supported feature requests it, such as clock-in, clock-out, a record capture, or an evidence capture. It is not designed for continuous background employee tracking.",
    href: "/team",
    linkLabel: "Open Team",
    keywords: ["gps", "track", "tracking", "location", "continuous", "clock"],
  },
  {
    id: "clock",
    category: "GPS & time",
    question: "How do workers clock in and out?",
    answer:
      "A signed-in worker opens Team, enters or confirms the job and field, then uses Clock in with GPS. At the end of work they use Clock out with GPS. The owner can review completed time before approval.",
    href: "/team",
    linkLabel: "Open Team",
    keywords: ["clock", "time", "hours", "gps", "worker", "payroll"],
  },
  {
    id: "approve-time",
    category: "GPS & time",
    question: "How do I approve time for payroll?",
    answer:
      "Open Team as the owner, review completed time entries, and approve or reject them. Approved completed time can be exported as CSV and, after employee mapping, sent through the QuickBooks integration.",
    href: "/team",
    linkLabel: "Review Team time",
    keywords: ["approve", "payroll", "time", "csv", "hours"],
  },
  {
    id: "quickbooks",
    category: "QuickBooks",
    question: "How do I connect QuickBooks Online?",
    answer:
      "Open QuickBooks from the main navigation as the farm owner and choose the connection workflow. After authorization, map FarmVoice workers to the correct QuickBooks employees before sending approved time.",
    href: "/integrations/quickbooks",
    linkLabel: "Open QuickBooks",
    keywords: ["quickbooks", "qbo", "intuit", "connect", "accounting"],
  },
  {
    id: "quickbooks-reconnect",
    category: "QuickBooks",
    question: "What if QuickBooks disconnects or authorization expires?",
    answer:
      "Open the QuickBooks integration page and reconnect the farm's QuickBooks company. FarmVoice includes reconnect handling and troubleshooting references. If the problem continues, contact support and include the approximate time and any Intuit request ID shown.",
    href: "/integrations/quickbooks",
    linkLabel: "Troubleshoot QuickBooks",
    keywords: [
      "quickbooks",
      "disconnect",
      "reconnect",
      "expired",
      "token",
      "intuit",
      "error",
    ],
  },
  {
    id: "pesticide",
    category: "Field records",
    question: "How do I record a pesticide application?",
    answer:
      "Open Field records, speak or type the application details, optionally capture GPS, select the field, and review every value. Restricted-use pesticide records cannot be confirmed until the record checklist fields are complete.",
    href: "/records",
    linkLabel: "Open Field records",
    keywords: ["pesticide", "rup", "application", "epa", "spray", "record"],
  },
  {
    id: "compliance",
    category: "Compliance",
    question: "Does FarmVoice guarantee regulatory compliance?",
    answer:
      "No. FarmVoice is a recordkeeping and workflow tool. Completeness checks, reminders, templates, and organized records can help, but the farm remains responsible for verifying records against applicable law, pesticide labels, contracts, wage requirements, and agency rules.",
    href: "/terms",
    linkLabel: "Read Terms",
    keywords: [
      "compliance",
      "legal",
      "guarantee",
      "law",
      "regulation",
      "certify",
    ],
  },
  {
    id: "photos",
    category: "Smart Photo Evidence",
    question: "How do I attach a photo or PDF to a record?",
    answer:
      "Use Smart Photo Evidence on a supported saved record. On mobile, FarmVoice can request the camera; you can also choose an existing image or supported PDF. Evidence is stored privately and indexed to the farm and target record.",
    href: "/records",
    linkLabel: "Open Field records",
    keywords: ["photo", "camera", "picture", "pdf", "evidence", "upload"],
  },
  {
    id: "usda",
    category: "Fields",
    question: "How do I import USDA/FSA field boundaries?",
    answer:
      "Open Fields and choose Import USDA fields. Upload the farmers.gov shapefile ZIP or GeoJSON file. On supported installed web apps, Share to FarmVoice can also route the downloaded file into the importer.",
    href: "/fields/import",
    linkLabel: "Import USDA fields",
    keywords: [
      "usda",
      "fsa",
      "field",
      "boundary",
      "shapefile",
      "geojson",
      "clu",
      "import",
    ],
  },
  {
    id: "h2a",
    category: "H-2A",
    question: "What H-2A records can FarmVoice keep?",
    answer:
      "FarmVoice includes H-2A contracts, worker rosters, daily crew records, hours offered/worked, piecework, housing, transportation, training, recruitment, separations, wage history, payroll worksheets, acknowledgments, documents, audit exports, and supporting photo evidence.",
    href: "/h2a",
    linkLabel: "Open H-2A",
    keywords: [
      "h2a",
      "worker",
      "contract",
      "crew",
      "transportation",
      "training",
      "recruitment",
    ],
  },
  {
    id: "housing",
    category: "H-2A",
    question: "How does H-2A housing recordkeeping work?",
    answer:
      "The Housing workspace tracks properties, occupancy, certificates, inspections, checklist findings, corrective actions, repair evidence, recurring checks, and audit packets. FarmVoice does not itself determine legal compliance.",
    href: "/h2a/housing",
    linkLabel: "Open Housing",
    keywords: [
      "housing",
      "inspection",
      "occupancy",
      "certificate",
      "corrective",
      "repair",
      "h2a",
    ],
  },
  {
    id: "storage",
    category: "Account",
    question: "How much storage is included?",
    answer:
      "FarmVoice Core includes 100 GB of farm photo and document storage, enough for most farms including thousands of job photos and years of workforce and field records. Uploads pause at the 100 GB allowance. Pricing shows your usage. Additional capacity requires an agreed plan through support; there are no automatic overage charges.",
    keywords: ["storage", "gb", "100", "photos", "limit", "space"],
  },
  {
    id: "price",
    category: "Account",
    question: "What does FarmVoice cost?",
    answer:
      "FarmVoice Core is $49/month with unlimited workers; H-2A is a $149/month add-on. Annual billing offers two months free. New farms start a 14-day trial. Review the Pricing page for the current offer before subscribing.",
    href: "/billing",
    linkLabel: "Open Pricing",
    keywords: [
      "price",
      "cost",
      "49",
      "trial",
      "billing",
      "subscription",
      "unlimited",
    ],
  },
  {
    id: "security",
    category: "Account",
    question: "How is farm data protected?",
    answer:
      "FarmVoice uses authenticated accounts, farm-scoped access controls, row-level security, private evidence storage, and additional MFA protection for privileged H-2A roles. Users should still protect their account credentials and devices.",
    href: "/privacy",
    linkLabel: "Read Privacy Policy",
    keywords: ["security", "private", "privacy", "mfa", "data", "protected"],
  },
  {
    id: "support",
    category: "Support",
    question: "How do I contact FarmVoice support?",
    answer:
      "Email james@farmvoicerecords.com. Include your farm name, the page you were using, your device/browser, and the visible error message. Never send passwords, access tokens, QuickBooks secrets, or payment-card details.",
    keywords: ["support", "help", "contact", "email", "error"],
  },
];

export function findHelpItems(query: string, limit = 4, minScore = 2) {
  const normalized = query.toLowerCase().trim();
  if (!normalized) return helpItems.slice(0, limit);

  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "can",
    "do",
    "does",
    "for",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "on",
    "or",
    "the",
    "to",
    "what",
    "with",
  ]);
  const terms = normalized
    .split(/[^a-z0-9-]+/)
    .filter((term) => term.length > 1 && !stopWords.has(term));

  return helpItems
    .map((item) => {
      const keywords = new Set(
        item.keywords.map((keyword) => keyword.toLowerCase()),
      );
      const questionTokens = new Set(
        item.question
          .toLowerCase()
          .split(/[^a-z0-9-]+/)
          .filter(Boolean),
      );
      const categoryTokens = new Set(
        item.category
          .toLowerCase()
          .split(/[^a-z0-9-]+/)
          .filter(Boolean),
      );
      const answerTokens = new Set(
        item.answer
          .toLowerCase()
          .split(/[^a-z0-9-]+/)
          .filter(Boolean),
      );
      const score = terms.reduce((total, term) => {
        if (keywords.has(term)) return total + 5;
        if (questionTokens.has(term)) return total + 3;
        if (categoryTokens.has(term)) return total + 2;
        if (answerTokens.has(term)) return total + 1;
        return total;
      }, 0);
      return { item, score };
    })
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}
