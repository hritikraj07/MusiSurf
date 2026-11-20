import { Home, Search, Library } from 'lucide-react'
import { NavBar } from "@/components/ui/tubelight-navbar"

export function NavBarDemo() {
  const navItems = [
    { name: 'Home', url: '#home', icon: Home },
    { name: 'Search', url: '#search', icon: Search },
    { name: 'Library', url: '#library', icon: Library }
  ]

  return <NavBar items={navItems} className="rounded-full" />
}
