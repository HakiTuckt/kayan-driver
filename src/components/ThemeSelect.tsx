import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return <Select value={theme || 'system'} onValueChange={setTheme}>
    <SelectTrigger aria-label="Appearance" className="h-9 w-[112px] rounded-xl border-border bg-card text-xs text-foreground"><SelectValue placeholder="System"/></SelectTrigger>
    <SelectContent className="rounded-xl"><SelectItem value="light"><span className="flex items-center gap-2"><Sun size={14}/> Light</span></SelectItem><SelectItem value="dark"><span className="flex items-center gap-2"><Moon size={14}/> Dark</span></SelectItem><SelectItem value="system"><span className="flex items-center gap-2"><Monitor size={14}/> System</span></SelectItem></SelectContent>
  </Select>;
}
