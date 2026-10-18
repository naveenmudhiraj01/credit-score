"use client";

import React, { forwardRef } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "soft"
  | "danger"
  | "danger-ghost"
  | "success"
  | "icon";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  to?: string;
  href?: string;
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
  external?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  soft: "btn-soft",
  danger: "btn-danger",
  "danger-ghost": "btn-danger-ghost",
  success: "btn-success",
  icon: "btn-icon",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "btn-md",
  lg: "btn-lg",
};

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    to,
    href,
    loading = false,
    loadingText,
    icon,
    iconRight,
    fullWidth = false,
    disabled = false,
    className = "",
    children,
    external = false,
    type = "button",
    ...rest
  },
  ref
) {
  const isLink = Boolean(to || href);
  const targetHref = to || href || "";
  const isDisabled = disabled || loading;

  const classes = [
    variantClasses[variant] || "btn-primary",
    variant !== "icon" ? sizeClasses[size] : "",
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {loading ? (
        <Spinner className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{loading && loadingText ? loadingText : children}</span>
      {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
    </>
  );

  if (isLink && !isDisabled) {
    if (external || targetHref.startsWith("http") || targetHref.startsWith("mailto:")) {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={targetHref}
          className={classes}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
        >
          {content}
        </a>
      );
    }
    return (
      <Link ref={ref as React.Ref<HTMLAnchorElement>} href={targetHref} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      className={classes}
      {...rest}
    >
      {content}
    </button>
  );
});

export default Button;
