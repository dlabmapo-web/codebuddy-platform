export type CropPosition = {
  zoom: number;
  x: number;
  y: number;
};

export type CropGeometry = {
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
  sourceX: number;
  sourceY: number;
  sourceSize: number;
};

/**
 * Converts the crop controls into both preview pixels and source-image pixels.
 * Position values are normalized from -1 to 1, making the controls independent
 * of the original file's dimensions.
 */
export function calculateSquareCrop(input: {
  imageWidth: number;
  imageHeight: number;
  viewportSize: number;
  position: CropPosition;
}): CropGeometry {
  const { imageWidth, imageHeight, viewportSize, position } = input;
  if (imageWidth <= 0 || imageHeight <= 0 || viewportSize <= 0) {
    throw new Error('Invalid crop dimensions');
  }

  const zoom = Math.min(3, Math.max(1, position.zoom));
  const x = Math.min(1, Math.max(-1, position.x));
  const y = Math.min(1, Math.max(-1, position.y));
  const scale = Math.max(viewportSize / imageWidth, viewportSize / imageHeight) * zoom;
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  const maxOffsetX = Math.max(0, (renderedWidth - viewportSize) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - viewportSize) / 2);
  const offsetX = x * maxOffsetX;
  const offsetY = y * maxOffsetY;
  const sourceSize = viewportSize / scale;

  return {
    renderedWidth,
    renderedHeight,
    offsetX,
    offsetY,
    sourceX: (imageWidth - sourceSize) / 2 - offsetX / scale,
    sourceY: (imageHeight - sourceSize) / 2 - offsetY / scale,
    sourceSize,
  };
}

export async function cropProfileImage(
  file: File,
  image: HTMLImageElement,
  position: CropPosition,
): Promise<File> {
  const outputSize = 512;
  const geometry = calculateSquareCrop({
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
    viewportSize: outputSize,
    position,
  });
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');

  // JPEG is accepted by every supported browser and by the API. A white base
  // keeps transparent PNG pixels from becoming black during conversion.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputSize, outputSize);
  context.drawImage(
    image,
    geometry.sourceX,
    geometry.sourceY,
    geometry.sourceSize,
    geometry.sourceSize,
    0,
    0,
    outputSize,
    outputSize,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Crop encoding failed')),
      'image/jpeg',
      0.9,
    );
  });
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'profile';
  return new File([blob], `${baseName}-cove-profile.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
