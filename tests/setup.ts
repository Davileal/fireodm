import { clearFirestore, setupTestEnvironment } from "./helpers/firestore";

// Runs once before all tests in this process
beforeAll(async () => {
  await setupTestEnvironment();
});

// Runs before EACH test (it/test)
beforeEach(async () => {
  await clearFirestore();
});

// Optional: Cleanup after all tests
// afterAll(async () => {
//   // Code to stop the emulator, if needed and if not handled by an external script
// });
