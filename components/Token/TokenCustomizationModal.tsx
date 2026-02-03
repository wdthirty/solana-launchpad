'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { Edit, X, Save, Upload, Trash2, ZoomIn, RotateCcw, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PanelCustomization {
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  textBackgroundColor?: string;
}

// Pending file for upload on save
export interface PendingImageFile {
  file: File;
  previewUrl: string;
  target: 'canvas' | string;
}

// Type for crop generator function
export type CropGeneratorFn = () => Promise<Blob | null>;

// Convert position data to CSS background-position and background-size
export function positionDataToCSS(pos: string): { position: string; size: string } {
  try {
    const data = JSON.parse(pos);

    // If we have cropArea data from react-easy-crop, use it for accurate positioning
    if (data.cropArea) {
      const { x, y, width, height } = data.cropArea;

      // The background-size should be scaled so that the crop area fills the container
      const scaleX = 100 / width;
      const scaleY = 100 / height;
      const scale = Math.max(scaleX, scaleY);

      // Calculate position to show the crop area
      const posX = width < 100 ? (x / (100 - width)) * 100 : 50;
      const posY = height < 100 ? (y / (100 - height)) * 100 : 50;

      return {
        position: `${Math.max(0, Math.min(100, posX))}% ${Math.max(0, Math.min(100, posY))}%`,
        size: `${scale * 100}%`
      };
    }

    // Fallback for old format without cropArea
    const zoom = data.zoom || 1;
    const cropX = data.x || 0;
    const cropY = data.y || 0;

    const size = `${zoom * 100}%`;
    const posX = 50 - (cropX * zoom / 200);
    const posY = 50 - (cropY * zoom / 200);

    return {
      position: `${Math.max(0, Math.min(100, posX))}% ${Math.max(0, Math.min(100, posY))}%`,
      size
    };
  } catch {
    return { position: 'center center', size: 'cover' };
  }
}

interface TokenCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPanel: string | null;
  selectedPanelData: {
    id: string;
    type: string;
    position?: { width: number; height: number; row?: number; col?: number };
    customization?: PanelCustomization;
  } | null;
  selectedBackground: boolean;
  canvasBackgroundColor: string;
  canvasBackgroundImage: string;
  canvasBackgroundSize: 'cover' | 'contain' | 'repeat';
  canvasBackgroundPosition: string;
  onCanvasBackgroundColorChange: (color: string) => void;
  onCanvasBackgroundImageChange: (url: string) => void;
  onCanvasBackgroundSizeChange: (size: 'cover' | 'contain' | 'repeat') => void;
  onCanvasBackgroundPositionChange: (position: string) => void;
  onPanelUpdate: (panelId: string, customization: PanelCustomization) => void;
  onSave: () => void;
  isSaving: boolean;
  pendingFiles: PendingImageFile[];
  onPendingFilesChange: (files: PendingImageFile[]) => void;
  cropGenerators?: Map<string, CropGeneratorFn>;
  onCropGeneratorChange?: (target: string, generator: CropGeneratorFn | null) => void;
}

// Background position data stored as JSON string
interface PositionData {
  x: number;
  y: number;
  zoom: number;
  cropArea?: { x: number; y: number; width: number; height: number };
}

// Get realistic aspect ratio for panel types
function getPanelAspectRatio(panelType: string, gridWidth: number = 12): number {
  const containerWidth = 1200;
  const gap = 16;
  const colWidth = (containerWidth - (11 * gap)) / 12;
  const panelWidth = (gridWidth * colWidth) + ((gridWidth - 1) * gap);

  switch (panelType) {
    case 'TokenNamePanel':
      return panelWidth / 140;
    case 'StatsPanel':
      return panelWidth / 120;
    case 'MetaPanel':
      return panelWidth / 200;
    case 'BuySellPanel':
      return panelWidth / 400;
    case 'ChartPanel':
      return panelWidth / 400;
    case 'TopHoldersPanel':
      return panelWidth / 250;
    case 'CommentsPanel':
      return panelWidth / 350;
    case 'BondingCurvePanel':
      return panelWidth / 300;
    case 'CommunityPanel':
      return panelWidth / 200;
    case 'ThreadsPanel':
      return panelWidth / 300;
    default:
      return 16 / 9;
  }
}

