import { Link } from "react-router-dom";

function Button({ variant, size, to, href, className = "", children, ...rest }) {
  const cls = `cd-btn cd-btn--${variant} ${size === "sm" ? "cd-btn--sm" : ""} ${className}`;
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{children}</a>;
  return <button type="button" className={cls} {...rest}>{children}</button>;
}

/** Renders a <button>, a router <Link> (`to`) or an <a> (`href`) with the same look. */
export const PrimaryButton = (props) => <Button variant="primary" {...props} />;
export const SecondaryButton = (props) => <Button variant="secondary" {...props} />;
