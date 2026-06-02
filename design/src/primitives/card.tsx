"use client";

import { Maximize2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "../tokens/cn";
import { Modal } from "./modal";

export interface CardProps {
  id?: string;
  title: string;
  subtitle?: string;
  refreshedAt?: string | null;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "default" | "warning" | "destructive" | "muted";
  /**
   * When true (default) renders a fullscreen-expand icon in the title strip;
   * clicking pops the same body content into a fullscreen Modal. Set false for
   * tiny cards where fullscreen adds nothing.
   */
  expandable?: boolean;
}

/**
 * Terminal-window framed card — title strip (terminal dots) + optional refresh
 * timestamp/actions + body. The canonical dashboard/cockpit panel. Expandable
 * by default: surfaces an expand icon that opens the same body in a fullscreen
 * Modal.
 */
export function Card({
  id,
  title,
  subtitle,
  refreshedAt,
  actions,
  children,
  className,
  tone = "default",
  expandable = true,
}: CardProps) {
  const [expanded, setExpanded] = useState(false);

  const toneClass =
    tone === "warning"
      ? "border-warning/60"
      : tone === "destructive"
        ? "border-destructive/60"
        : tone === "muted"
          ? "border-border opacity-90"
          : "border-border";

  return (
    <>
      <section
        id={id}
        className={cn(
          "terminal flex flex-col rounded-sm border scroll-mt-16",
          toneClass,
          className,
        )}
      >
        <div className="terminal-title flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="terminal-dot" aria-hidden />
            <span className="terminal-dot opacity-70" aria-hidden />
            <span className="terminal-dot opacity-50" aria-hidden />
            <span className="ml-2 truncate">{title}</span>
            {subtitle && (
              <span className="text-muted-foreground/70 ml-1 min-w-0 truncate text-[10px] tracking-normal normal-case">
                · {subtitle}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {refreshedAt && (
              <span className="text-muted-foreground/60 hidden text-[10px] tracking-normal normal-case sm:inline">
                {refreshedAt}
              </span>
            )}
            {actions}
            {expandable && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label={`expand ${title}`}
                title="expand to fullscreen"
                className="text-muted-foreground/70 hover:text-foreground inline-flex h-6 w-6 items-center justify-center rounded-sm"
              >
                <Maximize2 className="size-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 p-4 sm:p-5">{children}</div>
      </section>

      {expandable && (
        <Modal
          open={expanded}
          onOpenChange={setExpanded}
          title={title}
          {...(subtitle ? { subtitle } : {})}
          actions={
            refreshedAt ? (
              <span className="text-muted-foreground/60 hidden text-[10px] tracking-normal normal-case sm:inline">
                {refreshedAt}
              </span>
            ) : null
          }
        >
          {children}
        </Modal>
      )}
    </>
  );
}