// Parse position string to PositionData
function parsePositionData(pos: string): PositionData {
  try {
    const data = JSON.parse(pos);
    return {
      x: data.x ?? 0,
      y: data.y ?? 0,
      zoom: data.zoom ?? 1,
      cropArea: data.cropArea,
    };
  } catch {
    return { x: 0, y: 0, zoom: 1 };
  }
}

// Helper function to create an image element from URL
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.crossOrigin = 'anonymous';
    image.src = url;
  });
}

const MAX_CROPPED_DIMENSION = 1920;

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  let outputWidth = pixelCrop.width;
  let outputHeight = pixelCrop.height;

  if (outputWidth > MAX_CROPPED_DIMENSION || outputHeight > MAX_CROPPED_DIMENSION) {
    const scale = MAX_CROPPED_DIMENSION / Math.max(outputWidth, outputHeight);
    outputWidth = Math.round(outputWidth * scale);
    outputHeight = Math.round(outputHeight * scale);
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas is empty'));
        }
      },
      'image/jpeg',
      0.85
    );
  });
}

// Position picker using react-easy-crop
function PositionPicker({
  value,
  onChange,
  backgroundImage,
  pendingPreviewUrl,
  aspect = 16 / 9,
  onCropReady,
}: {
  value: string;
  onChange: (position: string) => void;
  backgroundImage?: string;
  pendingPreviewUrl?: string;
  aspect?: number;
  onCropReady?: (getCroppedImage: CropGeneratorFn | null) => void;
}) {
  const displayImage = pendingPreviewUrl || backgroundImage;
  const positionData = parsePositionData(value);
  const [crop, setCrop] = useState<Point>({ x: positionData.x, y: positionData.y });
  const [zoom, setZoom] = useState(positionData.zoom);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const onChangeRef = useRef(onChange);
  const displayImageRef = useRef(displayImage);
  const croppedAreaPixelsRef = useRef<Area | null>(null);
  const hasUserChangedRef = useRef(false);
  const onCropReadyRef = useRef(onCropReady);

  onChangeRef.current = onChange;
  displayImageRef.current = displayImage;
  onCropReadyRef.current = onCropReady;

  useEffect(() => {
    return () => {
      if (onCropReadyRef.current) {
        onCropReadyRef.current(null);
      }
    };
  }, []);

  const prevDisplayImageRef = useRef(displayImage);
  useEffect(() => {
    if (prevDisplayImageRef.current !== displayImage) {
      prevDisplayImageRef.current = displayImage;
      hasUserChangedRef.current = false;
      if (onCropReadyRef.current) {
        onCropReadyRef.current(null);
      }
    }
  }, [displayImage]);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (prevDisplayImageRef.current !== displayImage && initializedRef.current) {
      prevDisplayImageRef.current = displayImage;
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      croppedAreaPixelsRef.current = null;
      return;
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevDisplayImageRef.current = displayImage;
      setCrop({ x: positionData.x, y: positionData.y });
      setZoom(positionData.zoom);
    }
  }, [positionData, displayImage]);

  const onCropChange = useCallback((newCrop: Point) => {
    setCrop(newCrop);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropComplete = useCallback((croppedAreaPercent: Area, croppedAreaPx: Area) => {
    setCroppedAreaPixels(croppedAreaPx);
    croppedAreaPixelsRef.current = croppedAreaPx;

    if (!hasUserChangedRef.current) {
      hasUserChangedRef.current = true;
      if (onCropReadyRef.current && displayImageRef.current) {
        onCropReadyRef.current(async () => {
          if (!croppedAreaPixelsRef.current || !displayImageRef.current) {
            return null;
          }
          try {
            return await getCroppedImg(displayImageRef.current, croppedAreaPixelsRef.current);
          } catch (error) {
            console.error('Failed to crop image:', error);
            return null;
          }
        });
      }
    }

    onChangeRef.current(JSON.stringify({
      x: crop.x,
      y: crop.y,
      zoom,
      cropArea: croppedAreaPercent,
      cropPixels: croppedAreaPx,
    }));
  }, [crop.x, crop.y, zoom]);

  if (!displayImage) return null;

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-1.5">
        <ZoomIn className="size-3.5" />
        Adjust Position & Zoom
      </Label>
      <div
        className="relative rounded-lg overflow-hidden border border-border/50 bg-muted"
        style={{
          height: aspect > 2 ? '100px' : aspect > 1 ? '140px' : '180px'
        }}
      >
        <Cropper
          image={displayImage}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropComplete}
          showGrid={false}
          objectFit="contain"
          style={{
            containerStyle: {
              borderRadius: '0.5rem',
            },
          }}
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Zoom</span>
        <Slider
          min={1}
          max={3}
          step={0.1}
          value={[zoom]}
          onValueChange={([val]) => setZoom(val)}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-8">{zoom.toFixed(1)}x</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Drag to reposition • The visible area will be saved
      </p>
    </div>
  );
}

