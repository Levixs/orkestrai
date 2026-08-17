import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("builds and plays a native interactive prototype", async ({
  page,
  request,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "orkestrai-prototype-e2e-"));
  const originalSettings = (
    await (await request.get("/api/agent-room/settings")).json()
  ).data as Record<string, string>;
  const workspace = (
    await (
      await request.post("/api/agent-room/workspaces", {
        data: { name: `E2E prototype ${Date.now()}`, workingDir: dir },
      })
    ).json()
  ).data as { id: string };
  const node = (
    await (
      await request.post(`/api/agent-room/workspaces/${workspace.id}/nodes`, {
        data: {
          type: "design",
          title: "Checkout prototype",
          x: 120,
          y: 120,
          width: 720,
          height: 520,
          payload: {},
        },
      })
    ).json()
  ).data as { id: string };
  const initial = (
    await (
      await request.get(
        `/api/agent-room/workspaces/${workspace.id}/designs/${node.id}`,
      )
    ).json()
  ).data as {
    revision: number;
    activePageId: string;
  };
  const startFrameId = randomUUID();
  const targetFrameId = randomUUID();
  const sourceId = randomUUID();
  const flowId = randomUUID();
  const interactionId = randomUUID();
  const tokenId = randomUUID();
  const trackId = randomUUID();

  await request.patch(
    `/api/agent-room/workspaces/${workspace.id}/designs/${node.id}`,
    {
      data: {
        baseRevision: initial.revision,
        operations: [
          {
            kind: "create",
            element: {
              id: startFrameId,
              pageId: initial.activePageId,
              parentId: null,
              type: "frame",
              name: "Start",
              x: 100,
              y: 100,
              width: 390,
              height: 700,
              fill: "#f8fafc",
              prototypeOverflow: "vertical",
            },
          },
          {
            kind: "create",
            element: {
              id: sourceId,
              pageId: initial.activePageId,
              parentId: startFrameId,
              type: "rectangle",
              name: "Continue",
              x: 136,
              y: 650,
              width: 318,
              height: 64,
              fill: "#7c3aed",
              cornerRadius: 16,
            },
          },
          {
            kind: "create",
            element: {
              id: targetFrameId,
              pageId: initial.activePageId,
              parentId: null,
              type: "frame",
              name: "Success",
              x: 600,
              y: 100,
              width: 390,
              height: 700,
              fill: "#ecfdf5",
            },
          },
          {
            kind: "add-prototype-flow",
            flow: {
              id: flowId,
              name: "Checkout experience",
              description: "Start to success",
              startFrameId,
              order: 0,
            },
          },
          {
            kind: "add-prototype-interaction",
            interaction: {
              id: interactionId,
              sourceElementId: sourceId,
              trigger: { type: "click", delayMs: 0 },
              action: { type: "navigate", targetFrameId },
              transition: {
                type: "push",
                direction: "left",
                durationMs: 180,
                easing: { type: "preset", value: "ease-out" },
              },
              order: 0,
            },
          },
          {
            kind: "add-motion-token",
            token: {
              id: tokenId,
              name: "Expressive entrance",
              durationMs: 320,
              easing: { type: "preset", value: "ease-out" },
              order: 0,
            },
          },
          {
            kind: "add-motion-track",
            track: {
              id: trackId,
              elementId: sourceId,
              name: "Button entrance",
              durationMs: 320,
              delayMs: 0,
              iterations: 1,
              direction: "normal",
              fillMode: "forwards",
              tokenId,
              easing: { type: "preset", value: "ease-out" },
              keyframes: [
                { id: randomUUID(), timeMs: 0, values: { y: 670, opacity: 0 } },
                {
                  id: randomUUID(),
                  timeMs: 320,
                  values: { y: 650, opacity: 1 },
                },
              ],
              order: 0,
            },
          },
          {
            kind: "update-presentation",
            changes: {
              defaultFlowId: flowId,
              showDeviceFrame: true,
              showHotspots: true,
            },
          },
        ],
        summary: "Seed interactive prototype",
        actor: { kind: "user", id: null, name: null, taskId: null },
      },
    },
  );
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await request.put("/api/agent-room/settings", {
      data: { ...originalSettings, uiLanguage: "en" },
    });
    await page.goto(
      `/canvas?workspace=${workspace.id}&node=${node.id}&design=1`,
    );
    const editor = page.locator('[data-testid="canvas-design-mode"]');
    await expect(editor).toBeVisible();

    await editor
      .getByRole("button", { name: "Prototype", exact: true })
      .click();
    await expect
      .poll(() =>
        editor
          .locator("input")
          .evaluateAll((inputs) =>
            inputs.map((input) => (input as HTMLInputElement).value),
          ),
      )
      .toContain("Checkout experience");
    await editor.getByRole("button", { name: "Motion", exact: true }).click();
    await expect
      .poll(() =>
        editor
          .locator("input")
          .evaluateAll((inputs) =>
            inputs.map((input) => (input as HTMLInputElement).value),
          ),
      )
      .toContain("Expressive entrance");

    await editor
      .getByRole("button", { name: "Play prototype", exact: true })
      .click();
    const player = page.locator("[data-design-prototype-player]");
    await expect(player).toBeVisible();
    await expect(
      player.locator(`[data-design-element="${sourceId}"]`),
    ).toBeVisible();
    await player
      .locator(
        `[data-design-element="${sourceId}"] > rect[pointer-events="visiblePainted"]`,
      )
      .dispatchEvent("click");
    await expect(
      player.locator(`[data-design-element="${targetFrameId}"]`),
    ).toBeVisible();
    await expect(
      player.getByRole("button", { name: "Back", exact: true }),
    ).toBeEnabled();
    await player.getByRole("button", { name: "Back", exact: true }).click();
    await expect(
      player.locator(`[data-design-element="${sourceId}"]`),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    if (!page.isClosed()) await page.goto("about:blank");
    await request.put("/api/agent-room/settings", { data: originalSettings });
    await request.delete(`/api/agent-room/workspaces/${workspace.id}`);
    rmSync(dir, { recursive: true, force: true });
  }
});
