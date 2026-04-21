import { NextRequest, NextResponse } from 'next/server';
import type { TiktokenModel } from 'tiktoken';
import { countTokens } from '@/utils/tokenizer';

export async function POST(request: NextRequest) {
  let text: string = '';
  let model: TiktokenModel = 'gpt-4';
  let useSimplified: boolean = false;
  
  try {
    // Parse the request body
    const body = await request.json();
    
    // Extract and validate the text parameter
    if (typeof body.text !== 'string') {
      return NextResponse.json(
        { error: 'Text must be a string' },
        { status: 400 }
      );
    }
    
    text = body.text;
    model = (body.model as TiktokenModel) || 'gpt-4';
    useSimplified = body.useSimplified || false;

    const count = await countTokens(text, model, useSimplified);
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error counting tokens:', error);
    
    // If text was successfully extracted before the error
    if (text) {
      const count = Math.ceil(text.length / 4);
      return NextResponse.json({ 
        count,
        approximated: true
      });
    }
    
    // If we couldn't even get the text
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
};
