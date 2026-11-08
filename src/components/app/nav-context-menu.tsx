import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Star, StarOff, ExternalLink, Copy, ArrowRight } from "lucide-react";
import { useFavorites } from "@/shared/hooks/use-favorites";
import { notify } from "@/shared/components/notify";

/**
 * NavContextMenu — wraps any nav row. Right-click / long-press exposes
 * Pin/Unpin, Open in new tab, Copy link, Navigate to.
 */
export function NavContextMenu({
  path,
  label,
  children,
}: {
  path: string;
  label: string;
  children: React.ReactNode;
}) {
  const { isFavorite, toggle } = useFavorites();
  const navigate = useNavigate();
  const pinned = isFavorite(path);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + path);
      notify.success("Link copied");
    } catch {
      notify.error("Couldn't copy link");
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56 animate-scale-in origin-top-left">
        <ContextMenuItem onSelect={() => navigate({ to: path })}>
          <ArrowRight className="h-4 w-4" />
          Go to {label}
        </ContextMenuItem>
        <ContextMenuItem asChild>
          <a href={path} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </a>
        </ContextMenuItem>
        <ContextMenuItem onSelect={copyLink}>
          <Copy className="h-4 w-4" />
          Copy link
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => toggle(path)}>
          {pinned ? (
            <>
              <StarOff className="h-4 w-4" />
              Unpin from favorites
            </>
          ) : (
            <>
              <Star className="h-4 w-4" />
              Pin to favorites
            </>
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
