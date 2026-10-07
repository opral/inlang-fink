export const SHOWCASES_CHECKED = "2026-10-07";
export const showcases = [
  {
    "name": "Pocket ID",
    "description": "Passkey sign-in for self-hosted apps.",
    "repository": "pocket-id/pocket-id",
    "branch": "main",
    "projectPath": "frontend/project.inlang",
    "stars": 9421,
    "contributors": 104,
    "locales": 26,
    "commits30d": 82,
    "example": false
  },
  {
    "name": "Clash Nyanpasu",
    "description": "A desktop interface for Clash proxy tools.",
    "repository": "libnyanpasu/clash-nyanpasu",
    "branch": "main",
    "projectPath": "frontend/nyanpasu/project.inlang",
    "stars": 13219,
    "contributors": 60,
    "locales": 5,
    "commits30d": 100,
    "example": false
  },
  {
    "name": "Arcane",
    "description": "Docker management for your homelab.",
    "repository": "getarcaneapp/arcane",
    "branch": "main",
    "projectPath": "frontend/project.inlang",
    "stars": 7759,
    "contributors": 89,
    "locales": 23,
    "commits30d": 100,
    "example": false
  },
  {
    "name": "UpSnap",
    "description": "Wake and manage devices on your network.",
    "repository": "seriousm4x/UpSnap",
    "branch": "master",
    "projectPath": "frontend/project.inlang",
    "stars": 6332,
    "contributors": 41,
    "locales": 23,
    "commits30d": 14,
    "example": false
  },
  {
    "name": "JetKVM",
    "description": "Control computers remotely through a browser.",
    "repository": "jetkvm/kvm",
    "branch": "dev",
    "projectPath": "ui/localization/jetKVM.UI.inlang",
    "stars": 5223,
    "contributors": 68,
    "locales": 15,
    "commits30d": 79,
    "example": false
  },
  {
    "name": "TanStack Router",
    "description": "Explore the Paraglide integration example.",
    "repository": "TanStack/router",
    "branch": "main",
    "projectPath": "examples/react/i18n-paraglide/project.inlang",
    "stars": 15156,
    "contributors": 463,
    "locales": 2,
    "commits30d": 100,
    "example": true
  }
] as const;
export type Showcase = (typeof showcases)[number];
