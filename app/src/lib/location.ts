import * as Location from "expo-location";
import { MAX_PLACE } from "./posts";

type Address = Pick<Location.LocationGeocodedAddress, "city" | "district" | "subregion" | "region" | "country">;

/**
 * A town-level place name, e.g. "Austin, Texas" or "Lyon, France". Never a
 * street, and never coordinates: friends see roughly where, not exactly.
 * Null if the address has nothing usable.
 */
export function placeName(a: Address): string | null {
  const local = a.city ?? a.subregion ?? a.district;
  const wider = a.region && a.region !== local ? a.region : a.country;
  const parts = [local, wider === local ? null : wider].filter((p): p is string => !!p && !!p.trim());
  if (parts.length === 0) return null;
  return parts.join(", ").slice(0, MAX_PLACE);
}

export class LocationUnavailableError extends Error {
  constructor(readonly reason: "permission" | "position" | "geocode") {
    super(`location unavailable: ${reason}`);
    this.name = "LocationUnavailableError";
  }
}

/**
 * Where the user is now, as a place name. Asks for permission the first
 * time. Uses low accuracy (a few km is plenty for a town name), and the
 * coordinates are dropped as soon as they've been turned into a name.
 */
export async function currentPlaceName(): Promise<string> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new LocationUnavailableError("permission");
  const position =
    (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000, requiredAccuracy: 5000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }).catch(() => null));
  if (!position) throw new LocationUnavailableError("position");
  const [address] = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  }).catch(() => []);
  const name = address ? placeName(address) : null;
  if (!name) throw new LocationUnavailableError("geocode");
  return name;
}
