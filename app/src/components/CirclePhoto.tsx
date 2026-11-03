import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { storage } from "../firebase";
import { bytesToBase64 } from "../lib/base64";
import { storageLoader } from "../lib/photoCache";
import { makeStyles, useColors } from "./ui";

/**
 * A prayer circle's photo, or a circle-of-people icon without one. Loaded
 * with getBytes (never a download link) and kept only in this view's memory,
 * never on disk. `previewUri` shows a just-picked photo before upload.
 */
export function CirclePhoto({ path, size = 44, previewUri }: { path: string | null; size?: number; previewUri?: string | null }) {
  const styles = useStyles();
  const colors = useColors();
  const [loaded, setLoaded] = useState<{ path: string; uri: string } | null>(null);
  useEffect(() => {
    if (!path || previewUri) return;
    let live = true;
    storageLoader(storage)(path).then(
      (bytes) => { if (live) setLoaded({ path, uri: `data:image/jpeg;base64,${bytesToBase64(bytes)}` }); },
      (err) => console.warn("circle photo failed", err),
    );
    return () => { live = false; };
  }, [path, previewUri]);
  const uri = previewUri ?? (loaded && loaded.path === path ? loaded.uri : null);
  const radius = Math.round(size * 0.27);
  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: radius }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" />
      ) : (
        <Ionicons name="people-circle-outline" size={Math.round(size * 0.6)} color={colors.accent} />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
}));
