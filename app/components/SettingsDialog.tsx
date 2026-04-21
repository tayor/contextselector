"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Settings, Moon, Sun, Eye, EyeOff, LogOut, Key } from 'lucide-react';
import { toast } from 'sonner';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRouter } from 'next/navigation';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS } from '@/lib/geminiModels';

// Add template interface
export interface PromptTemplate {
  id: number;
  name: string;
  description: string;
  template: string;
  category: string;
  is_default: boolean;
}

export interface MarkdownSettings {
  includeFileTree: boolean;
  includePrompt: boolean;
  includeGitDiff: boolean;
  defaultPrompt: string;
  includePatterns: string[];
  excludePatterns: string[];
  isDarkMode: boolean;
  useSimplifiedTokenCount: boolean;
  maxModelContext: number;
  selectedModel: string;
  apiKey: string;
  autoDownloadMarkdown: boolean;
  csvPreviewRows: number;
  respectGitignore: boolean;
  showHiddenFiles: boolean;
}

interface SettingsDialogProps {
  settings: MarkdownSettings;
  onSettingsChange: (settings: MarkdownSettings) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  settings,
  onSettingsChange,
}): React.ReactNode => {
  const [localSettings, setLocalSettings] = useState<MarkdownSettings>(settings);

  // Add useEffect to track changes to settings prop
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const [open, setOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Add new state for password management
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const router = useRouter();

  // Add new state for templates
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

  const [, setActiveTab] = useState("appearance");



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

  const handleCreateTemplate = async () => {
    if (!templateName || !templateText) {
      toast.error('Name and template text are required');
      return;
    }

    setIsCreatingTemplate(true);
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: templateName,
          description: templateDescription,
          template: templateText,
          category: templateCategory,
          is_default: isDefault
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create template');
      }

      // Reset form
      setTemplateName("");
      setTemplateDescription("");
      setTemplateText("");
      setTemplateCategory("");
      setIsDefault(false);
      setIsCreatingTemplate(false);

      // Refresh templates
      await fetchTemplates();
      toast.success('Template created successfully');
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to create template');
      setIsCreatingTemplate(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !templateName || !templateText) {
      toast.error('Name and template text are required');
      return;
    }

    setIsCreatingTemplate(true);
    try {
      const response = await fetch(`/api/templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: templateName,
          description: templateDescription,
          template: templateText,
          category: templateCategory,
          is_default: isDefault
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update template');
      }

      // Reset form
      setEditingTemplate(null);
      setTemplateName("");
      setTemplateDescription("");
      setTemplateText("");
      setTemplateCategory("");
      setIsDefault(false);
      setIsCreatingTemplate(false);

      // Refresh templates
      await fetchTemplates();
      toast.success('Template updated successfully');
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error('Failed to update template');
      setIsCreatingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete template');
      }

      // Refresh templates
      await fetchTemplates();
      toast.success('Template deleted successfully');
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const editTemplate = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setTemplateText(template.template);
    setTemplateCategory(template.category || "");
    setIsDefault(template.is_default ? true : false);
  };

  const cancelEdit = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateDescription("");
    setTemplateText("");
    setTemplateCategory("");
    setIsDefault(false);
  };

  // Load templates and ensure a valid Gemini model when the dialog opens
  useEffect(() => {
    if (open) {
      fetchTemplates();
      if (!GEMINI_MODELS.some((model) => model.modelId === localSettings.selectedModel)) {
        setLocalSettings((prev) => ({ ...prev, selectedModel: DEFAULT_GEMINI_MODEL }));
      }
    }
  }, [open, localSettings.selectedModel]);

  const handleSave = async () => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(localSettings),
      });
      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      onSettingsChange(localSettings);
      setOpen(false);
      toast.success('Settings saved!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    }
  };

  const testApiKey = async () => {
    if (!localSettings.apiKey || !localSettings.selectedModel) {
      toast.error('Please provide an API key and select a model');
      return;
    }
    const toastId = toast.loading('Testing API key...');
    try {
      const genAI = new GoogleGenerativeAI(localSettings.apiKey);
      const model = genAI.getGenerativeModel({ model: localSettings.selectedModel });
      const result = await model.generateContent('Hello');
      // Just verify we can get a response without errors
      await result.response;
      toast.success('API key is valid!', { id: toastId });
    } catch (error) {
      console.error('Error testing API key:', error);
      toast.error('Invalid API key or model', { id: toastId });
    }
  };

  // Add new handlers
  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Logged out successfully');
        router.push('/login');
      } else {
        toast.error('Failed to logout');
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('An error occurred during logout');
    }
  };

  const handleChangePassword = async () => {
    // Validate inputs
    if (!currentPassword) {
      toast.error('Current password is required');
      return;
    }

    if (!newPassword) {
      toast.error('New password is required');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (response.ok) {
        toast.success('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to change password');
      }
    } catch (error) {
      console.error('Change password error:', error);
      toast.error('An error occurred while changing password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Settings">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage appearance, markdown generation, Gemini, templates, and security settings for this workspace.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="markdown">Markdown</TabsTrigger>
            <TabsTrigger value="api">API Settings</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-4 py-4">
            <div className="flex items-center justify-between bg-accent/50 p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <Label htmlFor="theme-mode" className="text-lg font-medium">Theme</Label>
                {localSettings.isDarkMode ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Sun className="h-5 w-5" />
                )}
              </div>
              <Switch
                id="theme-mode"
                checked={localSettings.isDarkMode}
                onCheckedChange={(checked) => {
                  setLocalSettings((prev) => ({ ...prev, isDarkMode: checked }));
                  document.documentElement.classList.toggle('dark', checked);
                }}
              />
            </div>
          </TabsContent>

          {/* Markdown Generation Tab */}
          <TabsContent value="markdown" className="space-y-4 py-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="file-tree">Include File Tree</Label>
                <Switch
                  id="file-tree"
                  checked={localSettings.includeFileTree}
                  onCheckedChange={(checked) =>
                    setLocalSettings((prev) => ({ ...prev, includeFileTree: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="include-prompt">Include Default Prompt</Label>
                <Switch
                  id="include-prompt"
                  checked={localSettings.includePrompt}
                  onCheckedChange={(checked) =>
                    setLocalSettings((prev) => ({ ...prev, includePrompt: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="include-git-diff">Include Git Diff</Label>
                <Switch
                  id="include-git-diff"
                  checked={localSettings.includeGitDiff}
                  onCheckedChange={(checked) =>
                    setLocalSettings((prev) => ({ ...prev, includeGitDiff: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-download">Auto-download after generation</Label>
                <Switch
                  id="auto-download"
                  checked={localSettings.autoDownloadMarkdown}
                  onCheckedChange={(checked) =>
                    setLocalSettings((prev) => ({ ...prev, autoDownloadMarkdown: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="respect-gitignore">Respect .gitignore files</Label>
                <Switch
                  id="respect-gitignore"
                  checked={localSettings.respectGitignore}
                  onCheckedChange={(checked) =>
                    setLocalSettings((prev) => ({ ...prev, respectGitignore: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-hidden-files">Show hidden files (starting with &apos;.&apos;)</Label>
                <Switch
                  id="show-hidden-files"
                  checked={localSettings.showHiddenFiles}
                  onCheckedChange={(checked) =>
                    setLocalSettings((prev) => ({ ...prev, showHiddenFiles: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="token-counting-method">Use Simplified Token Counting</Label>
                <Switch
                  id="token-counting-method"
                  checked={localSettings.useSimplifiedTokenCount}
                  onCheckedChange={(checked) =>
                    setLocalSettings((prev) => ({ ...prev, useSimplifiedTokenCount: checked }))
                  }
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Simplified counting is faster but less accurate
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="max-model-context">Max Model Context (Tokens)</Label>
                <Input
                  type="number"
                  id="max-model-context"
                  value={localSettings.maxModelContext}
                  className="w-32 text-right"
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      maxModelContext: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-prompt">Default Prompt Text</Label>
                <Textarea
                  id="default-prompt"
                  placeholder="Enter your default prompt text in markdown format..."
                  value={localSettings.defaultPrompt}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      defaultPrompt: e.target.value,
                    }))
                  }
                  className="min-h-[100px]"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="csv-preview-rows">CSV Preview Rows</Label>
                <Input
                  type="number"
                  id="csv-preview-rows"
                  value={localSettings.csvPreviewRows}
                  min="0" // Allow 0 rows
                  className="w-32 text-right"
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      csvPreviewRows: Math.max(0, Number(e.target.value)), // Allow 0, prevent negative
                    }))
                  }
                />
              </div>
            </div>
          </TabsContent>

        {/* API Settings Tab */}
          <TabsContent value="api" className="space-y-4 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="selected-model">Model</Label>
                <select
                  id="selected-model"
                  value={localSettings.selectedModel}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, selectedModel: e.target.value }))
                  }
                  className="w-full p-2 border rounded bg-background text-foreground border-input"
                >
                  {GEMINI_MODELS.map((model) => (
                    <option key={model.id} value={model.modelId}>
                      {model.displayName} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    value={localSettings.apiKey}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, apiKey: e.target.value }))
                    }
                    placeholder="Enter your API key"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testApiKey}
                    disabled={!localSettings.apiKey || !localSettings.selectedModel}
                    >
                      Test Key
                    </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* New Templates Tab */}
          <TabsContent value="templates" className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left column - Template Editor */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">
                  {editingTemplate ? "Edit Template" : "Create New Template"}
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="template-name">Name</Label>
                  <Input
                    id="template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="E.g., Code Review"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-description">Description (Optional)</Label>
                  <Input
                    id="template-description"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="What this template is used for"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-category">Category (Optional)</Label>
                  <Input
                    id="template-category"
                    value={templateCategory}
                    onChange={(e) => setTemplateCategory(e.target.value)}
                    placeholder="E.g., Development, Testing, Documentation"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-text">Template Text</Label>
                  <Textarea
                    id="template-text"
                    value={templateText}
                    onChange={(e) => setTemplateText(e.target.value)}
                    placeholder="Enter your prompt template here. Use double curly braces around 'code' to reference the selected code."
                    className="min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {'{'}{'{'}<span>code</span>{'}'}{'}}'} as a placeholder for code from selected files.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is-default"
                    checked={isDefault}
                    onCheckedChange={(checked) => {
                      setIsDefault(checked === true);
                    }}
                  />
                  <Label htmlFor="is-default">Set as default template</Label>
                </div>

                <div className="flex space-x-2 pt-2">
                  {editingTemplate ? (
                    <>
                      <Button
                        onClick={handleUpdateTemplate}
                        disabled={isCreatingTemplate}
                        className="flex-1"
                      >
                        {isCreatingTemplate ? "Updating..." : "Update Template"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={cancelEdit}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleCreateTemplate}
                      disabled={isCreatingTemplate}
                      className="w-full"
                    >
                      {isCreatingTemplate ? "Creating..." : "Create Template"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Right column - Templates List */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Your Templates</h3>

                {isLoadingTemplates ? (
                  <div className="flex items-center justify-center p-4">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
                    <span className="ml-2">Loading templates...</span>
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    No templates found. Create your first one!
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] border rounded-md">
                    <div className="space-y-2 p-4">
                      {templates.map((template) => (
                        <div key={template.id} className="border rounded-md p-3">
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className="font-medium">{template.name}</h4>
                              {template.category && (
                                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {template.category}
                                </span>
                              )}
                            </div>
                            <div className="flex space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => editTemplate(template)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => handleDeleteTemplate(template.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                          {template.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {template.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </TabsContent>

          {/* New Security Tab */}
          <TabsContent value="security" className="space-y-4 py-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Change Password</h3>
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
                className="w-full"
              >
                {isChangingPassword ? (
                  <>Changing Password...</>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    Change Password
                  </>
                )}
              </Button>
              <div className="pt-4 border-t mt-4">
                <Button
                  variant="destructive"
                  onClick={handleLogout}
                  className="w-full"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
