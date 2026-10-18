import React from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  lift?: boolean;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}

/** Translucent glass surface. `lift` adds the hover effect; `delay` staggers the entry animation. */
export default function GlassCard({
  as: Tag = "section",
  lift = true,
  delay = 0,
  className = "",
  children,
  style,
  ...rest
}: GlassCardProps) {
  return (
    <Tag
      className={`cd-glass cd-enter ${lift ? "cd-lift" : ""} ${className}`}
      style={{ ...style, "--cd-delay": `${delay}s` } as React.CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
