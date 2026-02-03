'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface RoadmapMilestone {
  id: string;
  title: string;
  targetDate: string;
  status: 'planned' | 'in_progress' | 'completed';
  description: string;
}

const MILESTONE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
] as const;

interface RoadmapEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenAddress: string;
  initialRoadmap: RoadmapMilestone[];
  onRoadmapUpdated: (roadmap: RoadmapMilestone[]) => void;
}

export function RoadmapEditModal({
  open,
  onOpenChange,
  tokenAddress,
  initialRoadmap,
  onRoadmapUpdated,
}: RoadmapEditModalProps) {
  const [roadmap, setRoadmap] = useState<RoadmapMilestone[]>(initialRoadmap || []);
  const [isSaving, setIsSaving] = useState(false);

  // Reset roadmap when modal opens
  useEffect(() => {
    if (open) {
      setRoadmap(initialRoadmap || []);
    }
  }, [open, initialRoadmap]);

  const addMilestone = () => {
    const newMilestone: RoadmapMilestone = {
      id: crypto.randomUUID(),
      title: '',
      targetDate: '',
      status: 'planned',
      description: '',
    };
    setRoadmap([...roadmap, newMilestone]);
  };

  const updateMilestone = (id: string, field: keyof RoadmapMilestone, value: string) => {
    setRoadmap(roadmap.map(m =>
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  const removeMilestone = (id: string) => {
    setRoadmap(roadmap.filter(m => m.id !== id));
  };

  const handleSave = async () => {
    // Validate milestones
    const invalidMilestones = roadmap.filter(m => !m.title.trim() || !m.targetDate.trim());
    if (invalidMilestones.length > 0) {
      toast.error('Please fill in title and target date for all milestones');
      return;
    }

    setIsSaving(true);
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Please sign in to update the roadmap');
      }

      const response = await fetch('/api/token/roadmap', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tokenAddress,
          roadmap,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update roadmap');
      }

      toast.success('Roadmap updated successfully');
      onRoadmapUpdated(roadmap);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to update roadmap:', error);
      toast.error(error.message || 'Failed to update roadmap');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 bg-[#111114] border-border/50">
        <div className="p-4">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-base font-semibold">
              Edit Roadmap
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {roadmap.map((milestone, index) => (
              <div key={milestone.id} className="p-3 rounded-lg border border-border/50 bg-background space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Milestone {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeMilestone(milestone.id)}
                    className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Title <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="e.g., Token Launch"
                      value={milestone.title}
                      onChange={(e) => updateMilestone(milestone.id, 'title', e.target.value)}
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Target Date <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="e.g., Q1 2025, March 2025"
                      value={milestone.targetDate}
                      onChange={(e) => updateMilestone(milestone.id, 'targetDate', e.target.value)}
                      maxLength={50}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={milestone.status}
                    onValueChange={(value) => updateMilestone(milestone.id, 'status', value)}
                  >
                    <SelectTrigger className="w-full cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border/50">
                      {MILESTONE_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value} className="cursor-pointer focus:bg-muted">
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    placeholder="What will be achieved?"
                    value={milestone.description}
                    onChange={(e) => updateMilestone(milestone.id, 'description', e.target.value)}
                    maxLength={500}
                    rows={2}
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={addMilestone}
              className="w-full h-12 !border !border-primary !bg-transparent"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Milestone
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="flex-1 bg-primary hover:bg-primary/80"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
