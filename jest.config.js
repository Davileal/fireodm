/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/examples/",
    "/tests/helpers/",
    "/src/index.ts",
    "/src/config/",
    "/src/core/types.ts",
    "/src/core/errors.ts",
  ],
  testMatch: ["**/tests/**/*.test.ts"],
  setupFilesAfterEnv: ["./tests/setup.ts"],
  // testTimeout: 30000,
};
