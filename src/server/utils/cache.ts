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

interface ReadCacheOptions {
    allowStale?: boolean;
}

interface ReadCacheResult<T> {
    data: T | null;
    stale: boolean;
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
 * Reads data from a cache file.
 * @param key Unique identifier for the cache entry.
 * @param maxAgeMs Maximum age of the cache entry in milliseconds.
 * @param options Optional settings, e.g., { allowStale: true }.
 * @returns An object { data: T | null, stale: boolean }.
 */
export const readCache = async <T>(
    key: string, 
    maxAgeMs: number, 
    options: ReadCacheOptions = {}
): Promise<ReadCacheResult<T>> => {
    if (!CACHE_ENABLED) return { data: null, stale: false };

    const filePath = path.join(CACHE_DIR, `${key}.json`);
    const result: ReadCacheResult<T> = { data: null, stale: false };

    try {
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');
        const cacheEntry: CacheData<T> = JSON.parse(fileContent);
        const isExpired = Date.now() - cacheEntry.timestamp > maxAgeMs;

        if (isExpired) {
            result.stale = true;
            console.log(`Cache expired for key: ${key}`);
            if (options.allowStale) {
                console.log(`Serving stale cache for key: ${key}`);
                result.data = cacheEntry.data;
            } else {
                // Optionally remove stale file if not allowing stale
                 // await fs.promises.unlink(filePath).catch(/*...*/);
            }
        } else {
            // console.log(`Cache hit for key: ${key}`);
            result.data = cacheEntry.data;
            result.stale = false;
        }

    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // console.log(`Cache miss for key: ${key}`);
        } else {
            console.error(`Failed to read cache for key ${key}:`, error);
        }
        // Keep result.data as null on error
    }
    
    return result;
}; 