"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface FileContentDialogProps {
  open: boolean;
  onClose: () => void;
  filePath: string | null;
}

export const FileContentDialog: React.FC<FileContentDialogProps> = ({
  open,
  onClose,
  filePath,
}) => {
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchContent = async () => {
      if (!filePath) return;
      setIsLoading(true);
      try {
        const response = await fetch(`/api/file-content?path=${encodeURIComponent(filePath)}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        // Get the response data once
        const responseData = await response.json();
        const apiContentValue = responseData.content;
        // Ensure content is a string
        const content = (typeof apiContentValue === 'string') ? apiContentValue : '';
        setFileContent(content);
      } catch (error: unknown) {
        console.error("Failed to fetch file content:", error);
        toast.error(`Failed to fetch file content: ${error instanceof Error ? error.message : String(error)}`);
        setFileContent('Error loading content.');
      } finally {
        setIsLoading(false);
      }
    };

    if (open && filePath) {
      fetchContent();
    } else {
      setFileContent('');
      setIsLoading(false);
    }
  }, [open, filePath]);

  if (!filePath) return null; // Don't render if no filePath

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[80%] sm:max-h-[80%]">
        <DialogHeader>
          <DialogTitle>File Content</DialogTitle>
          <DialogDescription>{filePath}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <Textarea
              readOnly
              value={fileContent}
              className="font-mono text-sm resize-none min-h-[400px]"
            />
          )}
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};