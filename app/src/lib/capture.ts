import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/**
 * uri: the resized JPEG in the app's cache folder (the user's own photo).
 * Upload it with photoBlob(uri).
 */
export type CapturedPhoto = { previewUri: string; photoId: string };

/**
 * The JPEG as a native React Native Blob, which is what Firebase Storage's
 * upload needs here. Uploading raw bytes (Uint8Array) fails under React
 * Native: Firebase builds a Blob from them internally, and React Native's
 * Blob can't be created from an ArrayBuffer/ArrayBufferView.
 */
export async function photoBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

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
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return {
    previewUri: result.uri,
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

// Profile photos are shown small, so 512px square is plenty (~40–80 KB).
const AVATAR_EDGE = 512;

/**
 * A square profile photo from the camera or the photo library (both allowed
 * for profile photos, unlike posts). The picker offers a square crop; the
 * centre is cropped again here in case the platform ignored it.
 * Returns null if cancelled or permission denied.
 */
export async function pickAvatar(source: "camera" | "library"): Promise<CapturedPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false, allowsEditing: true, aspect: [1, 1] };
  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const side = Math.min(asset.width, asset.height);
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width !== asset.height) {
    ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  }
  if (side > AVATAR_EDGE) ctx.resize({ width: AVATAR_EDGE, height: AVATAR_EDGE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { previewUri: saved.uri, photoId: Crypto.randomUUID().replace(/-/g, "") };
}
