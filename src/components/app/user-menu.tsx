import {
  LogOut,
  Settings,
  User as UserIcon,
  CreditCard,
  LifeBuoy,
  ShieldCheck,
  Bell,
  Building2,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { usePlatformRole } from "@/shared/hooks/use-platform-role";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { docsUrl } from "@/lib/docs/links";

export function UserMenu() {
  const { user } = useAuth();
  const { data: profile } = useMyProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role } = usePlatformRole();

  const name =
    profile?.display_name ||
    profile?.full_name ||
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name ||
    user?.email?.split("@")[0] ||
    "User";
  const initial = name.slice(0, 1).toUpperCase();
  const avatarUrl = profile?.avatar_url ?? undefined;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-control pl-2 pr-1 py-2 hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="h-9 w-9">
          <AvatarImage src={avatarUrl} alt={name} />
          <AvatarFallback className="bg-gradient-accent text-sm font-semibold text-accent-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="hidden md:block text-left leading-tight">
          <div className="truncate max-w-[10rem] text-sm font-medium">{name}</div>
          <div className="truncate max-w-[10rem] text-[11px] text-muted-foreground">
            {user?.email}
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile" className="gap-2">
            <UserIcon className="h-4 w-4" /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="gap-2">
            <Settings className="h-4 w-4" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/billing" className="gap-2">
            <CreditCard className="h-4 w-4" /> Billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/organization" className="gap-2">
            <Building2 className="h-4 w-4" /> Organization
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings/notifications" className="gap-2">
            <Bell className="h-4 w-4" /> Notifications
          </Link>
        </DropdownMenuItem>
        {role === "superadmin" && (
          <DropdownMenuItem asChild>
            <Link to="/admin" className="gap-2">
              <ShieldCheck className="h-4 w-4" /> Super Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={docsUrl("support")} target="_blank" rel="noreferrer" className="gap-2">
            <LifeBuoy className="h-4 w-4" /> Help & support
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
