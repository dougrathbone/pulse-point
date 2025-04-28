import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.resolve(__dirname, '..', '..', '..', '.cache', 'github');
const CACHE_ENABLED = process.env.CACHE_DISABLED !== 'true'; // Allow disabling cache via env var

// Ensure cache directory exists
const ensureCacheDir = async () => {
    if (!CACHE_ENABLED) return;
    try {
        await fs.promises.access(CACHE_DIR);
    } catch (error) {
        // Directory does not exist or no permissions, try creating it
        try {
            await fs.promises.mkdir(CACHE_DIR, { recursive: true });
            console.log(`Cache directory created: ${CACHE_DIR}`);
        } catch (mkdirError) {
            console.error(`Failed to create cache directory ${CACHE_DIR}:`, mkdirError);
            // Potentially disable caching if directory cannot be made?
        }
    }
};

// Call once on module load
ensureCacheDir();


interface CacheData<T> {
    timestamp: number;
    data: T;
}

/**
 * Writes data to a cache file.
 * @param key Unique identifier for the cache entry.
 * @param data The data to cache.
 */
export const writeCache = async (key: string, data: any): Promise<void> => {
    if (!CACHE_ENABLED) return;
    
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    const cacheEntry: CacheData<any> = {
        timestamp: Date.now(),
        data: data
    };

    try {
        await fs.promises.writeFile(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
        // console.log(`Cache written for key: ${key}`);
    } catch (error) {
        console.error(`Failed to write cache for key ${key}:`, error);
    }
};

/**
 * Reads data from a cache file if it exists and is not expired.
 * @param key Unique identifier for the cache entry.
 * @param maxAgeMs Maximum age of the cache entry in milliseconds.
 * @returns The cached data or null if not found or expired.
 */
export const readCache = async <T>(key: string, maxAgeMs: number): Promise<T | null> => {
    if (!CACHE_ENABLED) return null;

    const filePath = path.join(CACHE_DIR, `${key}.json`);

    try {
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');
        const cacheEntry: CacheData<T> = JSON.parse(fileContent);

        if (Date.now() - cacheEntry.timestamp > maxAgeMs) {
            console.log(`Cache expired for key: ${key}`);
            // Optionally remove the stale file
            // await fs.promises.unlink(filePath).catch(err => console.error(`Failed to delete stale cache for ${key}:`, err));
            return null;
        }

        // console.log(`Cache hit for key: ${key}`);
        return cacheEntry.data;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // File does not exist - normal cache miss
            // console.log(`Cache miss for key: ${key}`);
        } else {
            // Other errors (read permission, JSON parse error, etc.)
            console.error(`Failed to read cache for key ${key}:`, error);
        }
        return null;
    }
}; 