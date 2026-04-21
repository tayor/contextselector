import { NextRequest, NextResponse } from 'next/server';
import { openDb } from '@/lib/db';

// Get all templates
export async function GET() {
  const db = await openDb();

  try {
    const templates = await db.all('SELECT * FROM prompt_templates ORDER BY category, name');
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  } finally {
    await db.close();
  }
}

// Create a new template
export async function POST(request: NextRequest) {
  const db = await openDb();

  try {
    const { name, description, template, category, is_default } = await request.json();
    
    if (!name || !template) {
      return NextResponse.json(
        { error: 'Name and template are required' },
        { status: 400 }
      );
    }
    
    const result = await db.run(
      'INSERT INTO prompt_templates (name, description, template, category, is_default) VALUES (?, ?, ?, ?, ?)',
      [name, description || '', template, category || '', is_default || 0]
    );
    
    const newTemplate = await db.get('SELECT * FROM prompt_templates WHERE id = ?', [result.lastID]);
    
    return NextResponse.json(newTemplate);
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  } finally {
    await db.close();
  }
}
