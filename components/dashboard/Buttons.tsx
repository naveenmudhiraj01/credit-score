"use client";

import React from "react";
import Button, { ButtonProps } from "@/components/ui/Button";

export { Button };
export type { ButtonProps };

export const PrimaryButton = (props: ButtonProps) => <Button variant="primary" {...props} />;
export const SecondaryButton = (props: ButtonProps) => <Button variant="secondary" {...props} />;
export const GhostButton = (props: ButtonProps) => <Button variant="ghost" {...props} />;
export const OutlineButton = (props: ButtonProps) => <Button variant="outline" {...props} />;
export const DangerButton = (props: ButtonProps) => <Button variant="danger" {...props} />;
