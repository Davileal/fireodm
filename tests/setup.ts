import { clearFirestore, setupTestEnvironment } from "./helpers/firestore";
import dotenv from "dotenv";

dotenv.config();

// Runs once before all tests in this process
beforeAll(async () => {
  await setupTestEnvironment();
});

// Runs before EACH test (it/test)
beforeEach(async () => {
  await clearFirestore();
});
