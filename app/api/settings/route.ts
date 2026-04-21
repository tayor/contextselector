import { NextRequest, NextResponse } from 'next/server';
import { openDb } from '@/lib/db';
import type { MarkdownSettings } from '@/app/components/SettingsDialog';
import { DEFAULT_GEMINI_MODEL, isValidGeminiModel } from '@/lib/geminiModels';

type SettingsData = Omit<MarkdownSettings, 'csvPreviewRows'> & {
  csvPreviewRows: number | string;
};

async function getLocalSettings() {
  const db = await openDb();

  try {
    const settings = await db.get('SELECT * FROM settings LIMIT 1');
    if (!settings) {
      throw new Error('Settings not found');
    }

    try {
      settings.includePatterns = JSON.parse(settings.includePatterns || '[]');
      settings.excludePatterns = JSON.parse(settings.excludePatterns || '[]');
    } catch {
      settings.includePatterns = [];
      settings.excludePatterns = [];
    }

    settings.autoDownloadMarkdown = Boolean(settings.autoDownloadMarkdown);
    settings.csvPreviewRows = Number(settings.csvPreviewRows ?? 5);
    settings.respectGitignore = Boolean(settings.respectGitignore);
    settings.showHiddenFiles = Boolean(settings.showHiddenFiles);
    settings.includeGitDiff = Boolean(settings.includeGitDiff);
    settings.apiKey = '';
    if (!isValidGeminiModel(settings.selectedModel)) {
      settings.selectedModel = DEFAULT_GEMINI_MODEL;
    }

    return settings;
  } finally {
    await db.close();
  }
}

async function setLocalSettings(settings: SettingsData) {
  const db = await openDb();

  try {
    const settingsToSave = { ...settings, apiKey: '' };

    try {
      settingsToSave.includePatterns = settings.includePatterns || [];
      settingsToSave.excludePatterns = settings.excludePatterns || [];
    } catch {
      settingsToSave.includePatterns = [];
      settingsToSave.excludePatterns = [];
    }

    await db.run(
      `
        UPDATE settings SET
          includeFileTree = ?,
          includePrompt = ?,
          defaultPrompt = ?,
          includePatterns = ?,
          excludePatterns = ?,
          isDarkMode = ?,
          useSimplifiedTokenCount = ?,
          maxModelContext = ?,
          selectedModel = ?,
          includeGitDiff = ?,
          autoDownloadMarkdown = ?,
          csvPreviewRows = ?,
          respectGitignore = ?,
          showHiddenFiles = ?
        WHERE id = 1
      `,
      [
        settingsToSave.includeFileTree,
        settingsToSave.includePrompt,
        settingsToSave.defaultPrompt,
        JSON.stringify(settingsToSave.includePatterns || []),
        JSON.stringify(settingsToSave.excludePatterns || []),
        settingsToSave.isDarkMode,
        settingsToSave.useSimplifiedTokenCount,
        settingsToSave.maxModelContext,
        settingsToSave.selectedModel,
        settingsToSave.includeGitDiff ? 1 : 0,
        settingsToSave.autoDownloadMarkdown ? 1 : 0,
        Number(settingsToSave.csvPreviewRows ?? 5),
        settingsToSave.respectGitignore ? 1 : 0,
        settingsToSave.showHiddenFiles ? 1 : 0,
      ]
    );
  } finally {
    await db.close();
  }
}

export async function GET() {
  try {
    const settings = await getLocalSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const settings = await request.json();
    await setLocalSettings(settings);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
