import { Plus, MessagesSquare, Users, Send, Zap, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "../ui/button";

export function QuickActions() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create</span>          
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Quick actions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/inbox" className="gap-2">
            <MessagesSquare className="h-4 w-4" /> New conversation
            <DropdownMenuShortcut>C</DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/contacts" className="gap-2">
            <Users className="h-4 w-4" /> Add contact
            <DropdownMenuShortcut>N</DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/campaigns" className="gap-2">
            <Send className="h-4 w-4" /> New campaign
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/automations" className="gap-2">
            <Zap className="h-4 w-4" /> New automation
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/ai-studio" className="gap-2">
            <Sparkles className="h-4 w-4 text-accent" /> Ask AI Studio
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
