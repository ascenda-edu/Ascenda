# Design Overhaul Proposal

## Goal
Transform the current "bland" application into a premium, modern, and visually engaging experience. The new design will focus on depth, sophisticated typography, and a refined color palette.

## 1. Color Palette: "Deep Cosmos"
Move away from the standard slate/gray to a rich, deep palette inspired by the "Ascenda" name (rising, space, future).

| Token | Current Hex | Proposed Hex | Description |
| :--- | :--- | :--- | :--- |
| `bg-background` | `#f5f5f7` | `#030712` | Deepest charcoal/navy (almost black) for a premium dark mode feel. |
| `text-foreground` | `#1c1c1c` | `#f8fafc` | High-contrast white/off-white for readability. |
| `primary` | `#0b1224` | `#6366f1` | Vibrant Indigo/Violet gradient for primary actions. |
| `secondary` | `#e9f1fa` | `#1e293b` | Muted slate blue for secondary elements. |
| `accent` | `#a8d5e3` | `#38bdf8` | Electric Sky Blue for highlights and active states. |

**Why?** Dark interfaces with vibrant accents feel more "tech-forward" and premium.

## 2. Typography: "Modern & Geometric"
Replace the system font stack with a curated Google Font pairing.

*   **Headings:** `Outfit` or `Space Grotesk` – Geometric, modern, and distinctive.
*   **Body:** `Inter` or `Plus Jakarta Sans` – Clean, highly legible, and professional.

## 3. Visual Effects: "Glass & Glow"
*   **Glassmorphism:** Use `backdrop-filter: blur(12px)` with semi-transparent backgrounds for cards and modals to create depth.
*   **Glows:** Add subtle colored shadows (`shadow-[0_0_50px_-12px_rgba(99,102,241,0.25)]`) behind key elements to make them "pop".
*   **Borders:** Use thin, semi-transparent borders (`border-white/10`) instead of heavy solid lines.

## 4. Component Refinements

### Buttons
*   **Current:** Solid colors with simple hover states.
*   **Proposed:** Gradient backgrounds, subtle inner glows, and scale animations on click.

### Cards
*   **Current:** Flat white backgrounds with standard shadows.
*   **Proposed:** Dark glass backgrounds, large border radius (`rounded-3xl`), and hover lift effects.

## Implementation Plan
1.  **Install Fonts:** Add `Outfit` and `Inter` via `next/font`.
2.  **Update Tailwind Config:** Define the new color palette and font families.
3.  **Refactor `globals.css`:** Implement CSS variables for the new theme.
4.  **Update Components:** Refactor `Button`, `Card`, and `Input` to use the new tokens.

## Preview
> "Imagine a dashboard that looks like a cockpit for your future—dark, sleek, with glowing indicators guiding you to your dream university."
