import { describe, expect, it, vi } from 'vitest';
import {
  capturePortalSelection,
  portalInspectorSource,
  portalScreenshotFile,
  portalSelectionExists,
  type PortalWebviewElement,
} from '$lib/components/agent-room/portal-design-inspector.js';
import type { PortalDesignCapture } from '$lib/modules/agent-room/contracts/schemas/portal-design-feedback.schema.js';

const capture: PortalDesignCapture = {
  selector: '#cta', tagName: 'button', html: '<button id="cta">Buy</button>', text: 'Buy',
  role: 'button', ariaLabel: 'Buy', rect: { x: 4, y: 6, width: 100, height: 30 },
  viewport: { width: 320, height: 240, deviceScaleFactor: 2 },
  page: { origin: 'https://example.com', path: '/', title: 'Example' },
  styles: {
    display: 'block', position: 'static', color: 'black', backgroundColor: 'white',
    fontFamily: 'Inter', fontSize: '14px', fontWeight: '400', lineHeight: '20px',
    textAlign: 'left', border: '0px none', borderRadius: '0px', padding: '0px',
    margin: '0px', width: '100px', height: '30px',
  },
};

describe('portal design inspector', () => {
  it('injects a temporary inspector without reading browser secrets', () => {
    const source = portalInspectorSource();
    expect(source).toContain('__orkestraiPortalInspector');
    expect(source).toContain("delete window[KEY]");
    expect(source).not.toContain('document.cookie');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('sessionStorage');
    expect(source).not.toContain('indexedDB');
    expect(source).toContain("element.id && !sensitiveName.test(element.id)");
    expect(source).toContain("return redact(clone.outerHTML || ''");
  });

  it('checks the selected element and captures only its padded viewport clip', async () => {
    const executeJavaScript = vi.fn().mockResolvedValue(true);
    const capturePage = vi.fn().mockResolvedValue({
      isEmpty: () => false,
      toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
    });
    const webview = { executeJavaScript, capturePage } as unknown as PortalWebviewElement;

    await expect(portalSelectionExists(webview, '#cta')).resolves.toBe(true);
    expect(executeJavaScript).toHaveBeenCalledWith('Boolean(document.querySelector("#cta"))');
    const dataUrl = await capturePortalSelection(webview, capture);
    expect(dataUrl).toMatch(/^data:image\/png/);
    expect(capturePage).toHaveBeenCalledWith({ x: 0, y: 0, width: 112, height: 44 });
  });

  it('converts the native PNG capture into a browser File for workspace storage', () => {
    vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
    vi.stubGlobal('File', class extends Blob {
      name: string;
      constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
        super(parts, options);
        this.name = name;
      }
    });
    const file = portalScreenshotFile('data:image/png;base64,iVBORw0KGgo=', 'selection.png');
    expect(file).toMatchObject({ name: 'selection.png', type: 'image/png' });
    expect(file.size).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
