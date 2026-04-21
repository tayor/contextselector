import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Copy, FileText, Loader2, Download, RotateCcw, Send, Wand2, Scissors, ChevronDown, Settings } from 'lucide-react';
import { toast } from 'sonner';
import type { MarkdownSettings, PromptTemplate } from '@/app/components/SettingsDialog';
export type { MarkdownSettings, PromptTemplate } from '@/app/components/SettingsDialog';

// Lazy load heavy components
const SettingsDialog = dynamic(
  () => import('@/app/components/SettingsDialog').then(mod => ({ default: mod.SettingsDialog })),
  { loading: () => <Button variant="outline" size="sm" disabled><Loader2 className="h-4 w-4 mr-2 animate-spin" />Settings</Button> }
);

const ApiResponseModal = dynamic(
  () => import('@/app/components/ApiResponseModal').then(mod => ({ default: mod.ApiResponseModal })),
  { ssr: false }
);
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MarkdownOutputProps {
  markdown: string;
  selectedCount: number;
  onReset: () => void;
  isGenerating: boolean;
  settings: MarkdownSettings;
  onSettingsChange: (settings: MarkdownSettings) => void;
  onGenerateMarkdown: () => void;
  onFileSelectionChange?: (newSelection: Set<string>) => void;
}

export const MarkdownOutput: React.FC<MarkdownOutputProps> = ({
  markdown,
  selectedCount,
  onGenerateMarkdown,
  onReset,
  isGenerating,
  settings,
  onSettingsChange,
  onFileSelectionChange,
}) => {
  const [promptText, setPromptText] = useState('');
  const [apiResponse, setApiResponse] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Add new state for templates
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const prevIsGenerating = useRef(isGenerating); // Ref to track previous generation state

  // Fetch templates on component mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch('/api/templates');
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load prompt templates');
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Apply a template to the current prompt
  const applyTemplate = (template: PromptTemplate) => {
    // Replace {{code}} with the markdown content if present
    let newPrompt = template.template;
    if (markdown && newPrompt.includes("{{code}}")) {
      newPrompt = newPrompt.replace(/{{code}}/g, markdown);
    }
    setPromptText(newPrompt);
    toast.success(`Applied template: ${template.name}`);
  };

  // Group templates by category for the dropdown
  const groupedTemplates = templates.reduce((groups, template) => {
    const category = template.category || 'Uncategorized';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(template);
    return groups;
  }, {} as Record<string, PromptTemplate[]>);

  // Helper function to extract file paths from markdown
  const extractFilePathsFromMarkdown = (markdown: string): string[] => {
    const pathRegex = /### File: ([^\n]+)/g;
    const paths: string[] = [];
    let match;
    while ((match = pathRegex.exec(markdown)) !== null) {
      paths.push(match[1].trim());
    }
    return paths;
  };

  // Helper function to extract file paths from Gemini response
  const extractFilePathsFromResponse = (response: string): string[] => {
    try {
      // First attempt: Try to parse as JSON
      try {
        // Clean the response - remove markdown code blocks
        const cleanedResponse = response.replace(/```json|```/g, '').trim();
        const jsonResult = JSON.parse(cleanedResponse);
        if (Array.isArray(jsonResult)) {
          return jsonResult.filter(item => typeof item === 'string');
        }
      } catch {
        // Ignore parse error, proceed to next method
      }

      // Second attempt: Find a JSON array pattern in the response
      const jsonArrayMatch = response.match(/\[\s*(?:"[^"]*"(?:\s*,\s*"[^"]*")*)\s*\]/);
      if (jsonArrayMatch) {
        try {
          const jsonArray = JSON.parse(jsonArrayMatch[0]);
          if (Array.isArray(jsonArray)) {
            return jsonArray.filter(item => typeof item === 'string');
          }
        } catch {
          // Ignore parse error, proceed to next method
        }
      }

      // Third attempt: Use regex to find file paths in various formats
      const filePathsSet = new Set<string>();

      // Match absolute paths (/path/to/file.ext)
      const absolutePathRegex = /(?:\/[^\/\s\n"']+)+\.[a-zA-Z0-9]+/g;
      const absoluteMatches = response.match(absolutePathRegex) || [];
      absoluteMatches.forEach(match => filePathsSet.add(match));

      // Match quoted paths ("path/to/file.ext" or 'path/to/file.ext')
      const quotedPathRegex = /["'`]([^"'`\n]+\.[a-zA-Z0-9]+)["'`]/g;
      let quotedMatch;
      while ((quotedMatch = quotedPathRegex.exec(response)) !== null) {
        filePathsSet.add(quotedMatch[1]);
      }

      // Match paths in list items (- path/to/file.ext or * path/to/file.ext)
      const listItemPathRegex = /[-*]\s+(?:`)?([^`\n]+\.[a-zA-Z0-9]+)(?:`)?/g;
      let listMatch;
      while ((listMatch = listItemPathRegex.exec(response)) !== null) {
        filePathsSet.add(listMatch[1]);
      }

      return Array.from(filePathsSet);
    } catch (error) {
      console.error('Error extracting file paths:', error);
      return [];
    }
  };

  const handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success('Markdown copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
      console.error(error);
    }
  };

  const handleDownloadClick = useCallback(() => {
    try {
      // Create a blob with the markdown content
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);

      // Create a temporary link element
      const link = document.createElement('a');
      link.href = url;

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `markdown-${timestamp}.md`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Markdown file downloaded!');
    } catch (error) {
      toast.error('Failed to download markdown file');
      console.error(error);
    }
  }, [markdown]);

  const handleSendToGemini = async () => {
    if (!markdown) {
      toast.error('No markdown content to send');
      return;
    }

    if (!promptText.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    if (!settings.apiKey) {
      toast.error('API key is required. Please set it in the settings.');
      return;
    }

    setIsModalOpen(true);
    setIsProcessing(true);
    setApiResponse('');

    try {
      const genAI = new GoogleGenerativeAI(settings.apiKey);
      const model = genAI.getGenerativeModel({ model: settings.selectedModel });

      // Combine prompt with markdown content
      const fullPrompt = `${promptText}\n\nHere is the codebase/document to reference:\n\n${markdown}`;

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      setApiResponse(text);
    } catch (error) {
      console.error('Error processing request:', error);
      setApiResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
      toast.error('Failed to process request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOptimizePrompt = async () => {
    if (!promptText.trim()) {
      toast.error('Please enter a prompt to optimize');
      return;
    }

    if (!settings.apiKey) {
      toast.error('API key is required. Please set it in the settings.');
      return;
    }

    setIsProcessing(true);
    try {
      const genAI = new GoogleGenerativeAI(settings.apiKey);
      const model = genAI.getGenerativeModel({ model: settings.selectedModel });

      const metaPrompt = `You are a prompt engineer tasked with optimizing a prompt. Your task is to optimize the prompt below for clarity, conciseness, and effectiveness based on the provided markdown context.

CRITICAL INSTRUCTIONS:
1. Return ONLY the optimized prompt text.
2. DO NOT include any explanations, reasoning, options, or alternatives.
3. DO NOT prefix your response with anything like "Optimized prompt:" or similar.
4. DO NOT use quotation marks around the optimized prompt.
5. Your entire response must be just the optimized prompt - nothing else.

Markdown Context:
${markdown || 'No markdown context available.'}

Prompt to optimize:
${promptText}

Remember: Respond ONLY with the optimized prompt text and absolutely nothing else.`;

      const result = await model.generateContent(metaPrompt);
      const response = await result.response;
      const optimizedPrompt = response.text().trim();

      if (optimizedPrompt) {
        setPromptText(optimizedPrompt);
        toast.success('Prompt optimized!');
      } else {
        toast.error('Received empty response from LLM');
      }
    } catch (error) {
      console.error('Error optimizing prompt:', error);
      toast.error('Failed to optimize prompt');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReduceContext = async () => {
    if (!markdown) {
      toast.error('No context to reduce');
      return;
    }

    if (!promptText.trim()) {
      toast.error('Please enter a prompt to help identify relevant files');
      return;
    }

    if (!settings.apiKey) {
      toast.error('API key is required. Please set it in the settings.');
      return;
    }

    if (!onFileSelectionChange) {
      toast.error('File selection function not available');
      return;
    }

    setIsModalOpen(true);
    setIsProcessing(true);
    setApiResponse('Analyzing context and finding essential files...');

    try {
      // Extract the files currently in the markdown
      const currentFiles = extractFilePathsFromMarkdown(markdown);
      if (currentFiles.length === 0) {
        throw new Error('No files found in the current context');
      }

      const genAI = new GoogleGenerativeAI(settings.apiKey);
      const model = genAI.getGenerativeModel({ model: settings.selectedModel });

      // Include the list of files to make it easier for the LLM
      const reductionPrompt = `
You are an expert file selector tasked with reducing the context size for an LLM.

GIVEN INFORMATION:
1. Current prompt: "${promptText}"
2. Available files in the context:
${currentFiles.map(file => `   - ${file}`).join('\n')}
3. Full content of these files is in the markdown below:
${markdown}

YOUR TASK:
1. Analyze the user's prompt and all files in the context.
2. Identify ONLY the essential files needed to properly answer the prompt.
3. Return a list of file paths that should be kept.

RESPONSE FORMAT:
- Return ONLY a JSON array containing the essential file paths as strings, like this:
["path/to/file1.ext", "path/to/file2.ext"]
- Do not include any explanation, notes, or other text outside the JSON array.
- If ALL files seem necessary, include all file paths.
- If NO files seem necessary, return an empty array: []

IMPORTANT: Only include files from the list provided above. Double-check that every file path you return exactly matches one from the list.
`;

      const result = await model.generateContent(reductionPrompt);
      const response = await result.response;
      const responseText = response.text();

      // Extract file paths from the response
      const suggestedFiles = extractFilePathsFromResponse(responseText);

      if (suggestedFiles.length === 0) {
        throw new Error('No file paths found in the Gemini response');
      }

      // Validate the suggested files against the current files in markdown
      const validFiles = suggestedFiles.filter(file => currentFiles.includes(file));

      if (validFiles.length === 0) {
        throw new Error('None of the suggested files match the files in your current context');
      }

      // Update the file selection
      const newSelection = new Set(validFiles);
      onFileSelectionChange(newSelection);

      // Format the response for display
      const formattedResponse = `
# Context Reduction Summary

I've analyzed your prompt and identified the essential files:

${validFiles.map(file => `- \`${file}\``).join('\n')}

${validFiles.length < suggestedFiles.length ?
  `\n**Note:** ${suggestedFiles.length - validFiles.length} suggested files were not found in your current context and were ignored.` : ''}

${validFiles.length < currentFiles.length ?
  `\nReduced from ${currentFiles.length} to ${validFiles.length} files (${Math.round((1 - validFiles.length / currentFiles.length) * 100)}% reduction).` :
  `\nAll files in the current context appear to be relevant for your prompt.`}

The file selection has been updated. A new markdown will be generated automatically with only these files.
`;

      setApiResponse(formattedResponse);

      // Auto-generate markdown after selection is updated
      setTimeout(() => {
        onGenerateMarkdown();
      }, 300);

      toast.success(`Context reduced to ${validFiles.length} files`);
    } catch (error) {
      console.error('Error reducing context:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setApiResponse(`# Error Reducing Context\n\n${errorMessage}\n\nPlease try again with a more specific prompt.`);
      toast.error(`Failed to reduce context: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Effect to handle auto-download after generation completes
  useEffect(() => {
    // Check if generation just finished (was true, now false)
    if (prevIsGenerating.current && !isGenerating) {
      // Check if auto-download is enabled and markdown exists and is not an error message
      if (settings.autoDownloadMarkdown && markdown && !markdown.startsWith('Error generating markdown:')) {
        console.log("Auto-downloading markdown...");
        handleDownloadClick();
      }
    }

    // Update the ref *after* the check
    prevIsGenerating.current = isGenerating;
  }, [isGenerating, markdown, settings.autoDownloadMarkdown, handleDownloadClick]); // Dependencies: isGenerating, markdown, the setting, and the handler

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <div className="text-sm text-muted-foreground">
            Selected files: {selectedCount}
          </div>
          {/* Token count display moved to FileExplorer component */}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={selectedCount === 0 && !markdown}
            aria-label="Reset file selection and markdown output"
          >
            <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateMarkdown}
            disabled={selectedCount === 0 || isGenerating}
            aria-label={isGenerating ? 'Generating markdown, please wait' : 'Generate markdown from selected files'}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            {isGenerating ? 'Generating...' : 'Generate Markdown'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyClick}
            disabled={!markdown}
            aria-label="Copy markdown to clipboard"
          >
            <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadClick}
            disabled={!markdown}
            aria-label="Download markdown as file"
          >
            <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            Download
          </Button>
          <SettingsDialog
            settings={settings}
            onSettingsChange={onSettingsChange}
          />
        </div>
      </div>

      {/* Updated prompt input area with template dropdown */}
      <div className="flex flex-col space-y-2 mb-4">
        <Textarea
          placeholder="Enter your prompt to analyze the markdown content..."
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          className="flex-1 min-w-0 min-h-[100px] resize-y"
          aria-label="Prompt input for AI analysis"
        />
        <div className="flex space-x-2">
          <div className="flex-1 flex">
            <Button
              onClick={handleSendToGemini}
              disabled={!markdown || !promptText.trim() || !settings.apiKey || isProcessing}
              className="rounded-r-none flex-grow"
              aria-label="Send prompt to Gemini AI"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              Ask Gemini
            </Button>

            {/* Template dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  className="rounded-l-none border-l border-primary-foreground/20"
                  disabled={!settings.apiKey}
                  aria-label="Select prompt template"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Prompt Templates</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {isLoadingTemplates ? (
                  <DropdownMenuItem disabled>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading templates...
                  </DropdownMenuItem>
                ) : templates.length === 0 ? (
                  <DropdownMenuItem disabled>
                    No templates found
                  </DropdownMenuItem>
                ) : (
                  Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                    <React.Fragment key={category}>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        {category}
                      </DropdownMenuLabel>
                      {categoryTemplates.map(template => (
                        <DropdownMenuItem
                          key={template.id}
                          onClick={() => applyTemplate(template)}
                        >
                          {template.name}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </React.Fragment>
                  ))
                )}

                <DropdownMenuItem
                  onClick={() => {
                    // Open settings dialog and navigate to templates tab
                    const settingsButton = document.querySelector('[aria-label="Settings"]');
                    if (settingsButton && 'click' in settingsButton) {
                      (settingsButton as HTMLElement).click();
                    }
                    setTimeout(() => {
                      const templatesTab = document.querySelector('[value="templates"]');
                      if (templatesTab && 'click' in templatesTab) {
                        (templatesTab as HTMLElement).click();
                      }
                    }, 100);
                  }}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Templates
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button
            onClick={handleOptimizePrompt}
            disabled={!promptText.trim() || !settings.apiKey || isProcessing}
            variant="outline"
            className="flex-1"
            aria-label="Optimize prompt using AI"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Optimize Prompt
          </Button>
          <Button
            onClick={handleReduceContext}
            disabled={!markdown || !settings.apiKey || isProcessing}
            variant="outline"
            className="flex-1"
            aria-label="Reduce context by selecting only relevant files"
          >
            <Scissors className="h-4 w-4 mr-2" aria-hidden="true" />
            Reduce Context
          </Button>
        </div>
      </div>

      <div className="flex-1 relative mb-4">
        <pre 
          className="absolute inset-0 bg-muted rounded-lg p-4 overflow-auto whitespace-pre-wrap break-words"
          aria-label="Generated markdown output"
          tabIndex={0}
        >
          <code className="text-sm">
            {markdown || 'No files selected'}
          </code>
        </pre>
      </div>

      {/* API Response Modal */}
      <ApiResponseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        response={apiResponse}
        loading={isProcessing}
      />
    </div>
  );
};
