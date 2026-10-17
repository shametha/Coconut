import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function database() {
  const projectId =
    process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId)
    throw new Error(
      "Set the Firebase project ID before connecting to Firestore.",
    );
  if (
    process.env.NODE_ENV === "production" &&
    process.env.FIRESTORE_EMULATOR_HOST
  )
    throw new Error("Production cannot use the local database emulator.");
  if (
    process.env.FIRESTORE_EMULATOR_HOST &&
    !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST)
  )
    throw new Error("The development database must use a loopback emulator.");
  const app = getApps()[0] ?? initializeApp({ projectId });
  return getFirestore(app);
}

export function readTrace(snapshot: {
  ref: { path: string };
  updateTime?: { toDate(): Date };
}) {
  return `firestore:${snapshot.ref.path}@${snapshot.updateTime?.toDate().toISOString() ?? "missing"}`;
}
export const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
