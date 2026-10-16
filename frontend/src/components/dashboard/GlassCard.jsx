/** Translucent glass surface. `lift` adds the hover effect (hover-capable devices only); `delay` staggers the entry animation. */
export default function GlassCard({ as: Tag = "section", lift = true, delay = 0, className = "", children, ...rest }) {
  return (
    <Tag className={`cd-glass cd-enter ${lift ? "cd-lift" : ""} ${className}`} style={{ "--cd-delay": `${delay}s` }} {...rest}>
      {children}
    </Tag>
  );
}
