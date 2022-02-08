import { promises as fs } from 'fs';

/**
 * Checks if the given `itemPath` exists and is a directory
 *
 * @param itemPath The path to check
 * @returns If the path is an existing directory
 */
export async function isExistingDirectory(itemPath: string): Promise<boolean> {
    try {
        const fileStat = await fs.lstat(itemPath);

        return fileStat.isDirectory();
    } catch { }

    return false;
}
