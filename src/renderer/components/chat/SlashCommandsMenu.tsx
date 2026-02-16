/**
 * Slash Commands Menu - Popup menu for Claude Code commands and skills
 *
 * Displays:
 * - Built-in commands (/help, /compact, /model, etc.)
 * - Custom skills from ~/.claude/skills/ and .claude/skills/
 *
 * Clicking a command inserts it into the input area (non-interactive)
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { Terminal, Search, Sparkles, FolderOpen } from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { cn } from '../../lib/utils'

interface SkillInfo {
  name: string
  description: string
  source: 'builtin' | 'user' | 'project'
  userInvocable: boolean
  modelInvocation: boolean
}

interface SlashCommandsMenuProps {
  /** Whether the menu is visible */
  isOpen: boolean
  /** Callback when a command is selected */
  onSelect: (command: string) => void
  /** Callback to close the menu */
  onClose: () => void
  /** Optional project path for scanning project skills */
  projectPath?: string
}

/**
 * Get icon for skill source
 */
function getSourceIcon(source: 'builtin' | 'user' | 'project') {
  switch (source) {
    case 'builtin':
      return <Terminal size={14} className="text-muted-foreground" />
    case 'user':
      return <Sparkles size={14} className="text-primary" />
    case 'project':
      return <FolderOpen size={14} className="text-orange-500" />
  }
}

/**
 * Get source label for tooltip
 */
function getSourceLabel(source: 'builtin' | 'user' | 'project', t: (key: string) => string) {
  switch (source) {
    case 'builtin':
      return t('Built-in command')
    case 'user':
      return t('User skill')
    case 'project':
      return t('Project skill')
  }
}

export function SlashCommandsMenu({ isOpen, onSelect, onClose, projectPath }: SlashCommandsMenuProps) {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load skills on mount
  useEffect(() => {
    if (!isOpen) return

    const loadSkills = async () => {
      setIsLoading(true)
      try {
        const result = await api.listSkills(projectPath)
        if (result.success && result.data) {
          setSkills(result.data)
        }
      } catch (error) {
        console.error('[SlashCommandsMenu] Failed to load skills:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSkills()
    setSearchQuery('')
    setSelectedIndex(0)
  }, [isOpen, projectPath])

  // Focus input when menu opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Filter skills based on search query
  const filteredSkills = useMemo(() => {
    if (!searchQuery) return skills

    const query = searchQuery.toLowerCase()
    return skills.filter(skill =>
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query)
    )
  }, [skills, searchQuery])

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredSkills])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, filteredSkills.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredSkills[selectedIndex]) {
            onSelect(`/${filteredSkills[selectedIndex].name}`)
            onClose()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredSkills, selectedIndex, onSelect, onClose])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.slash-commands-menu')) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="slash-commands-menu absolute bottom-full left-0 mb-2 w-80 max-h-96
      bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-30
      animate-fade-in">
      {/* Search input */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('Search commands...')}
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-secondary/50 rounded-lg
              focus:outline-none focus:ring-1 focus:ring-primary/30
              placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Commands list */}
      <div ref={listRef} className="overflow-y-auto max-h-72">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t('Loading...')}
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {searchQuery ? t('No commands found') : t('No commands available')}
          </div>
        ) : (
          <div className="py-1">
            {filteredSkills.map((skill, index) => (
              <button
                key={`${skill.source}-${skill.name}`}
                data-index={index}
                onClick={() => {
                  onSelect(`/${skill.name}`)
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "w-full px-3 py-2 flex items-start gap-3 text-left transition-colors",
                  index === selectedIndex
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-muted/50 text-foreground"
                )}
              >
                <div className="flex-shrink-0 mt-0.5" title={getSourceLabel(skill.source, t)}>
                  {getSourceIcon(skill.source)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-primary">
                      /{skill.name}
                    </span>
                    {!skill.userInvocable && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {t('auto')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {skill.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground flex justify-between">
        <span>{t('↑↓ Navigate')}</span>
        <span>{t('Enter to select')}</span>
        <span>{t('Esc to close')}</span>
      </div>
    </div>
  )
}
