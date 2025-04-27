import { clearFirestoreData } from "@firebase/testing";
import * as admin from "firebase-admin";
import { setFirestoreInstance } from "../../src";

// Choose an arbitrary project ID for the emulator
export const TEST_PROJECT_ID = "stemes-dev";

/**
 * Initializes the test environment by connecting to the Firestore emulator
 * and sets up the Admin SDK instance for the ORM.
 */
export const setupTestEnvironment =
  async (): Promise<admin.firestore.Firestore> => {
    // Sets the environment variable for the Admin SDK to find the emulator
    // Make sure the port matches your emulator configuration (firebase.json)
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

    // Initializes the Firebase Admin SDK (only once per test process)
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });
    }

    // Gets the Admin Firestore instance connected to the emulator
    const db = admin.firestore();

    // Sets the instance for the ORM library
    // Allowing overwrite is useful if setupTestEnvironment is called in multiple test files
    setFirestoreInstance(db, { allowOverwrite: true });

    // Initializes the test environment so that clearFirestoreData can be used
    // testEnv = await initializeTestEnvironment({ projectId: TEST_PROJECT_ID });

    // Optional: Load security rules (if your tests depend on them)
    // const rulesPath = path.join(__dirname, 'firestore.rules'); // Create this file if needed
    // if (fs.existsSync(rulesPath)) {
    //   await loadFirestoreRules({
    //     projectId: TEST_PROJECT_ID,
    //     rules: fs.readFileSync(rulesPath, 'utf8'),
    //   });
    // }

    return db;
  };

/**
 * Clears all data from the Firestore emulator.
 * Call this before each test or test suite to ensure isolation.
 */
export const clearFirestore = async (): Promise<void> => {
  try {
    await clearFirestoreData({ projectId: TEST_PROJECT_ID });
  } catch (error) {
    console.warn(
      "Could not clear Firestore data. Is the emulator running?",
      error
    );
  }
};
