import type { MouseEventHandler, ReactNode } from "react";
import Link from "next/link";

type ActionButtonProps = {
  children: ReactNode;
  className?: string;
  href?: string;
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
};

const baseStyles =
  "inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-semibold transition duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400";

const variants = {
  primary: "bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-950/25 hover:bg-emerald-300",
  secondary: "border border-white/12 bg-white/6 text-white hover:border-white/20 hover:bg-white/10",
};

function ActionButton({ children, className = "", href, type = "button", onClick, disabled = false, variant }: ActionButtonProps & { variant: keyof typeof variants }) {
  const styles = `${baseStyles} ${variants[variant]} ${className}`;

  if (href) {
    return <Link href={href} className={styles}>{children}</Link>;
  }

  return <button type={type} onClick={onClick} disabled={disabled} className={`${styles} disabled:cursor-not-allowed disabled:opacity-50`}>{children}</button>;
}

export function PrimaryButton(props: ActionButtonProps) {
  return <ActionButton {...props} variant="primary" />;
}

export function SecondaryButton(props: ActionButtonProps) {
  return <ActionButton {...props} variant="secondary" />;
}
