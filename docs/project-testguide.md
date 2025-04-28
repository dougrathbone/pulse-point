# PulsePoint - Testing Guide

This guide outlines the standards and practices for writing tests for the PulsePoint application.

## Testing Framework

*   We use [Jest](https://jestjs.io/) as the primary testing framework.
*   [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) is used for testing React components.

## Test Types

*   **Unit Tests:** Focus on testing individual functions, modules, or components in isolation. External dependencies (like API clients, file system access) should be mocked.
*   **Integration Tests:** Test the interaction between multiple units (e.g., API route handler calling a service). Mock external services (GitHub API).
*   **End-to-End (E2E) Tests:** (Future) Simulate user interactions in a browser environment. Tools like Cypress or Playwright could be considered later.

## File Naming and Location

*   Test files should reside in the `/tests` directory, mirroring the structure of the `/src` directory.
*   Test files should be named using the pattern `*.test.ts` or `*.spec.ts` (e.g., `/tests/server/services/githubService.test.ts`).

## Key Principles

*   **Isolation:** Unit tests should not rely on external services or the file system. Use Jest's mocking capabilities (`jest.fn()`, `jest.mock()`, `jest.spyOn()`).
*   **Clarity:** Tests should be easy to read and understand. Use descriptive names for tests (`describe`, `it`) and variables.
*   **Coverage:** Aim for reasonable test coverage, focusing on critical paths, business logic, and edge cases. (Coverage reporting can be added to Jest config).
*   **Maintainability:** Write tests that are robust to minor implementation changes.

## Mocking

*   **External APIs (Octokit):** Mock the specific Octokit methods being called by the service layer (e.g., `octokit.paginate`, `octokit.search.commits`). Return controlled data to test different scenarios (success, error, empty results).
*   **File System (`fs`):** Mock `fs.promises` methods used by the cache utility to avoid actual file I/O during tests. Use libraries like `memfs` or Jest's manual mocks.
*   **Fetch API (Frontend):** Mock the global `fetch` function when testing components that make API calls.

## Running Tests

Use the npm script:

```bash
npm test 
# or for watch mode:
npm run test:watch
```
