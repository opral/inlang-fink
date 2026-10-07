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
    "example": false,
    "icon": "https://avatars.githubusercontent.com/u/197418917?v=4&s=80"
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
    "example": false,
    "icon": "https://avatars.githubusercontent.com/u/159686715?v=4&s=80"
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
    "example": false,
    "icon": "https://avatars.githubusercontent.com/u/236685631?v=4&s=80"
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
    "example": false,
    "icon": "https://avatars.githubusercontent.com/u/23456686?v=4&s=80"
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
    "example": false,
    "icon": "https://avatars.githubusercontent.com/u/183740260?v=4&s=80"
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
    "example": true,
    "icon": "https://avatars.githubusercontent.com/u/72518640?v=4&s=80"
  }
] as const;
export type Showcase = (typeof showcases)[number];
