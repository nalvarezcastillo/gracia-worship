import type { ReactNode } from "react";

export function MainContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-7xl px-5 sm:px-7 lg:px-10 ${className}`}>
      {children}
    </div>
  );
}
