"use client";

interface FunnelStep {
  label: string;
  value: number;
  percentage: number;
}

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const maxValue = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="space-y-3">
      {steps.map((step, idx) => (
        <div key={idx} className="relative">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-gray-700">{step.label}</span>
            <span className="text-gray-500">
              {step.value.toLocaleString("ru-RU")} ({step.percentage.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-6">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-6 rounded-full transition-all duration-500"
              style={{ width: `${(step.value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
