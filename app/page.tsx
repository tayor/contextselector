'use client';

import { useState, useCallback, useEffect } from 'react';
import path from 'path';
import { FileExplorer } from '@/components/FileExplorer';
import { MarkdownOutput } from '@/components/MarkdownOutput';
import { MarkdownSettings } from '@/app/components/SettingsDialog';
import { toast } from 'sonner';
import { matchesFilePatterns } from '@/utils/fileUtils';
import { useProjectTabStore } from '@/lib/store/projectTabStore';
import ProjectTabManager from '@/app/components/ProjectTabManager';
import { DEFAULT_GEMINI_MODEL } from '@/lib/geminiModels';

// Default settings (remains global)
const DEFAULT_SETTINGS: MarkdownSettings = {
  includeFileTree: true,
  includePrompt: false,
  includeGitDiff: false,
  defaultPrompt: '# Project Documentation\\n\\nThis documentation was automatically generated and includes the following files:\\n',
  includePatterns: [], // These might be global defaults, but FileExplorer will use per-tab ones
  excludePatterns: [], // These might be global defaults, but FileExplorer will use per-tab ones
  isDarkMode: true,
  useSimplifiedTokenCount: true,
  maxModelContext: 1000000,
  selectedModel: DEFAULT_GEMINI_MODEL,
  apiKey: '',
  autoDownloadMarkdown: true,
  csvPreviewRows: 5,
  respectGitignore: true,
  showHiddenFiles: false,
};

// Define the type for the internal tree structure used by generateFileTree
interface TreeNode { [key: string]: TreeNode | null }

