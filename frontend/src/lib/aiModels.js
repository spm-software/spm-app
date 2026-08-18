export const AI_MODELS = [
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
];

export const DEFAULT_AI_SETTINGS = {
  classification_model: "gpt-5.4-mini",
  correction_model: "gpt-5.6-luna",
  duplicate_model: "gpt-5.6-terra",
};

export const getAiModelLabel = (value) => (
  AI_MODELS.find((model) => model.value === value)?.label || value
);
