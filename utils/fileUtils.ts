import { FileNode } from "@/types/files";

export const getAllChildPaths = (node: FileNode): string[] => {
  const paths: string[] = [node.path];
  if (node.children) {
    node.children.forEach((child) => {
      paths.push(...getAllChildPaths(child));
    });
  }
  return paths;
};

export const findNode = (
  node: FileNode,
  path: string
): FileNode | null => {
  if (node.path === path) return node;
  if (!node.children) return null;

  for (const child of node.children) {
    const found = findNode(child, path);
    if (found) return found;
  }

  return null;
};

export const filterNode = (
  node: FileNode,
  filter: string
): boolean => {
  if (!filter) return true;
  if (node.name.toLowerCase().includes(filter.toLowerCase())) return true;
  if (!node.children) return false;

  return node.children.some((child) => filterNode(child, filter));
};

export function matchesFilePatterns(
  filename: string,
  includePatterns: string[],
  excludePatterns: string[]
): boolean {
  const testPattern = (name: string, patternStr: string): boolean => {
    try {
      // Convert glob-like pattern to regex: escape dots, replace * with .*
      // Anchor the pattern to match the whole filename.
      const regex = new RegExp('^' + patternStr.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return regex.test(name);
    } catch {
      // console.warn(`Invalid pattern: ${patternStr}`, e);
      return false;
    }
  };

  const isExcluded = excludePatterns.some(pattern => testPattern(filename, pattern));

  if (isExcluded) {
    return false;
  }

  if (includePatterns.length === 0) {
    return true; // Not excluded, and no specific includes needed
  }

  return includePatterns.some(pattern => testPattern(filename, pattern));
}
