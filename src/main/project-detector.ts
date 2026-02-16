import * as fs from 'fs/promises';
import * as path from 'path';
import type { ProjectType } from '../shared/types';

/**
 * Mapping of marker filenames to project types.
 * When a marker file is found in a directory, the corresponding
 * project type is included in the detection results.
 */
const MARKER_MAP: Record<string, ProjectType> = {
  '.git': 'git',
  'package.json': 'node',
  'requirements.txt': 'python',
  'pyproject.toml': 'python',
  'Dockerfile': 'docker',
};

/**
 * ProjectDetector scans a given directory for marker files and
 * returns an array of detected project types.
 *
 * Uses fs.access() for each marker file to check existence,
 * which is a lightweight stat-like operation. For a typical
 * directory with 5 checks, this completes in <5ms.
 */
export class ProjectDetector {
  /**
   * Scan the given directory for project marker files.
   * Returns a deduplicated array of detected project types.
   *
   * @param directory - The absolute path of the directory to scan
   * @returns Array of detected project types (e.g., ['git', 'node', 'docker'])
   */
  async detect(directory: string): Promise<ProjectType[]> {
    const detectedTypes = new Set<ProjectType>();

    // Check each marker file in parallel
    const checks = Object.entries(MARKER_MAP).map(async ([markerFile, projectType]) => {
      try {
        await fs.access(path.join(directory, markerFile));
        detectedTypes.add(projectType);
      } catch {
        // File doesn't exist, skip this marker
      }
    });

    await Promise.all(checks);

    return Array.from(detectedTypes);
  }

  /**
   * Returns the marker file to project type mapping.
   * Useful for debugging or UI display of what files are being checked.
   */
  getMarkerMap(): Record<string, ProjectType> {
    return { ...MARKER_MAP };
  }
}
