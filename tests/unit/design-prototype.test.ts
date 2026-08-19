import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyDesignOperations } from "$lib/modules/agent-room/application/services/DesignDocumentService.js";
import {
  designDocumentSchema,
  type DesignDocument,
} from "$lib/modules/agent-room/contracts/schemas/designSchemas.js";
import {
  applyMotionTracks,
  defaultPrototypeFlow,
  exportMotionCss,
  exportMotionDev,
  prototypeFrameElements,
} from "$lib/modules/agent-room/domain/design-prototype.js";

const NOW = "2026-08-17T12:00:00.000Z";

function fixture() {
  const pageId = randomUUID();
  const firstFrameId = randomUUID();
  const secondFrameId = randomUUID();
  const buttonId = randomUUID();
  const document = designDocumentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    nodeId: randomUUID(),
    workspaceId: randomUUID(),
    name: "Prototype",
    revision: 0,
    activePageId: pageId,
    pages: [
      { id: pageId, name: "Page 1", width: 1440, height: 1024, order: 0 },
    ],
    elements: [
      {
        id: firstFrameId,
        pageId,
        parentId: null,
        type: "frame",
        name: "Home",
        x: 0,
        y: 0,
        width: 390,
        height: 844,
        order: 0,
      },
      {
        id: buttonId,
        pageId,
        parentId: firstFrameId,
        type: "rectangle",
        name: "Continue",
        x: 24,
        y: 720,
        width: 342,
        height: 48,
        order: 0,
      },
      {
        id: secondFrameId,
        pageId,
        parentId: null,
        type: "frame",
        name: "Success",
        x: 480,
        y: 0,
        width: 390,
        height: 844,
        order: 1,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  });
  return { document, pageId, firstFrameId, secondFrameId, buttonId };
}

