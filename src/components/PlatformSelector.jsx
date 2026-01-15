import React from "react";

export default function PlatformSelector({ selectedModel, setSelectedModel, platformConfig }) {
    return (
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-purple-500/30 shadow-2xl">
            <h3 className="text-xl font-semibold mb-4 text-white">
                Select Platform
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(platformConfig).map(([key, config]) => (
                    <button
                        key={key}
                        onClick={() => setSelectedModel(key)}
                        disabled={!config.enabled}
                        className={`
              relative overflow-hidden rounded-xl p-6 transition-all duration-300
              ${selectedModel === key
                                ? `bg-gradient-to-br ${config.color} shadow-lg scale-105`
                                : "bg-white/5 hover:bg-white/10"
                            }
              ${!config.enabled ? "opacity-50 cursor-not-allowed" : ""}
              border-2 ${selectedModel === key
                                ? "border-white/30"
                                : "border-white/10"
                            }
            `}
                    >
                        <div className="flex flex-col items-center gap-3">
                            <img
                                src={config.iconPath}
                                alt={config.name}
                                className="w-16 h-16 object-contain"
                            />
                            <span className="text-white font-medium text-center">
                                {config.name}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
