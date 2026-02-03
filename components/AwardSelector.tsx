'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Award, Star, Heart, Trophy } from 'lucide-react';

interface AwardSelectorProps {
  onSelect?: (award: string) => void;
}

export function AwardSelector({ onSelect }: AwardSelectorProps) {
  const awards = [
    { id: 'star', icon: Star, name: 'Star', cost: 10 },
    { id: 'heart', icon: Heart, name: 'Heart', cost: 25 },
    { id: 'trophy', icon: Trophy, name: 'Trophy', cost: 50 },
    { id: 'award', icon: Award, name: 'Award', cost: 100 },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {awards.map((award) => (
        <Button
          key={award.id}
          variant="outline"
          size="sm"
          onClick={() => onSelect?.(award.id)}
          className="gap-2"
        >
          <award.icon className="w-4 h-4" />
          <span>{award.name}</span>
          <span className="text-xs text-muted-foreground">({award.cost} pts)</span>
        </Button>
      ))}
    </div>
  );
}
