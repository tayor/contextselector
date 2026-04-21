'use client';

import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FolderOpen, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { FileTree } from "./FileTree";
import { FileNode, FileExplorerProps } from "@/types/files";
import { getAllChildPaths, findNode, matchesFilePatterns } from "@/utils/fileUtils";
import { DirectoryPicker } from './DirectoryPicker';
import { countTokens } from '@/utils/tokenizer';
import type { TiktokenModel } from 'tiktoken';
import { Badge } from "@/components/ui/badge";

// Debounce function
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface ExtensionInfo {
  extension: string;
  pattern: string;
  count: number;
  isActive: boolean;
}

const getExtension = (filename: string): string | null => {
  const parts = filename.split('.');
  if (parts.length > 1) {
    const ext = parts.pop();
    return ext ? ext.toLowerCase() : null;
  }
  return null;
};

const getAvailableExtensionPatterns = (
  node: FileNode | null,
  textFilter: string,
  currentIncludePatterns: string[], // Used to mark isActive
  currentExcludePatternsProp: string[] // Used to filter files for counting
): ExtensionInfo[] => {
  if (!node) return [];

  const extensionCounts: Map<string, number> = new Map();

  function traverse(currentNode: FileNode) {
    if (currentNode.type === 'file') {
      const filename = currentNode.name;
      const isTextMatch = !textFilter || filename.toLowerCase().includes(textFilter.toLowerCase());

      let isExcludedByExcludePatterns = false;
      if (currentExcludePatternsProp.length > 0) {
        isExcludedByExcludePatterns = currentExcludePatternsProp.some(pattern => {
          try {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            return regex.test(filename);
          } catch { return false; }
        });
      }

      if (isTextMatch && !isExcludedByExcludePatterns) {
        const ext = getExtension(filename);
        if (ext) {
          extensionCounts.set(ext, (extensionCounts.get(ext) || 0) + 1);
        }
      }
    } else if (currentNode.children) {
      currentNode.children.forEach(traverse);
    }
  }

  traverse(node);

  return Array.from(extensionCounts.entries()).map(([ext, count]) => {
    const pattern = `*.${ext}`;
    return {
      extension: ext,
      pattern: pattern,
      count,
      isActive: currentIncludePatterns.includes(pattern),
    };
  }).sort((a, b) => b.count - a.count || a.extension.localeCompare(b.extension));
};

