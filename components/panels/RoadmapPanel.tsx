'use client';

import React from 'react';
import { parseBackgroundPosition, cn } from '@/lib/utils';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Clock, Edit2 } from 'lucide-react';

interface RoadmapMilestone {
  id: string;
  title: string;
  targetDate: string;
  status: 'planned' | 'in_progress' | 'completed';
  description: string;
}

interface RoadmapPanelProps {
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundBlurhash?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  textBackgroundColor?: string;
  token?: {
    roadmap?: RoadmapMilestone[];
    token_type?: string;
  };
  // Creator edit functionality
  showEditButton?: boolean;
  onEditRoadmap?: () => void;
  // Always show even when empty (e.g., for creator to add milestones)
  alwaysShow?: boolean;
  // Whether the current user is the creator (used to show empty state for editing)
  isCreator?: boolean;
}

export function RoadmapPanel({
  backgroundColor,
  textColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  backgroundBlurhash,
  overlayColor,
  overlayOpacity,
  textBackgroundColor,
  token,
  showEditButton,
  onEditRoadmap,
  alwaysShow,
  isCreator,
}: RoadmapPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground
    ? {
        backgroundColor: `${textBackgroundColor || '#0c0c0e'}cc`,
      }
    : undefined;

  const roadmap = token?.roadmap;
  const hasRoadmap = roadmap && roadmap.length > 0;

  // Don't render if no roadmap data, unless alwaysShow is true or user is creator (so they can add milestones)
  if (!hasRoadmap && !alwaysShow && !isCreator) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Circle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Planned';
    }
  };

  // Status text colors - matching MetaPanel pattern
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#4ade80'; // Green
      case 'in_progress':
        return '#facc15'; // Yellow
      default:
        return '#9ca3af'; // Gray for planned
    }
  };

  const formatDate = (dateString: string) => {
    // Just return the string as-is since dates are stored as text (e.g., "Q1 2025", "March 2025")
    return dateString || '';
  };

  return (
    <div className="overflow-hidden relative rounded-2xl p-3 sm:p-5">
      <OptimizedBackground
        src={backgroundImage}
        blurhash={backgroundBlurhash}
        backgroundColor={backgroundImage ? 'transparent' : (backgroundColor || '#0a0a0c')}
        backgroundSize={backgroundSize || 'cover'}
        backgroundPosition={backgroundSize === 'repeat' ? 'top left' : bgPos.position}
        overlayColor={overlayColor}
        overlayOpacity={overlayOpacity}
        lazy={true}
      />

      <div style={{ position: 'relative', zIndex: 2 }}>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3
            className={`text-sm sm:text-base font-bold ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-0.5 rounded w-fit' : ''}`}
            style={{ ...textBgStyle, color: textColor || '#ffffff' }}
          >
            Roadmap
          </h3>
          {showEditButton && onEditRoadmap && (
            <Button
              onClick={onEditRoadmap}
              size="sm"
              variant="secondary"
              className={cn(
                'gap-1.5 h-8 px-3 text-sm',
                hasCustomBackground
                  ? 'backdrop-blur-sm hover:opacity-80'
                  : 'bg-muted/80 backdrop-blur-sm hover:bg-muted'
              )}
              style={textBgStyle}
            >
              <Edit2 className="size-3.5" />
              Edit
            </Button>
          )}
        </div>

        {hasRoadmap ? (
          <div className="space-y-3 sm:space-y-4">
            {roadmap!.map((milestone, index) => (
              <div
                key={milestone.id}
                className={`flex gap-3 ${hasCustomBackground ? 'backdrop-blur-sm p-2 sm:p-3 rounded-lg' : ''}`}
                style={textBgStyle}
              >
                {/* Timeline line and icon */}
                <div className="flex flex-col items-center">
                  {getStatusIcon(milestone.status)}
                  {index < roadmap!.length - 1 && (
                    <div className="w-0.5 flex-1 bg-border/50 mt-1" />
                  )}
                </div>

                {/* Milestone content */}
                <div className="flex-1 pb-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4
                      className="font-medium text-sm sm:text-base"
                      style={{ color: textColor || '#ffffff' }}
                    >
                      {milestone.title}
                    </h4>
                    <span
                      className="text-xs shrink-0"
                      style={{ color: getStatusColor(milestone.status) }}
                    >
                      {getStatusLabel(milestone.status)}
                    </span>
                  </div>

                  <p
                    className="text-xs text-muted-foreground mb-1"
                    style={{ color: textColor ? `${textColor}99` : undefined }}
                  >
                    Target: {formatDate(milestone.targetDate)}
                  </p>

                  {milestone.description && (
                    <p
                      className="text-xs sm:text-sm"
                      style={{ color: textColor || '#ffffff' }}
                    >
                      {milestone.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`text-center py-6 ${hasCustomBackground ? 'backdrop-blur-sm p-4 rounded-lg' : ''}`}
            style={textBgStyle}
          >
            <p
              className="text-sm text-muted-foreground mb-3"
              style={{ color: textColor ? `${textColor}99` : undefined }}
            >
              No roadmap milestones yet
            </p>
            {showEditButton && onEditRoadmap && (
              <Button
                onClick={onEditRoadmap}
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                <Edit2 className="size-3.5" />
                Add Milestones
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
