import * as Location from 'expo-location';

export type Coords = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
};

export async function getCurrentLocation(opts?: { highAccuracy?: boolean }): Promise<Coords> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location permission denied');
  const loc = await Location.getCurrentPositionAsync({
    accuracy: opts?.highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
  });
  return { ...loc.coords, timestamp: loc.timestamp };
}

export async function watchLocation(cb: (c: Coords) => void, opts?: { intervalMs?: number; distanceM?: number }) {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location permission denied');
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: opts?.intervalMs ?? 5000,
      distanceInterval: opts?.distanceM ?? 10,
    },
    (loc) => cb({ ...loc.coords, timestamp: loc.timestamp }),
  );
}

export async function reverseGeocode(c: Pick<Coords, 'latitude' | 'longitude'>) {
  const results = await Location.reverseGeocodeAsync({ latitude: c.latitude, longitude: c.longitude });
  return results[0] ?? null;
}
