import { NextRequest, NextResponse } from 'next/server';
import { openDb } from '@/lib/db';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Get template by ID
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  const db = await openDb();

  try {
    const { id } = await params;
    
    const template = await db.get('SELECT * FROM prompt_templates WHERE id = ?', [id]);
    
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  } finally {
    await db.close();
  }
}

// Update template
export async function PUT(
  request: NextRequest,
  { params }: RouteContext
) {
  const db = await openDb();

  try {
    const { id } = await params;
    const { name, description, template, category, is_default } = await request.json();
    
    if (!name || !template) {
      return NextResponse.json(
        { error: 'Name and template are required' },
        { status: 400 }
      );
    }
    
    // Check if template exists
    const existingTemplate = await db.get('SELECT * FROM prompt_templates WHERE id = ?', [id]);
    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    
    await db.run(
      'UPDATE prompt_templates SET name = ?, description = ?, template = ?, category = ?, is_default = ? WHERE id = ?',
      [name, description || '', template, category || '', is_default || 0, id]
    );
    
    const updatedTemplate = await db.get('SELECT * FROM prompt_templates WHERE id = ?', [id]);
    
    return NextResponse.json(updatedTemplate);
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  } finally {
    await db.close();
  }
}

// Delete template
export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
) {
  const db = await openDb();

  try {
    const { id } = await params;
    
    // Check if template exists
    const template = await db.get('SELECT * FROM prompt_templates WHERE id = ?', [id]);
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    
    await db.run('DELETE FROM prompt_templates WHERE id = ?', [id]);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  } finally {
    await db.close();
  }
} 
