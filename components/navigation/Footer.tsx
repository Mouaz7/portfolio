"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MouazPremiumLogo from "@/components/brand/MouazPremiumLogo";
import { useI18n } from "@/components/i18n/I18nProvider";
import { localizedPath, stripLocaleFromPathname } from "@/lib/i18n/config";

const COPYRIGHT_YEAR = 2026;
const OWNER = "Mouaz Naji";

// Phones have no room beside the copyright (Swedish already fills the row),
// so the link sits just above it, inside the footer's own padding. Being
// absolutely positioned there, it never changes the footer's height or moves
// the copyright and logo. From 676px it follows the copyright inline.
const PRIVACY_LINK_CLASS = [
  "site-footer-privacy absolute bottom-full start-0 whitespace-nowrap rounded-sm",
  "text-inherit underline-offset-2 hover:underline focus-visible:underline",
  // --navigation-accent keeps the focus ring at ≥3:1 in the light theme too.
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--navigation-accent)]",
  // An invisible larger tap area around the small text.
  "after:absolute after:-inset-x-1.5 after:-inset-y-1 after:content-['']",
  // Relative (not static) so the tap area stays around the link itself.
  "min-[676px]:relative min-[676px]:bottom-auto min-[676px]:start-auto min-[676px]:ms-2",
].join(" ");

type Props = {
  className?: string;
};

export default function Footer({ className = "" }: Props) {
  const { locale, dictionary } = useI18n();
  const pathname = usePathname();
  const onPrivacyPage = stripLocaleFromPathname(pathname ?? "/") === "/privacy";

  return (
    <footer
      className={[
        "site-footer w-full flex items-center justify-between",
        "gap-2",
        "py-3",
        "px-3",
        "max-[341px]:px-2 max-[341px]:text-[12px]",
        className,
      ].join(" ")}
    >
      <div
        className={[
          "site-footer-copy relative whitespace-nowrap text-[13px] font-medium leading-tight tracking-normal",
          "text-[var(--fg-70)] min-[676px]:text-[14px]",
        ].join(" ")}
      >
        © {COPYRIGHT_YEAR} {OWNER}. {dictionary.footer.rights}
        <span aria-hidden="true" className="hidden min-[676px]:inline ms-2">·</span>
        <Link
          href={localizedPath("/privacy", locale)}
          aria-current={onPrivacyPage ? "page" : undefined}
          className={PRIVACY_LINK_CLASS}
        >
          {dictionary.footer.privacy}
        </Link>
      </div>

      <MouazPremiumLogo size="sm" />
    </footer>
  );
}