describe("Design prototype and motion", () => {
  it("keeps prototype flows and interactions in the revision-safe command bus", () => {
    const { document, firstFrameId, secondFrameId, buttonId } = fixture();
    const flowId = randomUUID();
    const interactionId = randomUUID();
    const next = applyDesignOperations(
      document,
      [
        {
          kind: "add-prototype-flow",
          flow: {
            id: flowId,
            name: "Checkout",
            description: "",
            startFrameId: firstFrameId,
            order: 0,
          },
        },
        {
          kind: "add-prototype-interaction",
          interaction: {
            id: interactionId,
            sourceElementId: buttonId,
            trigger: { type: "click", delayMs: 0 },
            action: { type: "navigate", targetFrameId: secondFrameId },
            transition: {
              type: "push",
              direction: "left",
              durationMs: 260,
              easing: { type: "preset", value: "ease-out" },
            },
            order: 0,
          },
        },
      ],
      NOW,
    );

    expect(defaultPrototypeFlow(next)?.id).toBe(flowId);
    expect(next.prototypeInteractions[0]).toMatchObject({
      sourceElementId: buttonId,
      action: { type: "navigate", targetFrameId: secondFrameId },
    });
    expect(
      new Set(
        prototypeFrameElements(next, firstFrameId).map((element) => element.id),
      ),
    ).toEqual(new Set([firstFrameId, buttonId]));
  });

  it("removes dangling prototype and motion references with their layer", () => {
    const { document, firstFrameId, secondFrameId, buttonId } = fixture();
    const populated = applyDesignOperations(
      document,
      [
        {
          kind: "add-prototype-flow",
          flow: {
            id: randomUUID(),
            name: "Main",
            description: "",
            startFrameId: firstFrameId,
            order: 0,
          },
        },
        {
          kind: "add-prototype-interaction",
          interaction: {
            id: randomUUID(),
            sourceElementId: buttonId,
            trigger: { type: "click", delayMs: 0 },
            action: { type: "navigate", targetFrameId: secondFrameId },
            transition: {
              type: "instant",
              direction: "left",
              durationMs: 0,
              easing: { type: "preset", value: "linear" },
            },
            order: 0,
          },
        },
        {
          kind: "add-motion-track",
          track: {
            id: randomUUID(),
            elementId: buttonId,
            name: "Button entrance",
            durationMs: 300,
            delayMs: 0,
            iterations: 1,
            direction: "normal",
            fillMode: "forwards",
            tokenId: null,
            easing: { type: "preset", value: "linear" },
            keyframes: [
              { id: randomUUID(), timeMs: 0, values: { opacity: 0 } },
              { id: randomUUID(), timeMs: 300, values: { opacity: 1 } },
            ],
            order: 0,
          },
        },
      ],
      NOW,
    );

    const deleted = applyDesignOperations(
      populated,
      [{ kind: "delete", elementId: firstFrameId }],
      NOW,
    );
    expect(deleted.prototypeFlows).toEqual([]);
    expect(deleted.prototypeInteractions).toEqual([]);
    expect(deleted.motionTracks).toEqual([]);
    expect(deleted.presentation.defaultFlowId).toBeNull();
  });

  it("samples keyframes and exports CSS and motion.dev without mutating the document", () => {
    const { document, buttonId } = fixture();
    const trackId = randomUUID();
    const animated = applyDesignOperations(
      document,
      [
        {
          kind: "add-motion-track",
          track: {
            id: trackId,
            elementId: buttonId,
            name: "Rise",
            durationMs: 400,
            delayMs: 0,
            iterations: 1,
            direction: "normal",
            fillMode: "forwards",
            tokenId: null,
            easing: { type: "preset", value: "linear" },
            keyframes: [
              {
                id: randomUUID(),
                timeMs: 0,
                values: { y: 760, opacity: 0, fill: "#000000" },
              },
              {
                id: randomUUID(),
                timeMs: 400,
                values: { y: 720, opacity: 1, fill: "#ffffff" },
              },
            ],
            order: 0,
          },
        },
      ],
      NOW,
    );
    const element = animated.elements.find(
      (candidate) => candidate.id === buttonId,
    )!;
    const sampled = applyMotionTracks(animated, [element], 200)[0];

    expect(sampled.y).toBe(740);
    expect(sampled.opacity).toBe(0.5);
    expect(sampled.fill).toBe("#808080");
    expect(exportMotionCss(animated, [trackId])).toContain(
      `data-design-element="${buttonId}"`,
    );
    expect(exportMotionCss(animated, [trackId])).toContain(
      "@keyframes orkestrai-",
    );
    expect(exportMotionDev(animated, [trackId])).toContain(
      "import { animate } from 'motion'",
    );
    expect(
      animated.elements.find((candidate) => candidate.id === buttonId)?.y,
    ).toBe(720);
  });

  it("rejects invalid targets and keyframes beyond the effective duration", () => {
    const { document, buttonId } = fixture();
    expect(() =>
      applyDesignOperations(
        document,
        [
          {
            kind: "add-prototype-interaction",
            interaction: {
              id: randomUUID(),
              sourceElementId: buttonId,
              trigger: { type: "click", delayMs: 0 },
              action: { type: "navigate", targetFrameId: randomUUID() },
              transition: {
                type: "instant",
                direction: "left",
                durationMs: 0,
                easing: { type: "preset", value: "linear" },
              },
              order: 0,
            },
          },
        ],
        NOW,
      ),
    ).toThrow("target frame");

    expect(() =>
      applyDesignOperations(
        document,
        [
          {
            kind: "add-motion-track",
            track: {
              id: randomUUID(),
              elementId: buttonId,
              name: "Invalid",
              durationMs: 200,
              delayMs: 0,
              iterations: 1,
              direction: "normal",
              fillMode: "forwards",
              tokenId: null,
              easing: { type: "preset", value: "linear" },
              keyframes: [
                { id: randomUUID(), timeMs: 0, values: {} },
                { id: randomUUID(), timeMs: 300, values: {} },
              ],
              order: 0,
            },
          },
        ],
        NOW,
      ),
    ).toThrow("duration");
  });

  it("adds backward-compatible defaults to existing schema v1 documents", () => {
    const source = fixture().document as unknown as Record<string, unknown>;
    delete source.prototypeFlows;
    delete source.prototypeInteractions;
    delete source.motionTokens;
    delete source.motionTracks;
    delete source.presentation;
    const parsed = designDocumentSchema.parse(source) as DesignDocument;

    expect(parsed.prototypeFlows).toEqual([]);
    expect(parsed.motionTracks).toEqual([]);
    expect(parsed.presentation).toMatchObject({
      defaultFlowId: null,
      showDeviceFrame: true,
    });
  });
});
