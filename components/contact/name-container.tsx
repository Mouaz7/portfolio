"use client";
import type { NextPage } from "next";
import React from "react";

type Props = {
  titlePlaceholder?: string;
  placeholder?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  inputRef?: React.Ref<HTMLInputElement>;
  id?: string;
  required?: boolean;
  valueForRequired?: string;
};

const NameContainer: NextPage<Props> = ({
  titlePlaceholder = "",
  placeholder = "",
  inputProps,
  inputRef,
  id,
  required = false,
  valueForRequired = "",
}) => {
  const showReq = required && !valueForRequired.trim();

  return (
    <div className="flex min-w-0 flex-col gap-2 w-full ">
      {!!titlePlaceholder && (
        <label
          htmlFor={id}
          className="relative inline-flex items-center gap-2 cursor-pointer select-none"
        >
          <b className="relative">{titlePlaceholder}</b>
          {showReq && (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="w-3 h-3 text-gray-400"
            >
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
              <line x1="12" y1="7" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="1.2" fill="currentColor" />
            </svg>
          )}
        </label>
      )}

      <div className="relative min-w-0">
        <input
          ref={inputRef}
          id={id}
          {...inputProps}
          required={required}
          className={[
            "contact-input relative border-[2px] bg-transparent",
            "w-full min-w-0 box-border [outline:none]",
            "transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300",
            "font-urbanist font-bold text-lg text-[var(--fg)] placeholder:text-gray-400",
            "h-10 rounded-xl px-4",
            inputProps?.className || "",
          ].join(" ")}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
};

export default NameContainer;