// Image picker component
function ImagePicker({
  currentImage,
  onImageChange,
  label = 'Background Image',
  target,
  pendingFiles,
  onPendingFilesChange,
  onBackgroundColorReset,
}: {
  currentImage: string;
  onImageChange: (url: string) => void;
  label?: string;
  target: 'canvas' | string;
  pendingFiles: PendingImageFile[];
  onPendingFilesChange: (files: PendingImageFile[]) => void;
  onBackgroundColorReset?: (color: string) => void;
}) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = `modal-bg-upload-${target}`;

  const pendingFile = pendingFiles.find(f => f.target === target);
  const displayImage = pendingFile?.previewUrl || currentImage;

  const processFile = (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Use JPG, PNG, GIF, or WebP.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const updatedFiles = pendingFiles.filter(f => f.target !== target);
    onPendingFilesChange([...updatedFiles, { file, previewUrl, target }]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemoveImage = () => {
    if (pendingFile) {
      URL.revokeObjectURL(pendingFile.previewUrl);
      onPendingFilesChange(pendingFiles.filter(f => f.target !== target));
    }
    onImageChange('');
    // Reset background color to default when removing image
    if (onBackgroundColorReset) {
      onBackgroundColorReset('#0c0c0e');
    }
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center justify-between">
        <span>{label}</span>
        {pendingFile && (
          <span className="text-[10px] px-1.5 py-0.5 bg-primary text-primary-foreground rounded">
            Not saved yet
          </span>
        )}
      </Label>

      {displayImage && (
        <div
          className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
            isDragging ? 'bg-primary/10 ring-2 ring-primary ring-dashed' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            id={inputId}
          />
          <label
            htmlFor={inputId}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs border border-border/50 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <Upload className="size-3.5" />
            {isDragging ? 'Drop to replace' : 'Change image'}
          </label>
          <button
            type="button"
            onClick={handleRemoveImage}
            className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            title="Remove image"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}

      {!displayImage && (
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
            isDragging ? 'border-primary bg-primary/10' : 'border-border/50 hover:border-primary'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            onChange={handleFileSelect}
            className="hidden"
            id={inputId}
          />
          <label htmlFor={inputId} className="cursor-pointer flex flex-col items-center gap-2">
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {isDragging ? 'Drop image here' : 'Drag & drop or click to select (max 10MB)'}
            </span>
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowUrlInput(!showUrlInput)}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        {showUrlInput ? 'Hide URL input' : 'Or paste image URL'}
      </button>

      {showUrlInput && (
        <Input
          type="text"
          value={currentImage.startsWith('blob:') ? '' : currentImage}
          onChange={(e) => {
            if (pendingFile) {
              URL.revokeObjectURL(pendingFile.previewUrl);
              onPendingFilesChange(pendingFiles.filter(f => f.target !== target));
            }
            onImageChange(e.target.value);
          }}
          placeholder="https://example.com/image.gif"
          className="text-xs"
        />
      )}
    </div>
  );
}

export function TokenCustomizationModal({
  isOpen,
  onClose,
  selectedPanel,
  selectedPanelData,
  selectedBackground,
  canvasBackgroundColor,
  canvasBackgroundImage,
  canvasBackgroundSize,
  canvasBackgroundPosition,
  onCanvasBackgroundColorChange,
  onCanvasBackgroundImageChange,
  onCanvasBackgroundSizeChange,
  onCanvasBackgroundPositionChange,
  onPanelUpdate,
  onSave,
  isSaving,
  pendingFiles,
  onPendingFilesChange,
  cropGenerators,
  onCropGeneratorChange,
}: TokenCustomizationModalProps) {
  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      pendingFiles.forEach(f => {
        if (f.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(f.previewUrl);
        }
      });
    };
  }, []);

  const handleSave = () => {
    onSave();
    onClose();
  };

  const title = selectedBackground
    ? 'Customize Background'
    : selectedPanelData
    ? `Customize ${selectedPanelData.type.replace('Panel', '')} Panel`
    : 'Customize';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto border-border/50 bg-[#111114]">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Edit className="size-4" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Background Properties */}
          {selectedBackground && (
            <div className="space-y-5">
              {/* Reset to defaults button */}
              <button
                type="button"
                onClick={() => {
                  // Clear any pending canvas files
                  const canvasPendingFile = pendingFiles.find(f => f.target === 'canvas');
                  if (canvasPendingFile) {
                    URL.revokeObjectURL(canvasPendingFile.previewUrl);
                    onPendingFilesChange(pendingFiles.filter(f => f.target !== 'canvas'));
                  }
                  // Reset canvas background to defaults
                  onCanvasBackgroundColorChange('#0c0c0e');
                  onCanvasBackgroundImageChange('');
                  onCanvasBackgroundSizeChange('cover');
                  onCanvasBackgroundPositionChange('center center');
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs border border-border/50 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <RotateCcw className="size-3.5" />
                Reset to Defaults
              </button>

              <div className="space-y-2">
                <Label>Background Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={canvasBackgroundColor || '#0c0c0e'}
                    onChange={(e) => onCanvasBackgroundColorChange(e.target.value)}
                    className="h-10 w-14 cursor-pointer p-1"
                  />
                  <Input
                    type="text"
                    value={canvasBackgroundColor || '#0c0c0e'}
                    onChange={(e) => onCanvasBackgroundColorChange(e.target.value)}
                    className="flex-1 font-mono text-xs"
                    placeholder="#0c0c0e"
                  />
                </div>
              </div>

              <ImagePicker
                currentImage={canvasBackgroundImage}
                onImageChange={onCanvasBackgroundImageChange}
                label="Background Image"
                target="canvas"
                pendingFiles={pendingFiles}
                onPendingFilesChange={onPendingFilesChange}
                onBackgroundColorReset={onCanvasBackgroundColorChange}
              />

              {(canvasBackgroundImage || pendingFiles.some(f => f.target === 'canvas')) && (
                <>
                  <div className="space-y-2">
                    <Label>Background Size</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="w-full flex items-center justify-between px-3 py-2 border border-border/50 bg-background hover:bg-muted/50 rounded-md text-sm transition-colors">
                          <span>
                            {canvasBackgroundSize === 'cover' && 'Cover (fill entire area)'}
                            {canvasBackgroundSize === 'contain' && 'Contain (fit inside)'}
                            {canvasBackgroundSize === 'repeat' && 'Repeat (tile pattern/gif)'}
                          </span>
                          <ChevronDown className="size-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] bg-[#111114] border-border/50" align="start">
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-muted"
                          onClick={() => onCanvasBackgroundSizeChange('cover')}
                        >
                          <span>Cover (fill entire area)</span>
                          {canvasBackgroundSize === 'cover' && <Check className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-muted"
                          onClick={() => onCanvasBackgroundSizeChange('contain')}
                        >
                          <span>Contain (fit inside)</span>
                          {canvasBackgroundSize === 'contain' && <Check className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-muted"
                          onClick={() => onCanvasBackgroundSizeChange('repeat')}
                        >
                          <span>Repeat (tile pattern/gif)</span>
                          {canvasBackgroundSize === 'repeat' && <Check className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {canvasBackgroundSize === 'cover' && (() => {
                    const pendingFile = pendingFiles.find(f => f.target === 'canvas');
                    const isGif = pendingFile?.file?.type === 'image/gif' || canvasBackgroundImage?.toLowerCase().endsWith('.gif');
                    if (isGif) return null;
                    return (
                      <PositionPicker
                        value={canvasBackgroundPosition}
                        onChange={onCanvasBackgroundPositionChange}
                        backgroundImage={canvasBackgroundImage}
                        pendingPreviewUrl={pendingFile?.previewUrl}
                        aspect={16 / 9}
                        onCropReady={(generator) => {
                          if (onCropGeneratorChange) {
                            onCropGeneratorChange('canvas', generator);
                          }
                        }}
                      />
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Panel Properties */}
          {selectedPanelData && !selectedBackground && (
            <div className="space-y-5">
              {/* Reset to defaults button */}
              <button
                type="button"
                onClick={() => {
                  // Clear any pending files for this panel
                  const panelPendingFile = pendingFiles.find(f => f.target === selectedPanelData.id);
                  if (panelPendingFile) {
                    URL.revokeObjectURL(panelPendingFile.previewUrl);
                    onPendingFilesChange(pendingFiles.filter(f => f.target !== selectedPanelData.id));
                  }
                  // Reset all customizations to defaults
                  onPanelUpdate(selectedPanelData.id, {
                    backgroundColor: '#111114',
                    textColor: '#ffffff',
                    backgroundImage: '',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center center',
                    overlayColor: '#000000',
                    overlayOpacity: 0,
                    textBackgroundColor: '#000000',
                  });
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs border border-border/50 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <RotateCcw className="size-3.5" />
                Reset to Defaults
              </button>

              <div className="space-y-2">
                <Label>Text Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={selectedPanelData.customization?.textColor || '#ffffff'}
                    onChange={(e) => onPanelUpdate(selectedPanelData.id, {
                      ...selectedPanelData.customization,
                      textColor: e.target.value,
                    })}
                    className="h-10 w-14 cursor-pointer p-1"
                  />
                  <Input
                    type="text"
                    value={selectedPanelData.customization?.textColor || '#ffffff'}
                    onChange={(e) => onPanelUpdate(selectedPanelData.id, {
                      ...selectedPanelData.customization,
                      textColor: e.target.value,
                    })}
                    className="flex-1 font-mono text-xs"
                    placeholder="#ffffff"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Background Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={selectedPanelData.customization?.backgroundColor || '#111114'}
                    onChange={(e) => onPanelUpdate(selectedPanelData.id, {
                      ...selectedPanelData.customization,
                      backgroundColor: e.target.value,
                    })}
                    className="h-10 w-14 cursor-pointer p-1"
                  />
                  <Input
                    type="text"
                    value={selectedPanelData.customization?.backgroundColor || '#111114'}
                    onChange={(e) => onPanelUpdate(selectedPanelData.id, {
                      ...selectedPanelData.customization,
                      backgroundColor: e.target.value,
                    })}
                    className="flex-1 font-mono text-xs"
                    placeholder="#111114"
                  />
                </div>
              </div>

              <ImagePicker
                currentImage={selectedPanelData.customization?.backgroundImage || ''}
                onImageChange={(url) => onPanelUpdate(selectedPanelData.id, {
                  ...selectedPanelData.customization,
                  backgroundImage: url,
                })}
                label="Background Image"
                target={selectedPanelData.id}
                pendingFiles={pendingFiles}
                onPendingFilesChange={onPendingFilesChange}
onBackgroundColorReset={() => onPanelUpdate(selectedPanelData.id, {
                  ...selectedPanelData.customization,
                  backgroundImage: '',
                  backgroundColor: '#111114',
                })}
              />

              {(selectedPanelData.customization?.backgroundImage || pendingFiles.some(f => f.target === selectedPanelData.id)) && (
                <>
                  <div className="space-y-2">
                    <Label>Background Size</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="w-full flex items-center justify-between px-3 py-2 border border-border/50 bg-background hover:bg-muted/50 rounded-md text-sm transition-colors">
                          <span>
                            {(selectedPanelData.customization?.backgroundSize || 'cover') === 'cover' && 'Cover (fill entire area)'}
                            {selectedPanelData.customization?.backgroundSize === 'contain' && 'Contain (fit inside)'}
                            {selectedPanelData.customization?.backgroundSize === 'repeat' && 'Repeat (tile pattern/gif)'}
                          </span>
                          <ChevronDown className="size-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] bg-[#111114] border-border/50" align="start">
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-muted"
                          onClick={() => onPanelUpdate(selectedPanelData.id, {
                            ...selectedPanelData.customization,
                            backgroundSize: 'cover',
                          })}
                        >
                          <span>Cover (fill entire area)</span>
                          {(selectedPanelData.customization?.backgroundSize || 'cover') === 'cover' && <Check className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-muted"
                          onClick={() => onPanelUpdate(selectedPanelData.id, {
                            ...selectedPanelData.customization,
                            backgroundSize: 'contain',
                          })}
                        >
                          <span>Contain (fit inside)</span>
                          {selectedPanelData.customization?.backgroundSize === 'contain' && <Check className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer focus:bg-muted"
                          onClick={() => onPanelUpdate(selectedPanelData.id, {
                            ...selectedPanelData.customization,
                            backgroundSize: 'repeat',
                          })}
                        >
                          <span>Repeat (tile pattern/gif)</span>
                          {selectedPanelData.customization?.backgroundSize === 'repeat' && <Check className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {(selectedPanelData.customization?.backgroundSize || 'cover') === 'cover' && (() => {
                    const pendingFile = pendingFiles.find(f => f.target === selectedPanelData.id);
                    const isGif = pendingFile?.file?.type === 'image/gif' || selectedPanelData.customization?.backgroundImage?.toLowerCase().endsWith('.gif');
                    if (isGif) return null;
                    return (
                      <PositionPicker
                        value={selectedPanelData.customization?.backgroundPosition || 'center center'}
                        onChange={(pos) => onPanelUpdate(selectedPanelData.id, {
                          ...selectedPanelData.customization,
                          backgroundPosition: pos,
                        })}
                        backgroundImage={selectedPanelData.customization?.backgroundImage}
                        pendingPreviewUrl={pendingFile?.previewUrl}
                        aspect={getPanelAspectRatio(selectedPanelData.type, selectedPanelData.position?.width || 12)}
                        onCropReady={(generator) => {
                          if (onCropGeneratorChange) {
                            onCropGeneratorChange(selectedPanelData.id, generator);
                          }
                        }}
                      />
                    );
                  })()}

                  <div className="space-y-2">
                    <Label>Overlay Color</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={selectedPanelData.customization?.overlayColor || '#000000'}
                        onChange={(e) => onPanelUpdate(selectedPanelData.id, {
                          ...selectedPanelData.customization,
                          overlayColor: e.target.value,
                        })}
                        className="h-10 w-14 cursor-pointer p-1"
                      />
                      <Input
                        type="text"
                        value={selectedPanelData.customization?.overlayColor || '#000000'}
                        onChange={(e) => onPanelUpdate(selectedPanelData.id, {
                          ...selectedPanelData.customization,
                          overlayColor: e.target.value,
                        })}
                        className="flex-1 font-mono text-xs"
                        placeholder="#000000"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Overlay Opacity: {Math.round((selectedPanelData.customization?.overlayOpacity || 0) * 100)}%
                    </Label>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[selectedPanelData.customization?.overlayOpacity || 0]}
                      onValueChange={([val]) => onPanelUpdate(selectedPanelData.id, {
                        ...selectedPanelData.customization,
                        overlayOpacity: val,
                        overlayColor: selectedPanelData.customization?.overlayColor || '#000000',
                      })}
                      className="py-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      Darken/lighten the background image
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Text Background Color</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={selectedPanelData.customization?.textBackgroundColor || '#000000'}
                        onChange={(e) => onPanelUpdate(selectedPanelData.id, {
                          ...selectedPanelData.customization,
                          textBackgroundColor: e.target.value,
                        })}
                        className="h-10 w-14 cursor-pointer p-1"
                      />
                      <Input
                        type="text"
                        value={selectedPanelData.customization?.textBackgroundColor || '#000000'}
                        onChange={(e) => onPanelUpdate(selectedPanelData.id, {
                          ...selectedPanelData.customization,
                          textBackgroundColor: e.target.value,
                        })}
                        className="flex-1 font-mono text-xs"
                        placeholder="#000000"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Background color for text labels
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {!selectedPanelData && !selectedBackground && (
            <div className="text-center text-muted-foreground py-8">
              <Edit className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Click on a panel or the background to customize it</p>
            </div>
          )}
        </div>

        {/* Footer with Save button */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-1.5">
            <Save className="size-3.5" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
