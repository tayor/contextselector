import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

interface ProjectTabState {
  displayName: string;
  directoryPath: string;
  filter: string;
  includePatterns: string[];
  excludePatterns: string[];
  selectedFiles: Set<string>;
  markdownOutput: string;
  tokenCount: number;
}

interface ProjectTabStore {
  projectTabs: Record<string, ProjectTabState>;
  activeProjectTabId: string | null;
  createProjectTab: (initialPath: string) => string;
  deleteProjectTab: (tabId: string) => void;
  setActiveProjectTab: (tabId: string) => void;
  renameProjectTab: (tabId: string, newName: string) => void;
  updateProjectTab: (tabId: string, partialUpdate: Partial<ProjectTabState>) => void;
}

export const useProjectTabStore = create<ProjectTabStore>((set) => ({
  projectTabs: {
    'tab1': {
      displayName: 'Root',
      directoryPath: '/',
      filter: '',
      includePatterns: [],
      excludePatterns: [],
      selectedFiles: new Set(),
      markdownOutput: '',
      tokenCount: 0
    },
  },
  activeProjectTabId: 'tab1',

  createProjectTab: (initialPath) => {
    const newTabId = uuidv4();
    
    // Extract smart default name from the path
    const getSmartTabName = (dirPath: string): string => {
      if (!dirPath || dirPath === '/') {
        return 'Root';
      }
      const baseName = path.basename(dirPath);
      return baseName || 'Untitled';
    };
    
    const smartName = getSmartTabName(initialPath);
    
    set(state => ({
      projectTabs: {
        ...state.projectTabs,
        [newTabId]: {
          displayName: smartName,
          directoryPath: initialPath,
          filter: '',
          includePatterns: [],
          excludePatterns: [],
          selectedFiles: new Set(),
          markdownOutput: '',
          tokenCount: 0
        },
      },
      activeProjectTabId: newTabId,
    }));
    return newTabId;
  },

  deleteProjectTab: (tabId) => {
    set(state => {
      if (Object.keys(state.projectTabs).length <= 1) {
        return state; // Don't delete the last tab
      }

      const updatedTabs = { ...state.projectTabs };
      delete updatedTabs[tabId];
      
      let newActiveTabId = state.activeProjectTabId;
      if (state.activeProjectTabId === tabId) {
        const tabKeys = Object.keys(updatedTabs);
        newActiveTabId = tabKeys[0];
      }
      
      return {
        projectTabs: updatedTabs,
        activeProjectTabId: newActiveTabId,
      };
    });
  },

  setActiveProjectTab: (tabId) => {
    set({ activeProjectTabId: tabId });
  },

  renameProjectTab: (tabId, newName) => {
    set(state => ({
      projectTabs: {
        ...state.projectTabs,
        [tabId]: { ...state.projectTabs[tabId], displayName: newName },
      },
    }));
  },

  updateProjectTab: (tabId, partialUpdate) => {
    set(state => ({
      projectTabs: {
        ...state.projectTabs,
        [tabId]: { ...state.projectTabs[tabId], ...partialUpdate },
      },
    }));
  },
})); 