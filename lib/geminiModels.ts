export interface GeminiModelOption {
  id: number;
  displayName: string;
  modelId: string;
  provider: string;
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 1,
    displayName: 'Gemini 3.1 Pro Preview',
    modelId: 'gemini-3.1-pro-preview',
    provider: 'Google',
  },
  {
    id: 2,
    displayName: 'Gemini 3 Flash Preview',
    modelId: 'gemini-3-flash-preview',
    provider: 'Google',
  },
];

export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0].modelId;

export function isValidGeminiModel(modelId: string | null | undefined): boolean {
  return Boolean(modelId) && GEMINI_MODELS.some((model) => model.modelId === modelId);
}
