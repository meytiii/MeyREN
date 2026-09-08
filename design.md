# Design — MeyREN Gateway

Locked design system for MeyREN. Future Hallmark runs read this file first; pages and components defer to it. Amend intentionally — the file is the rule.

## System
- Genre · atmospheric / modern-minimal
- Macrostructure · Workbench (Operational Gateway Dashboard)
- Theme · Midnight / Neon Slate (Dual-Mode Cyber-Glow)
- Axes · dark (< 15% L) & light (> 90% L) / geometric-sans (Inter + Vazirmatn) / cool (cyan 190° + purple 280°)
- Locales · LTR (English) & RTL (Persian / Vazirmatn)

## Tokens (canonical · `style.css` is the source of truth)

```css
/* Dark Theme (Default) */
html[data-theme="dark"] {
  --bg: #06070d;
  --bg-gradient: radial-gradient(circle at 12% 20%, rgba(0, 242, 254, 0.12), transparent 32%),
                radial-gradient(circle at 88% 75%, rgba(168, 85, 247, 0.14), transparent 38%),
                radial-gradient(circle at 50% 50%, rgba(121, 40, 202, 0.07), transparent 50%);
  --glass: rgba(13, 14, 28, 0.75);
  --glass-border: rgba(168, 85, 247, 0.22);
  --surface: #0f1021;
  --surface2: rgba(22, 25, 48, 0.75);
  --surface3: #1f2244;
  --border: rgba(255, 255, 255, 0.10);
  --border2: rgba(168, 85, 247, 0.35);
  --border-neon-blue: rgba(0, 242, 254, 0.45);
  --border-neon-purple: rgba(168, 85, 247, 0.45);

  --text: #f8fafc;
  --text2: #cbd5e1;
  --text3: #94a3b8;

  --primary: #00f2fe;
  --primary-gradient: linear-gradient(135deg, #00f2fe 0%, #38bdf8 40%, #a855f7 100%);
  --neon-blue: #00f2fe;
  --neon-purple: #a855f7;
  --neon-pink: #f43f5e;
  --primary-glow: rgba(0, 242, 254, 0.35);
  --purple-glow: rgba(168, 85, 247, 0.40);
  --primary-dim: rgba(0, 242, 254, 0.14);
  --purple-dim: rgba(168, 85, 247, 0.16);

  --green: #10b981;
  --green-glow: rgba(16, 185, 129, 0.35);
  --green-dim: rgba(16, 185, 129, 0.15);
  --red: #f43f5e;
  --red-glow: rgba(244, 63, 94, 0.35);
  --red-dim: rgba(244, 63, 94, 0.15);
  --yellow: #fbbf24;
  --yellow-glow: rgba(251, 191, 36, 0.35);
  --yellow-dim: rgba(251, 191, 36, 0.15);

  --sidebar-bg: rgba(9, 10, 22, 0.90);
  --shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(121, 40, 202, 0.15);
  --shadow-neon: 0 0 20px rgba(0, 242, 254, 0.25), 0 0 40px rgba(168, 85, 247, 0.2);
}

/* Light Theme */
html[data-theme="light"] {
  --bg: #f5f6fa;
  --bg-gradient: radial-gradient(circle at 10% 20%, rgba(2, 132, 199, 0.08), transparent 30%),
                radial-gradient(circle at 90% 80%, rgba(147, 51, 234, 0.07), transparent 35%);
  --glass: rgba(255, 255, 255, 0.88);
  --glass-border: rgba(147, 51, 234, 0.20);
  --surface: #ffffff;
  --surface2: #f1f3f9;
  --surface3: #e2e8f0;
  --border: rgba(0, 0, 0, 0.10);
  --border2: rgba(147, 51, 234, 0.30);
  --border-neon-blue: rgba(2, 132, 199, 0.40);
  --border-neon-purple: rgba(147, 51, 234, 0.40);

  --text: #0f172a;
  --text2: #334155;
  --text3: #64748b;

  --primary: #0284c7;
  --primary-gradient: linear-gradient(135deg, #0284c7 0%, #38bdf8 50%, #9333ea 100%);
  --neon-blue: #0284c7;
  --neon-purple: #9333ea;
  --neon-pink: #e11d48;
  --primary-glow: rgba(2, 132, 199, 0.25);
  --purple-glow: rgba(147, 51, 234, 0.25);
  --primary-dim: rgba(2, 132, 199, 0.10);
  --purple-dim: rgba(147, 51, 234, 0.10);

  --green: #059669;
  --green-glow: rgba(5, 150, 105, 0.25);
  --green-dim: rgba(5, 150, 105, 0.12);
  --red: #e11d48;
  --red-glow: rgba(225, 29, 72, 0.25);
  --red-dim: rgba(225, 29, 72, 0.12);
  --yellow: #b45309;
  --yellow-glow: rgba(217, 119, 6, 0.25);
  --yellow-dim: rgba(217, 119, 6, 0.12);

  --sidebar-bg: rgba(255, 255, 255, 0.92);
  --shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  --shadow-neon: 0 0 16px rgba(2, 132, 199, 0.18);
}
```

## Typography
- Latin: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
- Persian / RTL: `'Vazirmatn', 'Inter', sans-serif`
- Code / Monospace: `'SF Mono', Monaco, Consolas, monospace`
- Hierarchy: 24px Page Title, 14px Card Title, 13px Body/Table, 11px Meta/Badge, 10px Sub-label.

## CTA Voice
- Primary · `linear-gradient(135deg, #00f2fe, #38bdf8, #a855f7)` · radius 10px-12px · white bold text
- Secondary · `var(--surface2)` with `var(--border)` border · radius 10px · `var(--text)`
- Action Chips / Tags · Pill radius (999px) or 6px-8px · high-contrast glow on hover
- Danger · `var(--red-dim)` fill with `var(--red)` text · radius 7px-10px

## Motion Stance
- Durations: Fast (180ms) for button hover/active, Base (240ms) for modal reveals and page transitions.
- Timing: `cubic-bezier(0.16, 1, 0.3, 1)` for smooth spring-like feel.
- Reduced-motion fallback: `transition: opacity 150ms ease` with zero transform offsets.

## Bi-Directional (LTR/RTL) Rules
- Layout mirroring: Sidebar anchors to `left: 0` in LTR, `right: 0` in RTL.
- Mobile off-canvas: LTR transforms from `-100%`, RTL transforms from `+100%` (anchored at `right: 0`).
- Bi-directional numeric/technical data (speed, byte units, IP, domains, ports, percentages) MUST be wrapped in `<bdi>` or `dir="ltr"` to prevent RTL number reversal.
