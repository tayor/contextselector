import { MarkdownSettings } from '@/app/components/SettingsDialog';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  hasChildren?: boolean;
  tokenCount?: number;
  csvPreviewRows?: number;
}

export interface FileTreeProps {
  node: FileNode;
  level: number;
  selectedFiles: Set<string>;
  onToggleSelect: (path: string) => void;
  onToggleExpand: (path: string) => void;
  expandedFolders: Set<string>;
  filter: string;
  includePatterns: string[];
  excludePatterns: string[];
  maxModelContext: number;
  settings: MarkdownSettings;
}

export interface FileExplorerProps {
  currentPath: string;
  workspaceRoot: string;
  selectedFiles: Set<string>;
  filter: string;
  includePatterns: string[];
  excludePatterns: string[];
  settings: MarkdownSettings;
  onFileSelectionChange: (selected: Set<string>) => void;
  onPathChange: (newPath: string) => void;
  onFilterChange: (newFilter: string) => void;
  onIncludePatternsChange: (newPatterns: string[]) => void;
  onExcludePatternsChange: (newPatterns: string[]) => void;
  onFileSystemChange?: (fileSystem: FileNode | null) => void;
}
