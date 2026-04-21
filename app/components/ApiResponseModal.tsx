"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

interface ApiResponseModalProps {
  isOpen: boolean;
  onClose: () => void;
  response: string;
  loading: boolean;
}

export const ApiResponseModal: React.FC<ApiResponseModalProps> = ({
  isOpen,
  onClose,
  response,
  loading,
}) => {
  const handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(response);
      toast.success('Response copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
      console.error(error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Gemini API Response</DialogTitle>
          <DialogDescription>
            Review the generated Gemini response and copy it to your clipboard if needed.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
              <span className="ml-3">Processing...</span>
            </div>
          ) : (
            <div className="bg-muted rounded-lg p-4 max-h-[50vh] overflow-auto">
              <pre className="whitespace-pre-wrap break-words text-sm">
                {response || 'No response received.'}
              </pre>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCopyClick} disabled={!response || loading}>
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 
