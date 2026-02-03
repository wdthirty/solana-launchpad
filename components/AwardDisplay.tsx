'use client';

import React from 'react';
import { Award, Star, Heart, Trophy } from 'lucide-react';

interface AwardDisplayProps {
  awards?: Array<{ type: string; count: number }>;
}

export function AwardDisplay({ awards = [] }: AwardDisplayProps) {
  const awardIcons: Record<string, any> = {
    star: Star,
    heart: Heart,
    trophy: Trophy,
    award: Award,
  };

  if (awards.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {awards.map((award) => {
        const Icon = awardIcons[award.type] || Award;
        return (
          <div
            key={award.type}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs"
          >
            <Icon className="w-3 h-3" />
            <span>{award.count}</span>
          </div>
        );
      })}
    </div>
  );
}
