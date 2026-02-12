import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export function AnalyticsMetrics() {
  const metrics = [
    {
      title: 'Room Utilization Rate (%)',
      value: '23.9',
      trend: 'up',
      subtitle: 'vs last week',
    },
    {
      title: 'Avg. Occupancy per Room',
      value: '4 people',
      trend: 'down',
      subtitle: 'vs last week',
    },
    {
      title: 'Floor Capacity (%)',
      value: '80',
      trend: 'up',
      subtitle: 'vs last week',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {metrics.map((metric) => (
        <div key={metric.title} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-gray-700 text-sm mb-3">{metric.title}</h3>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-4xl font-semibold text-gray-900">{metric.value}</span>
            {metric.trend === 'up' ? (
              <TrendingUp className="w-6 h-6 text-green-500" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-500" />
            )}
          </div>
          <p className="text-sm text-gray-500 italic">{metric.subtitle}</p>
        </div>
      ))}
    </div>
  );
}
