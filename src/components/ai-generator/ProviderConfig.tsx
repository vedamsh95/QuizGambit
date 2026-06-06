import { useState, useEffect } from "react";
import clsx from "clsx";
import { Sparkles, Loader2, Eye, EyeOff, Settings } from "lucide-react";
import { store } from "../../lib/storage";

export type AIProvider = "openai" | "gemini" | "groq";

export interface ProviderConfigProps {
  provider: AIProvider;
  onProviderChange: (provider: AIProvider) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

const DEFAULT_MODELS: Record<AIProvider, string[]> = {
  openai: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
  groq: ["llama3-70b-8192", "mixtral-8x7b-32768", "gemma2-9b-it"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.5-pro-latest"],
};

export default function ProviderConfig({
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  collapsed = false,
  onToggleCollapse,
  className,
}: ProviderConfigProps) {
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<Record<AIProvider, string[]>>(DEFAULT_MODELS);
  const [isFetching, setIsFetching] = useState(false);

  // Load saved key on provider change
  useEffect(() => {
    const savedKeys = store.getAiKeys();
    const saved = savedKeys[provider];
    if (saved && !apiKey) onApiKeyChange(saved);
  }, [provider]);

  const saveKey = (val: string) => {
    onApiKeyChange(val);
    const savedKeys = store.getAiKeys();
    savedKeys[provider] = val;
    store.setAiKeys(savedKeys);
    store.setAiProvider(provider);
  };

  const fetchModels = async () => {
    if (!apiKey) return;
    setIsFetching(true);

    try {
      if (provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          const list = data.data.map((m: any) => m.id).filter((id: string) => id.includes("gpt"));
          if (list.length > 0) setModels((prev) => ({ ...prev, openai: list }));
        }
      } else if (provider === "groq") {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          const list = data.data.map((m: any) => m.id);
          if (list.length > 0) setModels((prev) => ({ ...prev, groq: list }));
        }
      } else if (provider === "gemini") {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        );
        if (res.ok) {
          const data = await res.json();
          const list = data.models.map((m: any) => m.name.replace("models/", ""));
          if (list.length > 0) setModels((prev) => ({ ...prev, gemini: list }));
        }
      }
    } catch {
      // Silently fail — keep defaults
    } finally {
      setIsFetching(false);
    }
  };

  const availableModels = models[provider] || DEFAULT_MODELS[provider];

  // Auto-select first model if current is invalid
  useEffect(() => {
    if (!availableModels.includes(model) && availableModels.length > 0) {
      onModelChange(availableModels[0]);
    }
  }, [provider, availableModels]);

  // Collapsed summary
  if (collapsed) {
    return (
      <div className={clsx("clay p-4", className)}>
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-3 w-full text-left"
        >
          <Settings className="w-4 h-4 text-plum/40" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="clay-badge bg-soft-purple-light text-soft-purple text-[9px]">
              {provider}
            </span>
            <span className="text-[10px] text-plum/50 font-medium">{model}</span>
          </div>
          <span className="ml-auto text-[10px] font-bold text-plum/40 uppercase tracking-wider">
            Change ▸
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={clsx("clay p-5 space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-outfit font-bold text-sm text-plum flex items-center gap-2">
          <Settings className="w-3.5 h-3.5 text-plum/40" />
          AI Configuration
        </h4>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="text-[10px] font-bold text-plum/50 hover:text-soft-purple uppercase tracking-wider"
          >
            Collapse ▾
          </button>
        )}
      </div>

      {/* Provider buttons */}
      <div className="grid grid-cols-3 gap-2">
        {(["gemini", "openai", "groq"] as AIProvider[]).map((p) => (
          <button
            key={p}
            onClick={() => onProviderChange(p)}
            className={clsx(
              "clay-btn py-2.5 text-[10px] font-bold uppercase tracking-wider text-center transition-all",
              provider === p
                ? "bg-soft-purple-light/30 ring-1 ring-soft-purple text-soft-purple"
                : "text-plum/50",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
            Model
          </label>
          <button
            onClick={fetchModels}
            disabled={isFetching || !apiKey}
            className="text-[9px] text-soft-purple hover:text-plum disabled:opacity-30 transition-colors uppercase tracking-widest flex items-center gap-1"
          >
            {isFetching ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            Fetch Latest
          </button>
        </div>
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="clay-input w-full text-xs font-bold font-outfit"
        >
          {availableModels.map((m) => (
            <option key={m} value={m}>
              {m.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
          API Key
        </label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => saveKey(e.target.value)}
            placeholder={`Enter ${provider.toUpperCase()} key`}
            className="clay-input w-full text-xs font-mono pr-10"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-plum/30 hover:text-plum/60 transition-colors"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
