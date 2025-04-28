/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node', // or 'jsdom' if testing React components
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Add setup files if needed, e.g., for DOM testing with jsdom
  // setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
}; 