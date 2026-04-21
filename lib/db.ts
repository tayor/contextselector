import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import { getDbPath } from './runtimePaths';
import { DEFAULT_GEMINI_MODEL, isValidGeminiModel } from './geminiModels';

let initializationPromise: Promise<void> | null = null;

async function openRawDb() {
  return open({
    filename: getDbPath(),
    driver: sqlite3.Database,
  });
}

export async function initializeDb() {
  if (!initializationPromise) {
    initializationPromise = initializeDbInternal().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  await initializationPromise;
}

export async function openDb() {
  await initializeDb();
  return openRawDb();
}

async function initializeDbInternal() {
  const db = await openRawDb();

  try {
    const toSqlStringLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

    await db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        includeFileTree BOOLEAN,
        includePrompt BOOLEAN,
        defaultPrompt TEXT,
        includePatterns TEXT,
        excludePatterns TEXT,
        isDarkMode BOOLEAN,
        useSimplifiedTokenCount BOOLEAN,
        maxModelContext INTEGER,
        selectedModel TEXT,
        includeGitDiff BOOLEAN DEFAULT 0,
        autoDownloadMarkdown BOOLEAN DEFAULT 1,
        csvPreviewRows INTEGER DEFAULT 5,
        respectGitignore BOOLEAN DEFAULT 1,
        showHiddenFiles BOOLEAN DEFAULT 0
      );
    `);

    let settingsColumns = await db.all("PRAGMA table_info(settings)");
    const refreshSettingsColumns = async () => {
      settingsColumns = await db.all("PRAGMA table_info(settings)");
    };
    const hasColumn = (columnName: string) =>
      settingsColumns.some((column) => column.name === columnName);
    const selectColumnOrDefault = (columnName: string, fallbackSql: string) =>
      hasColumn(columnName) ? columnName : `${fallbackSql} AS ${columnName}`;

    if (hasColumn('apiKey')) {
      await db.exec('BEGIN IMMEDIATE');
      try {
        await db.exec('DROP TABLE IF EXISTS settings_migrated');
        await db.exec(`
          CREATE TABLE settings_migrated (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            includeFileTree BOOLEAN,
            includePrompt BOOLEAN,
            defaultPrompt TEXT,
            includePatterns TEXT,
            excludePatterns TEXT,
            isDarkMode BOOLEAN,
            useSimplifiedTokenCount BOOLEAN,
            maxModelContext INTEGER,
            selectedModel TEXT,
            includeGitDiff BOOLEAN DEFAULT 0,
            autoDownloadMarkdown BOOLEAN DEFAULT 1,
            csvPreviewRows INTEGER DEFAULT 5,
            respectGitignore BOOLEAN DEFAULT 1,
            showHiddenFiles BOOLEAN DEFAULT 0
          );
        `);

        await db.exec(`
          INSERT INTO settings_migrated (
            id, includeFileTree, includePrompt, defaultPrompt, includePatterns, excludePatterns,
            isDarkMode, useSimplifiedTokenCount, maxModelContext, selectedModel, includeGitDiff,
            autoDownloadMarkdown, csvPreviewRows, respectGitignore, showHiddenFiles
          )
          SELECT
            id, includeFileTree, includePrompt, defaultPrompt, includePatterns, excludePatterns,
            isDarkMode, useSimplifiedTokenCount, maxModelContext,
            ${selectColumnOrDefault('selectedModel', toSqlStringLiteral(DEFAULT_GEMINI_MODEL))},
            ${selectColumnOrDefault('includeGitDiff', '0')},
            ${selectColumnOrDefault('autoDownloadMarkdown', '1')},
            ${selectColumnOrDefault('csvPreviewRows', '5')},
            ${selectColumnOrDefault('respectGitignore', '1')},
            ${selectColumnOrDefault('showHiddenFiles', '0')}
          FROM settings;
        `);

        await db.exec('DROP TABLE settings;');
        await db.exec('ALTER TABLE settings_migrated RENAME TO settings;');
        await db.exec('COMMIT');
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
      await refreshSettingsColumns();
    }

    if (!hasColumn('autoDownloadMarkdown')) {
      await db.exec('ALTER TABLE settings ADD COLUMN autoDownloadMarkdown BOOLEAN DEFAULT 1');
    }

    if (!hasColumn('csvPreviewRows')) {
      await db.exec('ALTER TABLE settings ADD COLUMN csvPreviewRows INTEGER DEFAULT 5');
    }

    if (!hasColumn('respectGitignore')) {
      await db.exec('ALTER TABLE settings ADD COLUMN respectGitignore BOOLEAN DEFAULT 1');
    }

    if (!hasColumn('showHiddenFiles')) {
      await db.exec('ALTER TABLE settings ADD COLUMN showHiddenFiles BOOLEAN DEFAULT 0');
    }

    if (!hasColumn('selectedModel')) {
      await db.exec('ALTER TABLE settings ADD COLUMN selectedModel TEXT');
      await db.run(
        'UPDATE settings SET selectedModel = ? WHERE selectedModel IS NULL AND id = 1',
        [DEFAULT_GEMINI_MODEL]
      );
    }

    if (!hasColumn('includeGitDiff')) {
      await db.exec('ALTER TABLE settings ADD COLUMN includeGitDiff BOOLEAN DEFAULT 0');
    }

    const legacyModelsTable = await db.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_models'"
    );
    if (legacyModelsTable) {
      await db.exec('DROP TABLE ai_models');
    }

    const settingsCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM settings');
    if (settingsCount?.count === 0) {
      await db.run(
        `
        INSERT INTO settings (
          includeFileTree, includePrompt, defaultPrompt, includePatterns, excludePatterns,
          isDarkMode, useSimplifiedTokenCount, maxModelContext, selectedModel, includeGitDiff,
          autoDownloadMarkdown, csvPreviewRows, respectGitignore, showHiddenFiles
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          true,
          false,
          '# Project Documentation\n\nThis documentation was automatically generated and includes the following files:\n',
          '[]',
          '[]',
          true,
          true,
          1000000,
          DEFAULT_GEMINI_MODEL,
          0,
          1,
          5,
          1,
          0,
        ]
      );
    } else {
      await db.run('UPDATE settings SET includeGitDiff = 0 WHERE includeGitDiff IS NULL AND id = 1');
      await db.run('UPDATE settings SET csvPreviewRows = 5 WHERE csvPreviewRows IS NULL AND id = 1');
      await db.run('UPDATE settings SET autoDownloadMarkdown = 1 WHERE autoDownloadMarkdown IS NULL AND id = 1');
      await db.run('UPDATE settings SET respectGitignore = 1 WHERE respectGitignore IS NULL AND id = 1');
      await db.run('UPDATE settings SET showHiddenFiles = 0 WHERE showHiddenFiles IS NULL AND id = 1');
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
    `);

    const existingAdmin = await db.get('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await db.run(
        `INSERT INTO users (username, password) VALUES (?, ?)`,
        ['admin', hashedPassword]
      );
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        template TEXT NOT NULL,
        category TEXT,
        is_default BOOLEAN DEFAULT 0
      );
    `);

    const templatesCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM prompt_templates');
    if (templatesCount?.count === 0) {
      await db.run(`
        INSERT INTO prompt_templates (name, description, template, category, is_default) VALUES
        ('Code Review', 'Review code for bugs and improvements', 'Please review the following code for bugs, potential issues, and improvements:\n\n{{code}}', 'Development', 1),
        ('Generate Tests', 'Generate unit tests for code', 'Generate unit tests for the following code. Focus on edge cases and comprehensive coverage:\n\n{{code}}', 'Testing', 0),
        ('Explain Code', 'Explain how code works in simple terms', 'Explain the following code in simple terms. Break down what each section is doing:\n\n{{code}}', 'Documentation', 0),
        ('Optimize Performance', 'Suggest performance optimizations', 'Analyze the following code for performance bottlenecks and suggest specific optimizations:\n\n{{code}}', 'Optimization', 0),
        ('Refactor Code', 'Suggest code refactoring', 'Suggest ways to refactor the following code to improve readability, maintainability, and design patterns:\n\n{{code}}', 'Development', 0)
      `);
    }

    const currentSettings = await db.get<{ selectedModel: string | null }>(
      'SELECT selectedModel FROM settings WHERE id = 1'
    );
    if (currentSettings) {
      if (!isValidGeminiModel(currentSettings.selectedModel)) {
        await db.run('UPDATE settings SET selectedModel = ? WHERE id = 1', [DEFAULT_GEMINI_MODEL]);
      }
    }
  } finally {
    await db.close();
  }
}
