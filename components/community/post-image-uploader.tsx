"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Images,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  LISTING_IMAGE_TYPES,
  MAX_LISTING_IMAGES,
  validateListingImageFile,
} from "@/lib/listing-images";
import { cn } from "@/lib/utils";
import type { ListingImage } from "@/types/community";

export type ListingImageDraft = {
  id: string;
  path?: string;
  previewUrl: string;
  file?: File;
};

export function initialListingImageDrafts(images: ListingImage[]) {
  return images.map((image) => ({
    id: image.path,
    path: image.path,
    previewUrl: image.url,
  }));
}

export function PostImageUploader({
  images,
  onChange,
  disabled,
}: {
  images: ListingImageDraft[];
  onChange: (images: ListingImageDraft[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;

    const availableSlots = MAX_LISTING_IMAGES - images.length;
    if (files.length > availableSlots) {
      setError(
        availableSlots > 0
          ? `You can add ${availableSlots} more ${availableSlots === 1 ? "image" : "images"}.`
          : "You can upload up to 6 images.",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const nextFiles = Array.from(files);
    const invalidMessage = nextFiles
      .map(validateListingImageFile)
      .find((message): message is string => Boolean(message));
    if (invalidMessage) {
      setError(invalidMessage);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setError("");
    onChange([
      ...images,
      ...nextFiles.map((file) => ({
        id: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
        file,
      })),
    ]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    const image = images[index];
    if (image.file) URL.revokeObjectURL(image.previewUrl);
    onChange(images.filter((_, itemIndex) => itemIndex !== index));
    setError("");
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const reordered = [...images];
    const [image] = reordered.splice(from, 1);
    reordered.splice(to, 0, image);
    onChange(reordered);
  };

  return (
    <section className="rounded-2xl border border-border/80 bg-muted/25 p-4 sm:col-span-2 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Images aria-hidden="true" className="size-4 text-primary" />
            Listing photos <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Add up to 6 JPG, PNG, or WebP images. Maximum 5 MB each. The first image becomes the cover.
          </p>
        </div>
        <div className="shrink-0 text-xs font-semibold text-muted-foreground">
          {images.length}/{MAX_LISTING_IMAGES}
        </div>
      </div>

      {images.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="group overflow-hidden rounded-xl border border-border bg-background shadow-xs"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                <Image
                  src={image.previewUrl}
                  alt={`Listing preview ${index + 1}`}
                  fill
                  unoptimized={Boolean(image.file)}
                  sizes="(max-width: 640px) 50vw, 220px"
                  className="object-cover"
                />
                {index === 0 ? (
                  <span className="absolute left-2 top-2 rounded-full bg-foreground/85 px-2 py-1 text-[0.625rem] font-bold text-background backdrop-blur-sm">
                    Cover
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move image ${index + 1} earlier`}
                    disabled={disabled || index === 0}
                    onClick={() => moveImage(index, index - 1)}
                  >
                    <ArrowLeft aria-hidden="true" className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move image ${index + 1} later`}
                    disabled={disabled || index === images.length - 1}
                    onClick={() => moveImage(index, index + 1)}
                  >
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove image ${index + 1}`}
                  disabled={disabled}
                  onClick={() => removeImage(index)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-4 text-center">
          <ImagePlus aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">Show people the space</p>
          <p className="mt-1 text-xs text-muted-foreground">You can choose several images at once.</p>
        </div>
      )}

      <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label
          className={cn(
            "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-semibold shadow-xs transition-colors hover:bg-muted",
            (disabled || images.length >= MAX_LISTING_IMAGES) &&
              "pointer-events-none opacity-50",
          )}
        >
          <ImagePlus aria-hidden="true" className="size-4" />
          Add photos
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={LISTING_IMAGE_TYPES.join(",")}
            disabled={disabled || images.length >= MAX_LISTING_IMAGES}
            onChange={(event) => addFiles(event.target.files)}
            className="sr-only"
          />
        </label>
        {error ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