export default function Home() {
  // Remove component-level currentPath state
  // const [currentPath, setCurrentPath] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [settings, setSettings] = useState<MarkdownSettings>(DEFAULT_SETTINGS);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [workspaceRoot, setWorkspaceRoot] = useState('/');

  // Get active tab data and update function from store
  const activeTabId = useProjectTabStore(state => state.activeProjectTabId);
  const activeTab = useProjectTabStore(state =>
    state.activeProjectTabId ? state.projectTabs[state.activeProjectTabId] : null
  );
  const updateProjectTab = useProjectTabStore(state => state.updateProjectTab);
  const projectTabs = useProjectTabStore(state => state.projectTabs); // Needed for ProjectTabManager path

  // Derive path from active tab state
  const currentPathForExplorer = activeTab?.directoryPath || workspaceRoot;
  const currentPathForTabManager = activeTab?.directoryPath || workspaceRoot;


  // Load global settings from API
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to fetch settings');
        const settingsFromDb = await response.json();
        setSettings(settingsFromDb);
        document.documentElement.classList.toggle('dark', settingsFromDb.isDarkMode);
      } catch (error) {
        console.error('Error loading settings:', error);
        setSettings(DEFAULT_SETTINGS);
        document.documentElement.classList.toggle('dark', DEFAULT_SETTINGS.isDarkMode);
      }
    };
    loadSettings();
  }, []);

  // Fetch initial workspace path and set it for the *initial* tab
  useEffect(() => {
    const fetchWorkspacePath = async () => {
      // Only run if there's an active tab and its path might be the initial default ('/')
      const initialTabId = Object.keys(projectTabs)[0]; // Assume the first tab is the initial one
      if (!initialTabId || projectTabs[initialTabId]?.directoryPath !== '/') {
         setIsWorkspaceLoading(false); // Skip if path seems already set
         return;
      }

      try {
        setIsWorkspaceLoading(true);
        const response = await fetch('/api/workspace-path');
        if (!response.ok) throw new Error(`Failed to fetch workspace path: HTTP ${response.status}`);
        const { path } = await response.json();
        setWorkspaceRoot(path);

        // Update the initial tab's path and name in the store
        if (path && initialTabId) {
           // Extract smart name from path
           const getSmartTabName = (dirPath: string): string => {
             if (!dirPath || dirPath === '/') {
               return 'Root';
             }
             const baseName = dirPath.split('/').pop();
             return baseName || 'Untitled';
           };
           const smartName = getSmartTabName(path);
           updateProjectTab(initialTabId, { 
             directoryPath: path,
             displayName: smartName
           });
        } else {
           // If we couldn't get a path, maybe keep default or handle error
           updateProjectTab(initialTabId, { directoryPath: '/' }); // Fallback
        }

      } catch (error) {
        console.error('Home: Failed to fetch workspace path:', error);
        toast.error('Failed to load workspace path: ' + (error instanceof Error ? error.message : 'Unknown error'));
        // Ensure the initial tab still has a path, even if it's just root
        const initialTabIdFallback = Object.keys(projectTabs)[0];
        if(initialTabIdFallback) {
            updateProjectTab(initialTabIdFallback, { directoryPath: '/' });
        }
      } finally {
        setIsWorkspaceLoading(false);
      }
    };

    fetchWorkspacePath();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on initial mount


  // Update active tab's path in the store
  const handlePathChange = useCallback((newPath: string) => {
    if (activeTabId && newPath !== activeTab?.directoryPath) {
      updateProjectTab(activeTabId, {
        directoryPath: newPath,
        // Reset selection/output when path changes? Optional, depends on desired UX
        selectedFiles: new Set(),
        markdownOutput: '',
        tokenCount: 0
      });
    }
  }, [activeTabId, activeTab?.directoryPath, updateProjectTab]);

  // Update active tab's selected files in the store
  const handleFileSelectionChange = useCallback((newSelection: Set<string>) => {
    if (activeTabId) {
      updateProjectTab(activeTabId, { selectedFiles: newSelection });
    }
  }, [activeTabId, updateProjectTab]);

  // ----- Add handlers for filter/pattern changes -----
  const handleFilterChange = useCallback((newFilter: string) => {
    if (activeTabId) {
      updateProjectTab(activeTabId, { filter: newFilter });
    }
  }, [activeTabId, updateProjectTab]);

  const handleIncludePatternsChange = useCallback((newPatterns: string[]) => {
    if (activeTabId) {
      updateProjectTab(activeTabId, { includePatterns: newPatterns });
    }
  }, [activeTabId, updateProjectTab]);

  const handleExcludePatternsChange = useCallback((newPatterns: string[]) => {
    if (activeTabId) {
      updateProjectTab(activeTabId, { excludePatterns: newPatterns });
    }
  }, [activeTabId, updateProjectTab]);
  // ----- End Add handlers -----


  // (countTokens, etc. remain largely the same)
  const countTokens = async (text: string) => {
    try {
      const response = await fetch('/api/count-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          useSimplified: settings.useSimplifiedTokenCount
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to count tokens');
      }

      const { count } = await response.json();
      return count;
    } catch (error) {
      console.error('Error counting tokens:', error);
      return 0;
    }
  };

  const generateFileTree = (files: string[]): string => {
    const tree: TreeNode = {};
    // Get the base path from the active tab
    const basePath = activeTab?.directoryPath;
    if (!basePath) {
      console.warn("Cannot generate file tree without a base path (activeTab.directoryPath)");
      return ''; // Return empty if no base path
    }

    files.forEach(file => {
      // Use path.relative for robustness
      const relativePath = path.relative(basePath, file);
      if (!relativePath || relativePath.startsWith('..')) return; // Skip files outside base
      const parts = relativePath.split(path.sep); // Use path.sep for cross-platform compatibility
      let current = tree;

      parts.forEach((part, i) => {
        if(!part) return; // Skip empty parts potentially caused by splitting
        if (i === parts.length - 1) {
          current[part] = null;
        } else {
          current[part] = current[part] || {};
          if (current[part] !== null) { // Ensure we don't overwrite a file node
            // Important: Check if it's actually an object before descending
            if (typeof current[part] === 'object') {
              current = current[part] as TreeNode;
            } else {
              // Handle potential conflict (e.g., a file and directory with the same prefix)
              console.warn(`Path conflict detected at ${part} in ${relativePath}`);
              current[part] = {}; // Overwrite/ensure it's an object to proceed
              current = current[part] as TreeNode;
            }
          }
        }
      });
    });

    if (Object.keys(tree).length === 0) {
      return '';
    }

    // Revised printTree function
    const printTree = (node: TreeNode, prefix = ''): string => {
       let result = '';
       const entries = Object.entries(node);
       entries.forEach(([key, value], index) => {
          const isLast = index === entries.length - 1;
          const connector = isLast ? '└── ' : '├── ';
          // Use actual newline characters \n
          result += `${prefix}${connector}${key}\n`;
          if (value !== null && typeof value === 'object') {
             // Adjust prefix correctly: use spaces if last, pipe if not
             const newPrefix = prefix + (isLast ? '    ' : '│   ');
             result += printTree(value, newPrefix);
          }
       });
       return result;
    };

    // Get the base directory name for the root label
    const baseDirName = path.basename(basePath) || '/'; // Handle '/' case
    // Use actual newline \n and no escaped characters
    return `\`\`\`\n${baseDirName}\n` + printTree(tree) + '```\n\n';
  };


   const generateMarkdown = async () => {
     if (!activeTabId || !activeTab) return; // Ensure activeTab exists

     setIsGenerating(true);
     updateProjectTab(activeTabId, { markdownOutput: 'Generating...', tokenCount: 0 }); // Show generating state
     let hasErrors = false;
     let markdown = '';

     try {
        const sortedFiles = Array.from(activeTab.selectedFiles).sort();

       // Add prompt if needed (using global settings)
       if (settings.includePrompt) {
         markdown += settings.defaultPrompt + '\\n\\n';
       }

       // Add file tree if needed (using global settings for inclusion, but content is per-tab selection)
       if (settings.includeFileTree) {
         // Pass only the selected files relative to the project root for the tree
         markdown += generateFileTree(sortedFiles);
       }

       // Add Git diff if enabled (using global settings)
       if (settings.includeGitDiff) {
          markdown += await getGitDiffMarkdown();
        }

        // Validate files
        const validationResponse = await fetch('/api/validate-files', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ files: sortedFiles }),
       });

       if (!validationResponse.ok) throw new Error('Failed to validate files');
        const { validFiles } = await validationResponse.json();

       // Process valid files in batches
       const BATCH_SIZE = 5;
       let processedContent = ''; // Accumulate content separately
       for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
         const batch = validFiles.slice(i, i + BATCH_SIZE); // Pass settings to processFile
         const batchResults = await Promise.all(batch.map((filePath: string) => processFile(filePath, activeTab.includePatterns, activeTab.excludePatterns))); // Pass per-tab patterns

         batchResults.forEach(result => {
           if (result.content) {
             processedContent += result.content;
           } else if (result.error) {
             console.error(result.error);
             hasErrors = true; // Mark errors but continue processing
           }
         });

         // Update progress (optional)
         const progressPercent = Math.round(((i + BATCH_SIZE) / validFiles.length) * 100);
         updateProjectTab(activeTabId, {
            markdownOutput: markdown + processedContent + `\\n\\n_Processing files... ${Math.min(progressPercent, 100)}%_`,
            tokenCount: 0
          });
       }
       markdown += processedContent; // Add accumulated content

       // Count tokens and finalize
       const tokenCount = await countTokens(markdown); // Use global setting for simplified count? Pass settings.useSimplifiedTokenCount
       updateProjectTab(activeTabId, { markdownOutput: markdown, tokenCount });

     } catch (error) {
       console.error('Error generating markdown:', error);
       updateProjectTab(activeTabId, { markdownOutput: `Error generating markdown: ${error instanceof Error ? error.message : 'Unknown error'}`, tokenCount: 0 });
       hasErrors = true;
     } finally {
       setIsGenerating(false);
       if (hasErrors) {
         toast.error('Some files could not be processed or were skipped due to errors or filters.');
        } else {
          toast.success('Markdown generated!');
        }
     }
   };

   // Modify processFile to accept patterns and settings
   const processFile = async (filePath: string, includePatterns: string[], excludePatterns: string[]): Promise<{ path: string; content: string | null; error: string | null }> => {
     // Use the global 'settings' state directly, no need to pass explicitly if it's in scope
     const { csvPreviewRows } = settings;
     try {
       const filename = filePath.split('/').pop() || filePath;

        // Use per-tab patterns for filtering
        if (!matchesFilePatterns(filename, includePatterns, excludePatterns)) {
          return { path: filePath, content: null, error: null }; // Return null content if skipped
        }

       // Fetch content
       const response = await fetch(`/api/file-content?path=${encodeURIComponent(filePath)}`);
       if (!response.ok) {
         const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
         throw new Error(errorData.error || `Failed to fetch ${filePath}`);
       }

       // Get the response data once
       const responseData = await response.json();
       const apiContentValue = responseData.content;

       // Ensure 'content' variable used below is definitely a string.
       // If apiContentValue is not a string (e.g. null, undefined, or other type),
       // treat it as empty string to prevent .split() errors and ensure defined behavior.
       const content = (typeof apiContentValue === 'string') ? apiContentValue : '';

       // Only check for null/undefined, allow empty string
        if (content === null || content === undefined) {
          throw new Error(`No content returned for ${filePath}`);
        }

       // Format the file content (handle CSV preview)
       let fileMarkdown = `### File: ${filePath}\n\n`;
        const lang = filePath.toLowerCase().endsWith('.csv') ? 'csv' : (filename.split('.').pop() || ''); // Detect CSV

        if (lang === 'csv' && csvPreviewRows > 0) {
          const lines = content.split('\n');
          const previewContent = lines.slice(0, csvPreviewRows).join('\n');
          fileMarkdown += '```' + lang + '\n';
          fileMarkdown += `<!-- First ${csvPreviewRows} rows of CSV -->\n`;
          fileMarkdown += previewContent;
       } else if (lang === 'csv' && csvPreviewRows === 0) {
         fileMarkdown += '```csv\n<!-- CSV preview disabled in settings -->\n';
       } else {
         fileMarkdown += '```' + lang + '\n';
         fileMarkdown += content;
       }
       fileMarkdown += '\n```\n\n';

       return { path: filePath, content: fileMarkdown, error: null };
     } catch (error) {
       return { path: filePath, content: null, error: `Error processing ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}` };
     }
   };

   const getGitDiffMarkdown = async (): Promise<string> => {
     try {
       const response = await fetch('/api/git-diff');
       if (!response.ok) {
         throw new Error('Failed to fetch git diff');
       }

       const { diff } = await response.json();
       if (typeof diff !== 'string' || diff.trim().length === 0) {
         return '';
       }

       return `## Git Diff\n\n\`\`\`diff\n${diff}\n\`\`\`\n\n`;
     } catch (error) {
       console.error('Error fetching git diff:', error);
       return '';
     }
   };


  const handleReset = useCallback(() => {
    if (activeTabId) {
      updateProjectTab(activeTabId, {
        selectedFiles: new Set(),
        markdownOutput: '',
        tokenCount: 0
      });
    }
  }, [activeTabId, updateProjectTab]);

  // Note: Removed key-based re-mounting to preserve component state on tab switches
  // Components now handle prop changes directly without full re-mount

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Pass path from *active* tab if available, else empty */}
      <ProjectTabManager currentPath={currentPathForTabManager} />
      <div className="flex flex-1 p-4 gap-4 min-h-0">
        <div className="w-full md:w-1/3 md:min-w-[300px] h-full overflow-hidden flex flex-col">
          {!isWorkspaceLoading && currentPathForExplorer ? (
            <FileExplorer
              currentPath={currentPathForExplorer}
              workspaceRoot={workspaceRoot}
              selectedFiles={activeTab?.selectedFiles || new Set()}
              filter={activeTab?.filter || ''}
              includePatterns={activeTab?.includePatterns || []}
              excludePatterns={activeTab?.excludePatterns || []}
              settings={settings} // Global settings
              onFileSelectionChange={handleFileSelectionChange}
              onPathChange={handlePathChange}
              onFilterChange={handleFilterChange} // Pass handler
              onIncludePatternsChange={handleIncludePatternsChange} // Pass handler
              onExcludePatternsChange={handleExcludePatternsChange} // Pass handler
            />
          ) : (
            <div className="h-full flex items-center justify-center border rounded-lg">
              <div className="text-sm text-muted-foreground">
                {isWorkspaceLoading ? "Loading workspace..." : "Select a project tab"}
              </div>
            </div>
          )}
        </div>
        <div className="w-full md:flex-1 flex-1 overflow-hidden flex flex-col">
         {activeTab ? (
           <MarkdownOutput
             markdown={activeTab.markdownOutput}
             selectedCount={activeTab.selectedFiles.size}
             onGenerateMarkdown={generateMarkdown}
             onReset={handleReset}
             isGenerating={isGenerating}
             settings={settings} // Pass global settings
             onSettingsChange={setSettings} // Allow updating global settings
             onFileSelectionChange={handleFileSelectionChange} // Pass down for context reduction
           />
         ) : (
            <div className="h-full flex items-center justify-center border rounded-lg">
              <div className="text-sm text-muted-foreground">
                No active tab selected.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
