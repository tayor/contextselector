'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useProjectTabStore } from '@/lib/store/projectTabStore';
import { PlusIcon, Cross2Icon } from '@radix-ui/react-icons';
import { cn } from '@/lib/utils';

const ProjectTabManager: React.FC<{ currentPath: string }> = ({ currentPath }) => {
  const { 
    projectTabs, 
    activeProjectTabId, 
    createProjectTab, 
    setActiveProjectTab, 
    deleteProjectTab,
    renameProjectTab
  } = useProjectTabStore();

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreateTab = () => {
    createProjectTab(currentPath);
  };

  const handleTabChange = (tabId: string) => {
    setActiveProjectTab(tabId);
  };

  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    deleteProjectTab(tabId);
  };

  const handleTabDoubleClick = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    setEditingTabId(tabId);
    setEditingName(projectTabs[tabId].displayName);
  };

  const handleSaveEdit = () => {
    if (editingTabId && editingName.trim()) {
      renameProjectTab(editingTabId, editingName.trim());
    }
    setEditingTabId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingTabId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b bg-background" role="tablist" aria-label="Project tabs">
      <div className="flex-1 flex items-center gap-1 overflow-x-auto">
        {Object.entries(projectTabs).map(([tabId, tabData]) => (
          <button
            key={tabId}
            role="tab"
            aria-selected={activeProjectTabId === tabId}
            aria-controls={`tabpanel-${tabId}`}
            id={`tab-${tabId}`}
            tabIndex={activeProjectTabId === tabId ? 0 : -1}
            onClick={() => handleTabChange(tabId)}
            onDoubleClick={(e) => handleTabDoubleClick(e, tabId)}
            onKeyDown={(e) => {
              const tabIds = Object.keys(projectTabs);
              const currentIndex = tabIds.indexOf(tabId);
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % tabIds.length;
                handleTabChange(tabIds[nextIndex]);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
                handleTabChange(tabIds[prevIndex]);
              }
            }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors relative group",
              activeProjectTabId === tabId
                ? "bg-primary/10 text-primary"
                : "hover:bg-muted",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            )}
          >
            {editingTabId === tabId ? (
              <input
                ref={inputRef}
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={handleKeyDown}
                className="bg-transparent border-none outline-none text-sm min-w-0 flex-1"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span>{tabData.displayName}</span>
            )}
            {Object.keys(projectTabs).length > 1 && editingTabId !== tabId && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Close ${tabData.displayName} tab`}
                className="opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring rounded"
                onClick={(e) => handleTabClose(e, tabId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTabClose(e as unknown as React.MouseEvent, tabId);
                  }
                }}
              >
                <Cross2Icon className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
      </div>
      <button
        onClick={handleCreateTab}
        className="p-1 hover:bg-muted rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        title="New Tab"
        aria-label="Create new project tab"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

export default ProjectTabManager; 