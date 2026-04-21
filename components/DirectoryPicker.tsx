'use client';

import React, { useState, useEffect } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, ChevronDown, Folder, FolderOpen, ArrowUp, Home } from 'lucide-react';
import { FileNode } from '@/types/files';
import path from 'path';
import { toast } from "sonner";

interface DirectoryPickerProps {
  currentPath: string;
  workspaceRoot: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export const DirectoryPicker: React.FC<DirectoryPickerProps> = ({
  currentPath,
  workspaceRoot,
  onSelect,
  onClose,
}) => {
  const [selectedPath, setSelectedPath] = useState(currentPath);
  const [fileSystem, setFileSystem] = useState<FileNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([currentPath]));
  const [isLoading, setIsLoading] = useState(false);

  const fetchDirectories = async (path: string) => {
    setIsLoading(true);
    try {
      // Only fetch one level for directory picker
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}&depth=1`);
      if (!response.ok) {
        throw new Error(`Failed to fetch directories: ${response.statusText}`);
      }
      const data = await response.json();
      setFileSystem(data);
      setExpandedFolders(new Set([path]));
      setSelectedPath(path); // Ensure the selected path is updated
    } catch (error) {
      console.error('Error fetching directories:', error);
      toast.error(`Failed to fetch directories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentPath) {
      fetchDirectories(currentPath);
    }
  }, [currentPath]);

  const handleToggleExpand = async (nodePath: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(nodePath)) {
      newExpanded.delete(nodePath);
    } else {
      newExpanded.add(nodePath);
      await fetchDirectories(nodePath);
    }
    setExpandedFolders(newExpanded);
  };

  const handleSelect = () => {
    // Ensure the path is properly formatted and exists
    if (selectedPath) {
      // Update the path first
      onSelect(selectedPath);
      // Then close the dialog
      onClose();
    } else {
      toast.error('Please select a valid directory');
    }
  };

  const navigateUp = async () => {
    const parentPath =
      selectedPath === workspaceRoot ? workspaceRoot : path.dirname(selectedPath);
    setSelectedPath(parentPath);
    await fetchDirectories(parentPath);
  };

  const navigateToRoot = async () => {
    const rootPath = workspaceRoot;
    setSelectedPath(rootPath);
    await fetchDirectories(rootPath);
  };

  const renderDirectoryTree = (node: FileNode, level = 0) => {
    if (!node || node.type === 'file') return null;

    const isExpanded = expandedFolders.has(node.path);
    const isSelected = node.path === selectedPath;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center space-x-2 py-1 px-2 cursor-pointer hover:bg-accent rounded-md ${
            isSelected ? 'bg-accent' : ''
          }`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => {
            setSelectedPath(node.path);
            if (!isExpanded) {
              handleToggleExpand(node.path);
            }
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleExpand(node.path);
            }}
            className="focus:outline-none"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {isExpanded ? (
            <FolderOpen className="h-4 w-4" />
          ) : (
            <Folder className="h-4 w-4" />
          )}
          <span className="flex-1">{node.name}</span>
        </div>
        {isExpanded && node.children && (
          <div>
            {node.children
              .filter(child => child.type === 'directory')
              .map((child) => renderDirectoryTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="dir-path">Current Directory</Label>
        <div className="flex space-x-2">
          <Input
            id="dir-path"
            value={selectedPath}
            onChange={(e) => setSelectedPath(e.target.value)}
            placeholder="Enter directory path..."
          />
          <Button
            variant="outline"
            size="icon"
            onClick={navigateUp}
            title="Go to parent directory"
            disabled={selectedPath === workspaceRoot}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={navigateToRoot}
            title="Go to root directory"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[300px] border rounded-md p-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : fileSystem ? (
          renderDirectoryTree(fileSystem)
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground">No directories found</span>
          </div>
        )}
      </ScrollArea>
      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSelect}>Select</Button>
      </div>
    </div>
  );
};
