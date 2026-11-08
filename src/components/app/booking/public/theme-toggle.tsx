import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookingTheme } from "./theme";

export function ThemeToggle({ defaultTheme = "light" }: { defaultTheme?: "light" | "dark" }) {
  const { theme, toggle } = useBookingTheme(defaultTheme);
  return (
    <Button size="icon" variant="ghost" onClick={toggle} aria-label="Toggle theme">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
