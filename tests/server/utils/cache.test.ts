import { vol } from 'memfs'; // Import memfs volume
// Define MOCK path *before* mocking path
const CACHE_DIR_MOCK = '/mock-cache-dir'; 

// Mock path *before* importing the module that uses it
jest.mock('path', () => ({
  ...jest.requireActual('path'), // Keep original functions
  resolve: (...args: string[]) => {
    // If it looks like the cache dir resolution, return mock path
    if (args.includes('.cache') && args.includes('github')) {
      return CACHE_DIR_MOCK;
    }
    // Otherwise, use the real resolve
    return jest.requireActual('path').resolve(...args);
  },
  join: jest.requireActual('path').join // Ensure join is also available
}));

// Now import the module to test
import { writeCache, readCache } from '../../../src/server/utils/cache';

// Mock the 'fs' module and the cache directory path resolution
jest.mock('fs', () => vol);

// We also need to ensure the CACHE_DIR points to something within the mock FS
// This is tricky because path.resolve in cache.ts runs before the mock is fully applied.
// A common approach is to mock path.resolve or structure the test differently.
// For simplicity here, we'll assume tests run in an environment where
// the mocked `fs` is used implicitly by the original `cache.ts` logic,
// acknowledging this might be fragile depending on the test runner setup.

describe('Cache Utility', () => {

  beforeEach(() => {
    // Reset the virtual file system before each test
    vol.reset();
    // Ensure the mock cache directory exists in the virtual FS
    vol.mkdirSync(CACHE_DIR_MOCK, { recursive: true });
  });

  it('should write and read cache successfully', async () => {
    const key = 'test-key';
    const data = { message: 'hello' };
    const ttl = 1000; // 1 second

    await writeCache(key, data);

    // Check if file was created in the mock FS
    expect(vol.existsSync('/mock-cache-dir/test-key.json')).toBe(true);

    const result = await readCache(key, ttl);
    expect(result.data).toEqual(data);
    expect(result.stale).toBe(false);
  });

  it('should return null for non-existent key', async () => {
    const result = await readCache('non-existent', 1000);
    expect(result.data).toBeNull();
    expect(result.stale).toBe(false);
  });

  it('should return null for expired cache if allowStale is false', async () => {
    const key = 'expired-key';
    const data = { value: 123 };
    const ttl = 100; // 100 ms

    await writeCache(key, data);
    await new Promise(resolve => setTimeout(resolve, ttl + 50)); // Wait for cache to expire

    const result = await readCache(key, ttl); // Default allowStale is false
    expect(result.data).toBeNull();
    expect(result.stale).toBe(true); // Should indicate it was stale
  });

  it('should return stale data for expired cache if allowStale is true', async () => {
    const key = 'stale-key';
    const data = { value: 456 };
    const ttl = 100; // 100 ms

    await writeCache(key, data);
    await new Promise(resolve => setTimeout(resolve, ttl + 50)); // Wait for cache to expire

    const result = await readCache(key, ttl, { allowStale: true });
    expect(result.data).toEqual(data);
    expect(result.stale).toBe(true);
  });

   it('should handle JSON parse error gracefully', async () => {
        const key = 'corrupt-key';
        const filePath = '/mock-cache-dir/corrupt-key.json';
        vol.writeFileSync(filePath, 'this is not json'); // Write invalid JSON

        const result = await readCache(key, 1000);
        expect(result.data).toBeNull();
        expect(result.stale).toBe(false);
    });

}); 