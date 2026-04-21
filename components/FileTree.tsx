import React, { useState } from 'react';
import { ChevronRight, ChevronDown, File, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileNode, FileTreeProps } from '@/types/files';
import { matchesFilePatterns } from '@/utils/fileUtils';
import { FileContentDialog } from './FileContentDialog';

export const FileTree: React.FC<FileTreeProps> = ({
  node,
  level = 0,
  selectedFiles,
  onToggleSelect,
  onToggleExpand,
  expandedFolders,
  filter,
  includePatterns,
  excludePatterns,
  maxModelContext,
  settings,
}) => {
  const [isFileDialogOpen, setFileDialogOpen] = useState(false);
  const [dialogFilePath, setDialogFilePath] = useState<string | null>(null);

  const handleViewFile = (path: string) => {
    setDialogFilePath(path);
    setFileDialogOpen(true);
  };

  if (!node) return null;

  const matchesFilter = (name: string): boolean => {
    if (!filter) return true;
    return name.toLowerCase().includes(filter.toLowerCase());
  };

  const hasMatchingChildren = (node: FileNode): boolean => {
    if (node.type !== 'directory' || !node.children) return false;

    return node.children.some(child => {
      if (child.type === 'directory') {
        return hasMatchingChildren(child);
      }
      return (
        matchesFilter(child.name) &&
        matchesFilePatterns(child.name, includePatterns, excludePatterns)
      );
    });
  };

  const isVisible = node.type === 'directory'
    ? hasMatchingChildren(node)
    : matchesFilter(node.name) &&
      matchesFilePatterns(node.name, includePatterns, excludePatterns);

  if (!isVisible) return null;

  const isDirectory = node.type === 'directory';
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedFiles.has(node.path);
  const canSelect = !isDirectory && matchesFilePatterns(node.name, includePatterns, excludePatterns);

  // Calculate selected tokens for directories, respecting filters
  const getSelectedTokensForDirectory = (node: FileNode): number => {
    if (!node.children) return 0;

    return node.children.reduce((total, child) => {
      if (child.type === 'file') {
        // Only count files that match the filters - use child.name directly
        const matchesFilters = matchesFilePatterns(child.name, includePatterns, excludePatterns);
        return total + (selectedFiles.has(child.path) && child.tokenCount && matchesFilters ? child.tokenCount : 0);
      } else {
        return total + getSelectedTokensForDirectory(child);
      }
    }, 0);
  };

  // Calculate total tokens for directories, respecting filters
  const getFilteredTotalTokensForDirectory = (node: FileNode): number => {
    if (!node.children) return 0;

    return node.children.reduce((total, child) => {
      if (child.type === 'file') {
        // Only count files that match the filters - use child.name directly
        const matchesFilters = matchesFilePatterns(child.name, includePatterns, excludePatterns);
        return total + (child.tokenCount && matchesFilters ? child.tokenCount : 0);
      } else {
        return total + getFilteredTotalTokensForDirectory(child);
      }
    }, 0);
  };

  // Get selected tokens for this directory
  const selectedTokens = isDirectory ? getSelectedTokensForDirectory(node) : 0;

  // Get filtered total tokens for this directory
  const filteredTotalTokens = isDirectory ? getFilteredTotalTokensForDirectory(node) : 0;

  return (
    <div role="tree" aria-label="File tree">
      <div
        role="treeitem"
        aria-expanded={isDirectory ? isExpanded : undefined}
        aria-selected={isSelected}
        tabIndex={0}
        className={cn(
          "flex items-center py-1 px-2 rounded cursor-pointer group",
          canSelect && "hover:bg-accent",
          isSelected && canSelect && "bg-accent",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        )}
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={() => {
          if (isDirectory) {
            onToggleExpand(node.path);
          } else if (canSelect) {
            onToggleSelect(node.path);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isDirectory) {
              onToggleExpand(node.path);
            } else if (canSelect) {
              onToggleSelect(node.path);
            }
          }
        }}
      >
        <div className="mr-2">
          {isDirectory ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <File className="h-4 w-4" />
          )}
        </div>
        <Checkbox
          checked={isSelected || (isDirectory && node.children?.some(child =>
            selectedFiles.has(child.path) ||
            (child.type === 'directory' && child.children?.some(grandChild => selectedFiles.has(grandChild.path)))
          ))}
          className={cn(
            "mr-2",
            !canSelect && !isDirectory && "opacity-50"
          )}
          disabled={!canSelect && !isDirectory}
          aria-label={isDirectory ? `Select all files in ${node.name} folder` : `Select ${node.name}`}
          onCheckedChange={() => {
            if (canSelect || isDirectory) {
              onToggleSelect(node.path);
            }
          }}
        />
        <span className={cn(
          "flex-1",
          !canSelect && !isDirectory && "text-muted-foreground",
          isSelected && canSelect && "font-medium"
        )}>
          {node.name}
        </span>
        {node.tokenCount !== undefined && (
          <Badge variant="secondary" className="ml-2 text-xs">
            {isDirectory
              ? `${selectedTokens.toLocaleString()}/${filteredTotalTokens.toLocaleString()}`
              : `${node.tokenCount.toLocaleString()}`}
          </Badge>
        )}

        {node.type === 'file' && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Preview ${node.name}`}
            onClick={(e) => {
              e.stopPropagation(); // Prevent row click when icon is clicked
              handleViewFile(node.path);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children
            .sort((a, b) => {
              // Directories first, then files
              if (a.type === 'directory' && b.type !== 'directory') return -1;
              if (a.type !== 'directory' && b.type === 'directory') return 1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
              <FileTree
                key={child.path}
                node={child}
                level={level + 1}
                selectedFiles={selectedFiles}
                onToggleSelect={onToggleSelect}
                onToggleExpand={onToggleExpand}
                expandedFolders={expandedFolders}
                filter={filter}
                includePatterns={includePatterns}
                excludePatterns={excludePatterns}
                maxModelContext={maxModelContext}
                settings={settings}
              />
            ))}
        </div>
      )}

      {/* File Content Dialog */}
      <FileContentDialog
        open={isFileDialogOpen}
        onClose={() => {
          setFileDialogOpen(false);
          setDialogFilePath(null);  // Clear the path when closing
        }}
        filePath={dialogFilePath}
      />
    </div>
  );
};
