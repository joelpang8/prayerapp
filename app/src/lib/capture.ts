import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { base64ToBytes } from "./base64";

export type CapturedPhoto = { previewUri: string; jpeg: Uint8Array; photoId: string };

// ~1600px on the long edge at 70% JPEG is typically 200–400 KB, well under
// the 5 MB limit in storage.rules and quick to upload.
const MAX_EDGE = 1600;

async function toJpeg(asset: ImagePicker.ImagePickerAsset): Promise<CapturedPhoto> {
  const landscape = asset.width > asset.height;
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_EDGE) {
    ctx.resize(landscape ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!result.base64) throw new Error("Could not encode photo");
  return {
    previewUri: result.uri,
    jpeg: base64ToBytes(result.base64),
    photoId: Crypto.randomUUID().replace(/-/g, ""),
  };
}

/** Take a photo with the camera. Returns null if cancelled or permission denied. */
export async function takePhoto(): Promise<CapturedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
  if (result.canceled || !result.assets[0]) return null;
  return toJpeg(result.assets[0]);
}

/**
 * Development only: the iOS Simulator has no camera. Whether real users may
 * post a photo from their library is a product decision still to make.
 */
export async function pickPhotoForDevelopment(): Promise<CapturedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false });
  if (result.canceled || !result.assets[0]) return null;
  return toJpeg(result.assets[0]);
}
