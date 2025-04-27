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
    // You can use a different project ID per run for isolation if necessary
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: "stemes-dev",
          privateKey:
            "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCq24/syE91CbDC\n6fYbrcYsL/iyVJ7Rku8tUKTYDm0EABiGPqEYTWH+ZKB+WPlCIeGR8Jl9LKofsg49\nt5xFVLoJUHRrhn1P69Lj3Ydxr2bt3mDsC3vvtYzvkCnqjBey89JtORFuP1+yWFCM\n0QmjicMjwjlHpPPqbiaNfD1HhIiHNRV1eWcICtPL1jhWSJVfwEpdtlYF+/O0apkF\n2qtkXHVGlVKKsSJo0BLcJQp+v8O2oOekenBviLnXr8qn0ZGp7iNkWFiYsHPnBTXL\n0p/oSD+fsnimEl/igmfIMDhFjEpP+EeoXa2wcoZmxS2leqzy3UbsX8/1UB6NpG+8\njx5PIM9jAgMBAAECggEABxtW4zx5wZ6Dkbf1mrUhtxjPuWs3p/P6quHd2XbQJghy\n/LKCNOaTGufInTjKNWv/W/isCb7f3K2lVf/bKi8aBeUo0ognkjl27i96wMnQ+Df1\nxBu+LfxZPmW6uJzXJ4Rozk4/YVyVeG+f+ht/0SOb0FL12vsLgkbOp7fxPJZQr37+\nUyWOnjMRI6i8fxHHnIN6ce+NmVLnELR71h98FuN4i/+letW0EYyzuNK87pX1dhQ7\nPzHOsnz37pZw9wvW5S9BR80nmpNrXen/oUPSbCXxkC5VYxHev2d8y1AYYcsb6Ojd\nWdEHgnC4kQDoa1CcTFejqoJuJO87bKdR+Ka0zQXC0QKBgQDf4UZz9iHU8JFsbeck\nGgMxr1Uv97yDuQJaiyw0QLRs/1rcSMsvE4hL7853XtbF0OxnHHcfxpaoYX3wRL7u\nNfTAJSEXbmrfV8jIdNr4RYyMpV5yiJspopb038+AEpojnDrX0e7rjP/AdP5R4mGM\nPSqar3o9RZZpda0w/wI2p7tstwKBgQDDXt5zwAy+XaDQbwW4zf6OT+fcKN8MeUok\nUKxhIRFz8xEAouP8y1jv6apdqL96m1tZtM2bwrVc0dD6vYbnuUQYxUd2iBYRJb2A\nwSNCNxPQdDvV5rET8lPb0xINGsPJiojSkUdhFbc7u+vp0+fEZnF/hcMj7oQlC7AA\nkwoLjZyetQKBgCEw0LUYZGOhVq3wjTf480hGaia2X6hXoVWzFFaa0STnppzJ3fWY\nu7gmUUG5ObYSBzoyKib31hYYfgdE6dl+/k4OMx26LPX3mbi+OkhcZz3itmHchsRh\namfbVnPyTg/BdafRY85gFPp/XcTd/wA/gTV1lnXG/0mbPJXq+HUJ4Ot5AoGAb1uk\nuh9OZDdj0Upm3YZ0wNMk2mVldWuw6fAdwSMjGo8CMvWls9KIN/9c/xOPSKhCsmgP\nBeg+jdB+KF1dBrmf6eqQqCw7P7zePgRYP4a7QYbvECX06uSmDddKI7QMwtS21ia+\no8TH80FS363MHjMyIDizGMj8A02dHUayZBFsoz0CgYAF9JHbqTCH6gTsro1GJS4M\nPB8aMfHccJqMMDxzz7mB7QqoSTLuTaEIiW/4UPEUs+AK46Q0FKjEqm475uhPrC1j\nKb6pYM87RQHkDtpeNv0V2uUxZ0EUTp1b19ACbJz0t/k676miXuZs1hPrc03GO8Cq\nNRXsBB2sDM5fZLZfqZ7MwA==\n-----END PRIVATE KEY-----\n",
          clientEmail:
            "firebase-adminsdk-130f0@stemes-dev.iam.gserviceaccount.com",
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
