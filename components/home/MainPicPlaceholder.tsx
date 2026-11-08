"use client";

import Image from "next/image";
import { useI18n } from "@/components/i18n/I18nProvider";

type Props = {
  className?: string;
  src: string;
  sizes: string;
};

export default function MainPicPlaceholder({
  className = "",
  src,
  sizes,
}: Props) {
  const { dictionary } = useI18n();

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div className="absolute inset-0">
        <Image
          src={src}
          alt={dictionary.home.portraitLabel}
          fill
          priority
          fetchPriority="high"
          sizes={sizes}
          className="pointer-events-none select-none object-contain object-bottom"
        />
      </div>
    </div>
  );
}
