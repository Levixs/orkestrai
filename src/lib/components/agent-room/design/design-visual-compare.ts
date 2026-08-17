import pixelmatch from 'pixelmatch';

export type DesignVisualComparison = {
  width: number;
  height: number;
  mismatchedPixels: number;
  mismatchRatio: number;
  referenceDataUrl: string;
  actualDataUrl: string;
  diffDataUrl: string;
};

async function loadImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Unable to decode comparison image.'));
    image.src = source;
  });
  return image;
}

async function pixels(source: string, width: number, height: number): Promise<{ data: ImageData; dataUrl: string }> {
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - renderedWidth) / 2, (height - renderedHeight) / 2, renderedWidth, renderedHeight);
  return { data: context.getImageData(0, 0, width, height), dataUrl: canvas.toDataURL('image/png') };
}

export async function compareDesignImages(reference: string, actual: string, width: number, height: number): Promise<DesignVisualComparison> {
  const [normalizedReference, normalizedActual] = await Promise.all([
    pixels(reference, width, height),
    pixels(actual, width, height),
  ]);
  const output = new ImageData(width, height);
  const mismatchedPixels = pixelmatch(normalizedReference.data.data, normalizedActual.data.data, output.data, width, height, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.55,
    diffColor: [239, 68, 68],
    aaColor: [245, 158, 11],
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.putImageData(output, 0, 0);
  return {
    width,
    height,
    mismatchedPixels,
    mismatchRatio: mismatchedPixels / (width * height),
    referenceDataUrl: normalizedReference.dataUrl,
    actualDataUrl: normalizedActual.dataUrl,
    diffDataUrl: canvas.toDataURL('image/png'),
  };
}

export function dataUrlFile(source: string, name: string): File {
  const [header, encoded] = source.split(',', 2);
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'image/png';
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new File([bytes], name, { type: mimeType });
}
