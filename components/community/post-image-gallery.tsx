"use client";

import Image from "next/image";
import { useState } from "react";
import { Images } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ListingImage } from "@/types/community";

export function PostImageGallery({
  images,
  title,
  detail = false,
}: {
  images: ListingImage[];
  title: string;
  detail?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (!images.length) return null;

  const selectedImage = images[Math.min(selectedIndex, images.length - 1)];

  if (!detail) {
    return (
      <div className="relative mt-5 aspect-[16/9] overflow-hidden rounded-2xl bg-muted">
        <Image
          src={images[0].url}
          alt={`${title} listing photo`}
          fill
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover transition-transform duration-300 group-hover/card:scale-[1.015]"
        />
        {images.length > 1 ? (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/80 px-3 py-1.5 text-xs font-semibold text-background backdrop-blur-sm">
            <Images aria-hidden="true" className="size-3.5" />
            {images.length} photos
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <section className="mt-5" aria-label="Listing photos">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted sm:aspect-[16/9]">
        <Image
          src={selectedImage.url}
          alt={`${title} listing photo ${selectedIndex + 1}`}
          fill
          sizes="(max-width: 768px) 100vw, 900px"
          className="object-cover"
          preload
        />
        <span className="absolute bottom-3 right-3 rounded-full bg-foreground/80 px-3 py-1.5 text-xs font-semibold text-background backdrop-blur-sm">
          {selectedIndex + 1} / {images.length}
        </span>
      </div>

      {images.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {images.map((image, index) => (
            <button
              key={image.path}
              type="button"
              aria-label={`Show listing photo ${index + 1}`}
              aria-pressed={selectedIndex === index}
              onClick={() => setSelectedIndex(index)}
              className={cn(
                "relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-xl border-2 bg-muted outline-none transition-[border-color,opacity] focus-visible:ring-3 focus-visible:ring-ring/25 sm:w-28",
                selectedIndex === index
                  ? "border-primary"
                  : "border-transparent opacity-75 hover:opacity-100",
              )}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="112px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