export const FileExplorer: React.FC<FileExplorerProps> = ({
  currentPath,
  workspaceRoot,
  selectedFiles,
  filter,
  includePatterns,
  excludePatterns,
  settings,
  onFileSelectionChange,
  onPathChange,
  onFilterChange,
  onIncludePatternsChange,
  onExcludePatternsChange,
  onFileSystemChange,
}) => {
  const [fileSystem, setFileSystem] = useState<FileNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([currentPath]));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenPercentage] = useState<number>(0); // This state is not updated, consider removing or implementing
  const [isCountingTokens, setIsCountingTokens] = useState<boolean>(false);
  const [totalSelectedTokens, setTotalSelectedTokens] = useState<number>(0);

  const [localFilterInput, setLocalFilterInput] = useState(filter);
  const [isFilterInputFocused, setIsFilterInputFocused] = useState(false);
  const [localIncludeInput, setLocalIncludeInput] = useState(() => includePatterns.join(','));
  const [localExcludeInput, setLocalExcludeInput] = useState(() => excludePatterns.join(','));

  const [newIncludePatternText, setNewIncludePatternText] = useState('');
  const [newExcludePatternText, setNewExcludePatternText] = useState('');

  const [isIncludeFocused, setIsIncludeFocused] = useState(false);
  const [isExcludeFocused, setIsExcludeFocused] = useState(false);

  const [availableExtensions, setAvailableExtensions] = useState<ExtensionInfo[]>([]);

  // Refs for inputs and blur timeouts
  const includeInputRef = useRef<HTMLInputElement>(null);
  const excludeInputRef = useRef<HTMLInputElement>(null);
  const includeBlurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const excludeBlurTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    if (!isIncludeFocused) {
      const propPatternsString = includePatterns.join(',');
      if (propPatternsString !== localIncludeInput) {
        setLocalIncludeInput(propPatternsString);
      }
    }
  }, [includePatterns, localIncludeInput, isIncludeFocused]);

  useEffect(() => {
    if (!isExcludeFocused) {
      const propPatternsString = excludePatterns.join(',');
      if (propPatternsString !== localExcludeInput) {
        setLocalExcludeInput(propPatternsString);
      }
    }
  }, [excludePatterns, localExcludeInput, isExcludeFocused]);

  useEffect(() => {
    if (!isFilterInputFocused) {
      setLocalFilterInput(filter);
    }
  }, [filter, isFilterInputFocused]);

  const debouncedFilter = useDebounce(localFilterInput, 300);
  const debouncedIncludeInput = useDebounce(localIncludeInput, 500);
  const debouncedExcludeInput = useDebounce(localExcludeInput, 500);

  useEffect(() => { onFilterChange(debouncedFilter); }, [debouncedFilter, onFilterChange]);

  useEffect(() => {
    if (fileSystem) {
      const extensionsData = getAvailableExtensionPatterns(
        fileSystem,
        debouncedFilter,
        includePatterns, // Pass current includePatterns prop
        excludePatterns  // Pass current excludePatterns prop for accurate counting
      );
      setAvailableExtensions(extensionsData);
    } else {
      setAvailableExtensions([]);
    }
  }, [fileSystem, debouncedFilter, includePatterns, excludePatterns]);

  useEffect(() => {
    const newPatterns = debouncedIncludeInput.split(',').map((p: string) => p.trim()).filter(Boolean);
    if (JSON.stringify(newPatterns) !== JSON.stringify(includePatterns)) {
       onIncludePatternsChange(newPatterns);
    }
  }, [debouncedIncludeInput, onIncludePatternsChange, includePatterns]);

  useEffect(() => {
    const newPatterns = debouncedExcludeInput.split(',').map((p: string) => p.trim()).filter(Boolean);
    if (JSON.stringify(newPatterns) !== JSON.stringify(excludePatterns)) {
       onExcludePatternsChange(newPatterns);
    }
  }, [debouncedExcludeInput, onExcludePatternsChange, excludePatterns]);

  const fileContentCache = useRef<Map<string, string>>(new Map());

  const processNode = useCallback(async (node: FileNode): Promise<void> => {
    if (node.type === 'file' && node.tokenCount !== undefined && !selectedFiles.has(node.path)) {
      return;
    }

    if (node.type === 'file' && matchesFilePatterns(node.name, includePatterns, excludePatterns)) {
      if (selectedFiles.has(node.path) || node.tokenCount === undefined) {
        let contentToCount: string | null = null;
        try {
            let fullContent: string;
            if (fileContentCache.current.has(node.path)) {
              fullContent = fileContentCache.current.get(node.path)!;
            } else {
              const response = await fetch(`/api/file-content?path=${encodeURIComponent(node.path)}`);
              if (response.ok) {
                const responseData = await response.json();
                const apiContentValue = responseData.content;
                // Ensure content is a string
                fullContent = (typeof apiContentValue === 'string') ? apiContentValue : '';
                fileContentCache.current.set(node.path, fullContent);
              } else {
                console.error(`Error fetching content for ${node.path}: ${response.statusText}`);
                node.tokenCount = 0;
                return;
              }
            }

            if (node.path.toLowerCase().endsWith('.csv') && settings.csvPreviewRows >= 0) {
                const lines = fullContent.split('\n');
                contentToCount = settings.csvPreviewRows === 0 ? '' : lines.slice(0, settings.csvPreviewRows).join('\n');
            } else if (!node.path.toLowerCase().endsWith('.csv')) {
                contentToCount = fullContent;
            }

            if (contentToCount !== null) {
                 node.tokenCount = await countTokens(contentToCount, settings.selectedModel as TiktokenModel, settings.useSimplifiedTokenCount);
            } else {
                 node.tokenCount = 0; // e.g. CSV with preview rows disabled but not 0 - or other unhandled cases
            }

        } catch (error) {
          console.error(`Error processing file ${node.path}:`, error);
          node.tokenCount = 0;
        }
      }
    } else if (node.children) {
      let childrenTokenCount = 0;
      await Promise.all(node.children.map(async (child) => {
        await processNode(child);
        childrenTokenCount += child.tokenCount || 0;
      }));
      node.tokenCount = childrenTokenCount;
    } else {
      node.tokenCount = 0;
    }
  }, [includePatterns, excludePatterns, selectedFiles, settings.csvPreviewRows, settings.selectedModel, settings.useSimplifiedTokenCount]);


  const calculateTokenCounts = useCallback(async (currentFileSystem: FileNode): Promise<FileNode> => {
    setIsCountingTokens(true);
    const updatedFileSystem = JSON.parse(JSON.stringify(currentFileSystem));

    try {
      await processNode(updatedFileSystem);

      const calculateSelectedTokens = (node: FileNode): number => {
        if (node.type === 'file') {
          return selectedFiles.has(node.path) && matchesFilePatterns(node.name, includePatterns, excludePatterns) ? (node.tokenCount || 0) : 0;
        } else if (node.children) {
          return node.children.reduce((sum, child) => sum + calculateSelectedTokens(child), 0);
        }
        return 0;
      };

      const newTotalSelectedTokens = calculateSelectedTokens(updatedFileSystem);
      setTotalSelectedTokens(newTotalSelectedTokens);
    } catch (error) {
      console.error("Error calculating token counts:", error);
    } finally {
      setIsCountingTokens(false);
    }

    return updatedFileSystem;
  }, [selectedFiles, includePatterns, excludePatterns, processNode]);


  const fetchFiles = useCallback(async () => {
    if (!currentPath) return;
    setIsLoading(true);
    try {
      fileContentCache.current.clear();
      const response = await fetch(`/api/files?path=${encodeURIComponent(currentPath)}&depth=-1&respectGitignore=${settings.respectGitignore}&showHiddenFiles=${settings.showHiddenFiles}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
        throw new Error(error.error || `HTTP error ${response.status}`);
      }
      const data = await response.json();
      const initialSystemWithTokens = await calculateTokenCounts(data);
      setFileSystem(initialSystemWithTokens || data);
      if (onFileSystemChange) onFileSystemChange(initialSystemWithTokens || data);

      const validPaths = new Set<string>(getAllChildPaths(initialSystemWithTokens || data));
      const newSelection = new Set<string>();
      selectedFiles.forEach(filePath => { if (validPaths.has(filePath)) newSelection.add(filePath); });
      if (newSelection.size !== selectedFiles.size || !Array.from(newSelection).every(p => selectedFiles.has(p))) {
        onFileSelectionChange(newSelection);
      }
    } catch (error) {
      console.error(`FileExplorer: Error fetching files for ${currentPath}:`, error);
      toast.error(`Failed to load directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setFileSystem(null);
      if (onFileSystemChange) onFileSystemChange(null);
    } finally {
      setIsLoading(false);
    }
  }, [currentPath, onFileSystemChange, selectedFiles, onFileSelectionChange, calculateTokenCounts, settings.respectGitignore, settings.showHiddenFiles]);

  const selectionSignature = React.useMemo(
    () => Array.from(selectedFiles).sort().join('\n'),
    [selectedFiles]
  );

  useEffect(() => {
    if (!fileSystem || isLoading) return;

    const tokenCalculationTimer = setTimeout(() => {
      setIsCountingTokens(true);
      calculateTokenCounts(fileSystem).then(updatedSystem => {
        setFileSystem(prevFs => (prevFs === fileSystem ? updatedSystem : prevFs));
      }).finally(() => {
        setIsCountingTokens(false);
      });
    }, 1000);
    return () => clearTimeout(tokenCalculationTimer);
  }, [selectionSignature, fileSystem, calculateTokenCounts, isLoading]);

  useEffect(() => {
    if (currentPath) {
      setExpandedFolders(new Set([currentPath]));
      setFileSystem(null);
      fetchFiles();
    }
  }, [currentPath, fetchFiles]);

  const handleToggleSelect = (path: string) => {
    const newSelection = new Set(selectedFiles);
    const node = fileSystem && findNode(fileSystem, path);
    if (!node) return;

    const toggleNodeAndChildren = (currentNode: FileNode, select: boolean) => {
      if (currentNode.type === 'file') {
        if (matchesFilePatterns(currentNode.name, includePatterns, excludePatterns)) {
          if (select) newSelection.add(currentNode.path); else newSelection.delete(currentNode.path);
        }
      } else if (currentNode.children) {
        currentNode.children.forEach(child => toggleNodeAndChildren(child, select));
      }
    };

    if (node.type === 'directory') {
      const getSelectableChildren = (dirNode: FileNode): FileNode[] => {
        if (!dirNode.children) return [];
        let selectable: FileNode[] = [];
        dirNode.children.forEach(child => {
          if (child.type === 'file') {
            if (matchesFilePatterns(child.name, includePatterns, excludePatterns)) selectable.push(child);
          } else {
            selectable = selectable.concat(getSelectableChildren(child));
          }
        });
        return selectable;
      };
      const allSelectableChildren = getSelectableChildren(node);
      const isAnyChildSelected = allSelectableChildren.some(child => selectedFiles.has(child.path));
      toggleNodeAndChildren(node, !isAnyChildSelected);
    } else {
      if (matchesFilePatterns(node.name, includePatterns, excludePatterns)) {
        if (newSelection.has(path)) newSelection.delete(path); else newSelection.add(path);
      } else {
        toast.warning(`Cannot select: ${node.name} doesn't match patterns.`);
      }
    }
    onFileSelectionChange(newSelection);
  };

  const handleToggleExpand = async (path: string) => {
    const newExpandedFolders = new Set(expandedFolders);
    if (newExpandedFolders.has(path)) newExpandedFolders.delete(path); else newExpandedFolders.add(path);
    setExpandedFolders(newExpandedFolders);
  };

  const handleRefresh = async () => {
    setFileSystem(null);
    await fetchFiles();
    toast.success("File tree refreshed!");
  };

  const commonAddNewPattern = (
    newPattern: string, currentLocalString: string, setLocalString: (val: string) => void, isInclude: boolean
  ) => {
      const existingPatterns = currentLocalString.split(',').map(p => p.trim()).filter(Boolean);
      if (!existingPatterns.includes(newPattern)) {
          const updatedPatterns = [...existingPatterns, newPattern];
          setLocalString(updatedPatterns.join(','));
          if (isInclude) {
              const otherPatterns = localExcludeInput.split(',').map(p => p.trim()).filter(p => p !== newPattern);
              setLocalExcludeInput(otherPatterns.join(','));
          } else {
              const otherPatterns = localIncludeInput.split(',').map(p => p.trim()).filter(p => p !== newPattern);
              setLocalIncludeInput(otherPatterns.join(','));
          }
      }
  };

  const handleAddNewPatternInput = (
    event: React.KeyboardEvent<HTMLInputElement>, currentPatternText: string, setCurrentPatternText: (text: string) => void,
    localPatternInputString: string, setLocalPatternInputString: (text: string) => void, isInclude = true
  ) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const newPatternVal = currentPatternText.trim();
      if (newPatternVal) {
        commonAddNewPattern(newPatternVal, localPatternInputString, setLocalPatternInputString, isInclude);
        setCurrentPatternText('');
      }
    }
  };

  const handleSuggestionClick = (
    suggestedPattern: string, localPatternInputString: string, setLocalPatternInputString: (text: string) => void,
    inputRef: React.RefObject<HTMLInputElement | null>, isInclude = true
  ) => {
    commonAddNewPattern(suggestedPattern, localPatternInputString, setLocalPatternInputString, isInclude);
    if (isInclude) setNewIncludePatternText(''); else setNewExcludePatternText('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleFocus = (isInclude: boolean) => {
    const timeoutRef = isInclude ? includeBlurTimeoutRef : excludeBlurTimeoutRef;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isInclude) setIsIncludeFocused(true); else setIsExcludeFocused(true);
  };

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement>,
    newPatternText: string,
    setNewPatternText: (text: string) => void,
    localPatternInputString: string,
    setLocalPatternInputString: (text: string) => void,
    isInclude: boolean
  ) => {
    const timeoutRef = isInclude ? includeBlurTimeoutRef : excludeBlurTimeoutRef;
    const setIsFocused = isInclude ? setIsIncludeFocused : setIsExcludeFocused;
    const dropdownDataType = isInclude ? 'data-include-dropdown' : 'data-exclude-dropdown';

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const relatedTarget = e.relatedTarget as Node | null;
      const dropdownElements = document.querySelectorAll(`[${dropdownDataType}="true"]`);
      const clickedOnDropdown = Array.from(dropdownElements).some(el => el.contains(relatedTarget) || el === relatedTarget);

      if (document.activeElement !== e.target && !clickedOnDropdown) {
        setIsFocused(false);
        const patternToAddOnBlur = newPatternText.trim();
        if (patternToAddOnBlur) {
          commonAddNewPattern(patternToAddOnBlur, localPatternInputString, setLocalPatternInputString, isInclude);
          setNewPatternText('');
        }
      }
    }, 150); // Slightly shorter delay might feel more responsive
  };

  const removePattern = (
    patternToRemove: string,
    localPatternInputString: string,
    setLocalPatternInputString: (text: string) => void,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    const currentPatternsArray = localPatternInputString.split(',').map(s => s.trim()).filter(Boolean);
    const newLocalArray = currentPatternsArray.filter(p => p !== patternToRemove);
    setLocalPatternInputString(newLocalArray.join(','));

    const timeoutRef = inputRef === includeInputRef ? includeBlurTimeoutRef : excludeBlurTimeoutRef;
    if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
    }
    inputRef.current?.focus();
  };


  return (
    <div className="h-full flex flex-col border rounded-lg">
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between space-x-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 justify-start text-sm overflow-hidden" aria-label={`Current directory: ${currentPath}. Click to change.`}>
                <FolderOpen className="mr-2 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{currentPath}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Select Directory</DialogTitle>
                <DialogDescription>
                  Choose the folder to browse before filtering and selecting files for export.
                </DialogDescription>
              </DialogHeader>
              <DirectoryPicker
                currentPath={currentPath}
                workspaceRoot={workspaceRoot}
                onSelect={(path) => {
                  if (path !== currentPath) onPathChange(path);
                  setIsDialogOpen(false);
                }}
                onClose={() => setIsDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading} className="flex-shrink-0" aria-label="Refresh file tree">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </Button>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground" role="status" aria-live="polite">
          <div>Selected: {isCountingTokens ? 'Calculating...' : `${totalSelectedTokens.toLocaleString()} Tokens`} {settings.useSimplifiedTokenCount && " (simplified)"} {tokenPercentage > 0 && (<span className="ml-2">({tokenPercentage.toFixed(1)}%)</span>)}</div>
          <div>{settings.maxModelContext > 0 && (<span>Max: {settings.maxModelContext.toLocaleString()}</span>)}</div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
          <Label htmlFor="filter" className="w-16 text-right flex-shrink-0">Filter</Label>
          <Input 
            id="filter" 
            value={localFilterInput} 
            onChange={(e) => setLocalFilterInput(e.target.value)} 
            onFocus={() => setIsFilterInputFocused(true)}
            onBlur={() => setIsFilterInputFocused(false)}
            placeholder="Filter files (e.g., name)..." 
            className="flex-1"
          />
        </div>

        {/* Include Patterns Input */}
        <div className="flex flex-col sm:flex-row sm:items-start space-y-2 sm:space-y-0 sm:space-x-2">
          <Label htmlFor="include-patterns-input" className="w-16 text-right flex-shrink-0 pt-2 sm:pt-1.5">Include</Label>
          <div className="flex-1 relative">
            <div className="flex flex-wrap items-center gap-1 p-2 border border-input rounded-md min-h-[36px] focus-within:ring-1 focus-within:ring-ring">
              {localIncludeInput.split(',').map(p => p.trim()).filter(Boolean).map((pattern, index) => (
                <Badge key={`include-${index}-${pattern}`} variant="secondary" className="flex items-center gap-1 my-0.5">
                  <span>{pattern}</span>
                  <button type="button" aria-label={`Remove pattern ${pattern}`} className="ml-0.5 rounded-full hover:bg-background/30 p-0.5"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removePattern(pattern, localIncludeInput, setLocalIncludeInput, includeInputRef); }}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Input ref={includeInputRef} id="include-patterns-input" type="text" value={newIncludePatternText}
                onChange={(e) => setNewIncludePatternText(e.target.value)}
                onKeyDown={(e) => handleAddNewPatternInput(e, newIncludePatternText, setNewIncludePatternText, localIncludeInput, setLocalIncludeInput, true)}
                placeholder={localIncludeInput.split(',').map(p => p.trim()).filter(Boolean).length === 0 ? "Patterns (e.g., *.tsx)" : "Add..."}
                className="flex-1 h-auto p-1 border-0 shadow-none focus-visible:ring-0 min-w-[100px] bg-transparent"
                onFocus={() => handleFocus(true)}
                onBlur={(e) => handleBlur(e, newIncludePatternText, setNewIncludePatternText, localIncludeInput, setLocalIncludeInput, true)}
              />
            </div>
            {isIncludeFocused && (newIncludePatternText || availableExtensions.length > 0) && (
              <div data-include-dropdown="true" className="absolute z-10 mt-1 w-full bg-background border border-input rounded-md shadow-md max-h-[200px] overflow-y-auto">
                {(newIncludePatternText ? availableExtensions.filter(extInfo =>
                    !localIncludeInput.split(',').map(p=>p.trim()).filter(Boolean).includes(extInfo.pattern) &&
                    !excludePatterns.includes(extInfo.pattern) &&
                    (extInfo.extension.toLowerCase().includes(newIncludePatternText.toLowerCase().replace(/^\*\.?/, '')) ||
                     extInfo.pattern.toLowerCase().includes(newIncludePatternText.toLowerCase()))
                  ) : availableExtensions.filter(extInfo =>
                    !localIncludeInput.split(',').map(p=>p.trim()).filter(Boolean).includes(extInfo.pattern) &&
                    !excludePatterns.includes(extInfo.pattern)
                  )
                ).slice(0, 15).map(extInfo => (
                  <div key={`include-sugg-${extInfo.pattern}`} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center justify-between"
                    onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(extInfo.pattern, localIncludeInput, setLocalIncludeInput, includeInputRef, true);}}>
                    <span>{extInfo.pattern}</span><span className="text-muted-foreground text-sm">{extInfo.count} files</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Exclude Patterns Input */}
        <div className="flex flex-col sm:flex-row sm:items-start space-y-2 sm:space-y-0 sm:space-x-2">
          <Label htmlFor="exclude-patterns-input" className="w-16 text-right flex-shrink-0 pt-2 sm:pt-1.5">Exclude</Label>
          <div className="flex-1 relative">
            <div className="flex flex-wrap items-center gap-1 p-2 border border-input rounded-md min-h-[36px] focus-within:ring-1 focus-within:ring-ring">
              {localExcludeInput.split(',').map(p => p.trim()).filter(Boolean).map((pattern, index) => (
                <Badge key={`exclude-${index}-${pattern}`} variant="secondary" className="flex items-center gap-1 my-0.5">
                  <span>{pattern}</span>
                  <button type="button" aria-label={`Remove pattern ${pattern}`} className="ml-0.5 rounded-full hover:bg-background/30 p-0.5"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removePattern(pattern, localExcludeInput, setLocalExcludeInput, excludeInputRef); }}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Input ref={excludeInputRef} id="exclude-patterns-input" type="text" value={newExcludePatternText}
                onChange={(e) => setNewExcludePatternText(e.target.value)}
                onKeyDown={(e) => handleAddNewPatternInput(e, newExcludePatternText, setNewExcludePatternText, localExcludeInput, setLocalExcludeInput, false)}
                placeholder={localExcludeInput.split(',').map(p => p.trim()).filter(Boolean).length === 0 ? "Patterns (e.g., *.test.ts)" : "Add..."}
                className="flex-1 h-auto p-1 border-0 shadow-none focus-visible:ring-0 min-w-[100px] bg-transparent"
                onFocus={() => handleFocus(false)}
                onBlur={(e) => handleBlur(e, newExcludePatternText, setNewExcludePatternText, localExcludeInput, setLocalExcludeInput, false)}
              />
            </div>
            {isExcludeFocused && (newExcludePatternText || availableExtensions.length > 0) && (
              <div data-exclude-dropdown="true" className="absolute z-10 mt-1 w-full bg-background border border-input rounded-md shadow-md max-h-[200px] overflow-y-auto">
                 {(newExcludePatternText ? availableExtensions.filter(extInfo =>
                    !localExcludeInput.split(',').map(p=>p.trim()).filter(Boolean).includes(extInfo.pattern) &&
                    !includePatterns.includes(extInfo.pattern) &&
                    (extInfo.extension.toLowerCase().includes(newExcludePatternText.toLowerCase().replace(/^\*\.?/, '')) ||
                     extInfo.pattern.toLowerCase().includes(newExcludePatternText.toLowerCase()))
                  ) : availableExtensions.filter(extInfo =>
                    !localExcludeInput.split(',').map(p=>p.trim()).filter(Boolean).includes(extInfo.pattern) &&
                    !includePatterns.includes(extInfo.pattern)
                  )
                ).slice(0, 15).map(extInfo => (
                  <div key={`exclude-sugg-${extInfo.pattern}`} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center justify-between"
                    onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(extInfo.pattern, localExcludeInput, setLocalExcludeInput, excludeInputRef, false); }}>
                    <span>{extInfo.pattern}</span><span className="text-muted-foreground text-sm">{extInfo.count} files</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div 
            className="w-full bg-muted rounded-full h-2 overflow-hidden" 
            role="progressbar" 
            aria-valuenow={tokenPercentage} 
            aria-valuemin={0} 
            aria-valuemax={100}
            aria-label={`Token usage: ${tokenPercentage.toFixed(1)}%`}
          >
            <div className={`h-full ${tokenPercentage > 90 ? 'bg-destructive' : tokenPercentage > 70 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${tokenPercentage}%` }}></div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="space-y-2" aria-label="Loading file tree">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted ml-4" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted ml-4" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted ml-8" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted ml-4" />
          </div>
        ) : fileSystem ? (
          <FileTree node={fileSystem} level={0} selectedFiles={selectedFiles} expandedFolders={expandedFolders}
            filter={debouncedFilter} includePatterns={includePatterns} excludePatterns={excludePatterns}
            maxModelContext={settings.maxModelContext} settings={settings}
            onToggleSelect={handleToggleSelect} onToggleExpand={handleToggleExpand}
          />
        ) : (<div className="text-sm text-muted-foreground">Directory not found or inaccessible: {currentPath}</div>)}
      </div>
    </div>
  );
};
