import Link from "next/link";

type AppMenuRowProps = {
  disabled?: boolean;
  href: string;
  label: string;
  leadingSymbol?: string;
};

const rowStyles = "flex min-h-12 w-full items-center px-4 py-3 text-left text-base font-semibold text-white transition-colors duration-200 hover:bg-white/[0.045] hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400 active:bg-white/[0.07]";

export function AppMenuRow({ disabled = false, href, label, leadingSymbol }: AppMenuRowProps) {
  if (disabled) {
    return <span aria-disabled="true" className={`${rowStyles} cursor-not-allowed opacity-50`}>{leadingSymbol ? <span aria-hidden="true" className="mr-3 text-emerald-400">{leadingSymbol}</span> : null}{label}</span>;
  }

  return <Link href={href} className={rowStyles}>{leadingSymbol ? <span aria-hidden="true" className="mr-3 text-emerald-400">{leadingSymbol}</span> : null}{label}</Link>;
}
