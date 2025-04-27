import { Firestore } from "firebase-admin/firestore";

let dbInstance: Firestore | null = null;
let isInstanceSet: boolean = false; // Flag para evitar avisos repetidos

/**
 * Defines the instance of the Firestore that the library will use.
 * It must be called once in the initialization of your application.
 * @Param Instance the initialized instance of Firestore (Admin.firestore()).
 * @Param Options Options for configuration.`ALLOWOVERWRITE` (False Standard) allows you to redefine the instance, useful for testing.
 */
export function setFirestoreInstance(
  instance: Firestore,
  options: { allowOverwrite?: boolean } = {}
): void {
  if (
    dbInstance &&
    !options.allowOverwrite &&
    process.env.NODE_ENV !== "test"
  ) {
    if (!isInstanceSet) {
      console.warn(
        "Firestore instance is already set. Overwriting is disallowed by default. " +
          "Pass { allowOverwrite: true } to suppress this warning or if intended (e.g., in HMR scenarios)."
      );
      isInstanceSet = true;
    }
    return;
  }
  if (!instance || typeof instance.collection !== "function") {
    throw new Error(
      "Invalid Firestore instance provided to setFirestoreInstance. Did you call admin.firestore()?"
    );
  }
  dbInstance = instance;
  isInstanceSet = true;
}

/**
 * Obtains the instance of the configured Firestore.
 * @throws Error If Setfirestoreinstance was not called.
 * @returns The Instance of the Firestore.
 */
export function getFirestoreInstance(): Firestore {
  if (!dbInstance) {
    throw new Error(
      "Firestore instance has not been set for the ORM. Call setFirestoreInstance(admin.firestore()) " +
        "once during your application initialization before using any ORM models."
    );
  }
  return dbInstance;
}
