---
name: make-interfaces-feel-better
description: Details that make interfaces feel better — typography, surfaces, animations, icons, performance. Use when building or reviewing UI code for polish.
---

## Details that make interfaces feel better

Great interfaces come from small details that compound. Identify the project's existing styling system and express changes in that system (Tailwind in a Tailwind project, plain CSS in a CSS project). Never introduce a second styling system just for polish.

When reviewing, slow the interface down: replay motion at 10% speed and walk every state: hover, focus, active, loading, empty.

## Quick Reference

| Category | When to Use |
| --- | --- |
| Typography | Text wrapping, font smoothing, tabular numbers |
| Surfaces | Border radius, optical alignment, shadows, image outlines, hit areas |
| Animations | Interruptible animations, enter/exit transitions, icon animations, scale on press, motion restraint |
| Icons | Icon stroke weight, states via `currentColor`, outline vs fill, sizing, RTL flipping |
| Performance | Transition specificity, `will-change` usage |

## Core Principles

1. Concentric border radius (outer radius = inner radius + padding)
2. Optical alignment over mathematical centering
3. Restrained, interruptible motion (transform/opacity only)
4. Icons inherit state color via currentColor

Source: https://www.skills.sh/jakubkrehel/make-interfaces-feel-better/make-interfaces-feel-better
