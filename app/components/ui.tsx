"use client";

import { ReactNode } from "react";

export function Overlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh]">
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between border-b border-[#e2e0dc] px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-[#282828]">{title}</h2>
        {subtitle && <p className="text-xs text-[#606060]">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        className="rounded p-1 text-[#606060] hover:bg-[#f5f4f2]"
        aria-label="Cerrar"
      >
        ✕
      </button>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-[#606060]">{label}</span>
      {children}
    </label>
  );
}

export const inputStyle =
  "w-full rounded-md border border-[#e2e0dc] px-2.5 py-1.5 text-sm outline-none focus:border-[#e83038] bg-white";

export const inputStyleSm =
  "rounded-md border border-[#e2e0dc] px-2 py-1 text-xs outline-none focus:border-[#e83038] bg-white";

type BtnVariant = "primary" | "ghost" | "ghost-light" | "danger";

export function Button({
  variant = "ghost",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md text-sm font-medium px-3 py-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<BtnVariant, string> = {
    primary: "bg-[#e83038] text-white hover:bg-[#d12630]",
    ghost: "bg-[#282828] text-white hover:bg-[#3a3a3a]",
    "ghost-light":
      "bg-white text-[#282828] border border-[#e2e0dc] hover:bg-[#f5f4f2]",
    danger: "bg-white text-[#e83038] border border-[#e83038]/40 hover:bg-[#e83038]/5",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Notice({
  type,
  message,
}: {
  type: "error" | "success";
  message: string;
}) {
  return (
    <div
      className={`fixed bottom-4 right-4 z-[60] max-w-sm rounded-md px-4 py-3 text-sm shadow-lg ${
        type === "error" ? "bg-[#e83038] text-white" : "bg-[#282828] text-white"
      }`}
    >
      {message}
    </div>
  );
}
